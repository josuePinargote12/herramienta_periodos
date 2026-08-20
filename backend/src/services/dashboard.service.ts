// Service del dashboard: combina datos de varios modelos y aplica reglas de negocio.
// No recibe directamente la petición HTTP; el controller le entrega clientId, año y usuario.
import { pool } from '../config/database.js';
import * as clientModel from '../models/client.model.js';
import * as periodModel from '../models/period.model.js';
import * as documentModel from '../models/document.model.js';
import * as incomeTaxModel from '../models/incomeTax.model.js';

type Indicator = { status: 'entregado' | 'pendiente' | 'declarado' | 'calculado' | 'presentada' | 'acumulando' | 'no_aplica'; version?: number | null; amount?: number };

export async function getClientDashboard(clientId: string, year: string, userCode: number, role: any = 'CONTADOR') {
  // Obtiene cliente, períodos, documentos y configuración en paralelo para formar el resumen.
  const client = await clientModel.findById(clientId, userCode, role);
  if (!client) return null;

  const [periods, documents, taxConfig, annualRows] = await Promise.all([
    periodModel.ensureAndFindAll(userCode, role, year, clientId),
    documentModel.findByClient(clientId, userCode, role),
    incomeTaxModel.find(clientId, year, userCode),
    pool.execute(`SELECT status FROM declaraciones_anuales WHERE client_id = ? AND fiscal_year = ? LIMIT 1`, [clientId, year])
  ]);
  const annualStatus = (annualRows as any)[0]?.[0]?.status || 'acumulando';

  const [declarationRows]: any = await pool.execute(`
    SELECT d.period_id AS periodId, d.iva_amount AS iva, d.retention_amount AS retentions,
      d.iva_document_id AS ivaDocumentId, d.retention_document_id AS retentionDocumentId
    FROM declaraciones_mensuales d
    INNER JOIN accounting_periods p ON p.id = d.period_id
    INNER JOIN clientes c ON c.id = p.client_id
    WHERE p.client_id = ? AND p.fiscal_year = ? AND c.COD_USUEMP = ?`, [clientId, year, userCode]);

  const declarations = new Map(declarationRows.map((row: any) => [String(row.periodId), row]));
  const docsByPeriod = new Map<string, any[]>();
  documents.forEach((doc: any) => {
    const list = docsByPeriod.get(String(doc.periodId)) || [];
    list.push(doc);
    docsByPeriod.set(String(doc.periodId), list);
  });

  const periodicity = String(taxConfig?.periodicity || '').toLowerCase();
  const taxApplies = taxConfig?.enabled !== false && !['exento / no aplica', 'exempt', 'none'].includes(periodicity);
  const isMonthlyTax = periodicity.includes('mensual') || periodicity.includes('monthly') || periodicity.includes('anticip');
  const rate = Number(taxConfig?.rate || 0);

  const months: Array<{ periodId: string; month: string; monthNum: number; indicators: Record<string, Indicator>; compliancePercentage: number }> = periods.map((period: any) => {
    const periodDocs = docsByPeriod.get(String(period.id)) || [];
    const declaration: any = declarations.get(String(period.id));
    const financialDocs = periodDocs.filter(doc => doc.documentGroup === 'Financial Statements');
    const portfolioDocs = periodDocs.filter(doc => doc.documentGroup === 'Portfolio');
    const latest = (items: any[]) => items.length ? Math.max(...items.map(item => Number(item.version) || 0)) : null;
    const ivaDeclared = declaration?.ivaDocumentId != null || declaration?.iva != null && Number(declaration.iva) > 0;
    const retentionDeclared = declaration?.retentionDocumentId != null || declaration?.retentions != null && Number(declaration.retentions) > 0;
    const taxAmount = (Number(declaration?.iva || 0) + Number(declaration?.retentions || 0)) * rate / 100;
    const tax: Indicator = !taxApplies ? { status: 'no_aplica' } : isMonthlyTax
      ? { status: declaration ? 'calculado' : 'pendiente', amount: Number(taxAmount.toFixed(2)) }
      : { status: annualStatus === 'presentada' ? 'presentada' : annualStatus === 'calculada' ? 'calculado' : 'acumulando', amount: 0 };

    const indicators: Record<string, Indicator> = {
      financialStatements: { status: financialDocs.length ? 'entregado' : 'pendiente', version: latest(financialDocs) },
      portfolio: { status: portfolioDocs.length ? 'entregado' : 'pendiente', version: latest(portfolioDocs) },
      iva: { status: ivaDeclared ? 'declarado' : 'pendiente', amount: Number(declaration?.iva || 0) },
      retentions: { status: retentionDeclared ? 'declarado' : 'pendiente', amount: Number(declaration?.retentions || 0) },
      incomeTax: tax
    };
    const applicable = Object.values(indicators).filter(item => item.status !== 'no_aplica');
    const completed = applicable.filter(item => ['entregado', 'declarado', 'calculado'].includes(item.status)).length;
    return { periodId: period.id, month: period.month, monthNum: period.monthNum, indicators, compliancePercentage: applicable.length ? Math.round(completed / applicable.length * 100) : 100 };
  });

  const alerts = months.flatMap((month) => Object.entries(month.indicators).flatMap(([key, value]: [string, Indicator]) => {
    if (value.status !== 'pendiente') return [];
    const severity = Number(month.monthNum) < new Date().getMonth() + 1 ? 'alta' : Number(month.monthNum) === new Date().getMonth() + 1 ? 'media' : 'baja';
    return [{ month: month.month, monthNum: month.monthNum, indicator: key, severity, message: `${key} pendiente en ${month.month}` }];
  }));
  const total = months.reduce((sum: number, month) => sum + month.compliancePercentage, 0);
  return { client, year: Number(year), months, summary: { compliancePercentage: months.length ? Math.round(total / months.length) : 0, totalMonths: months.length, pendingAlerts: alerts.length }, alerts };
}
