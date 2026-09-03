import { pool } from '../config/database.js';
import * as auditModel from './audit.model.js';
import type { AppRole } from '../services/permission.service.js';

const statusToDb: Record<string, string> = {
  Pendiente: 'Pending', 'En proceso': 'In Progress', Completado: 'Completed'
};
const statusFromDb: Record<string, string> = {
  Pending: 'Pendiente', 'In Progress': 'En proceso', Completed: 'Completado'
};

export type PeriodFrequency = 'Mensual';

function normalizeFrequency(value?: string): PeriodFrequency {
  return 'Mensual';
}

const select = `SELECT p.id, p.client_id AS clientId, c.ruc_cedula AS clientRuc,
  c.business_name AS clientName, c.responsible AS owner, p.fiscal_year AS year,
  p.fiscal_month AS monthNum, cp.frequency, p.status, p.created_at AS createdAt,
  p.updated_at AS updatedAt, p.completed_at AS completedAt, p.shared_at AS sharedAt,
  p.shared_comment AS sharedComment,
  EXISTS (SELECT 1 FROM documentos_contables d WHERE d.period_id = p.id AND d.document_group = 'Financial Statements') AS financialDocuments,
  EXISTS (SELECT 1 FROM documentos_contables d WHERE d.period_id = p.id AND d.document_group = 'Portfolio') AS accountDocuments
  ,EXISTS (SELECT 1 FROM declaraciones_mensuales dm WHERE dm.period_id = p.id) AS declarationDocuments,
  p.portfolio_reviewed AS portfolioReviewed
  FROM accounting_periods p INNER JOIN clientes c ON c.id = p.client_id
  LEFT JOIN configuraciones_periodos cp ON cp.client_id = p.client_id AND cp.fiscal_year = p.fiscal_year`;

export async function getFrequency(clientId: string, fiscalYear: number): Promise<PeriodFrequency> {
  const [rows]: any = await pool.execute(`SELECT frequency FROM configuraciones_periodos
    WHERE client_id = ? AND fiscal_year <= ? ORDER BY fiscal_year DESC LIMIT 1`, [clientId, fiscalYear]);
  return normalizeFrequency(rows[0]?.frequency);
}

export async function saveFrequency(clientId: string, fiscalYear: number, frequency?: string) {
  const normalized = normalizeFrequency(frequency);
  await pool.execute(`INSERT INTO configuraciones_periodos (client_id, fiscal_year, frequency)
    VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE frequency = VALUES(frequency)`, [clientId, fiscalYear, normalized]);
  return normalized;
}

export async function createForClient(clientId: string, fiscalYear = new Date().getFullYear(), frequency?: string) {
  const normalized = await saveFrequency(clientId, fiscalYear, frequency || await getFrequency(clientId, fiscalYear));
  const months = Array.from({ length: 12 }, (_, index) => index + 1);
  const values = months.flatMap(month => [clientId, fiscalYear, month]);
  await pool.execute(`INSERT IGNORE INTO accounting_periods (client_id, fiscal_year, fiscal_month)
    VALUES ${months.map(() => '(?, ?, ?)').join(',')}`, values);
}

export async function createSinglePeriod(clientId: string, fiscalYear: number, fiscalMonth: number, frequency?: string) {
  const normalized = await saveFrequency(clientId, fiscalYear, frequency || 'Mensual');
  await pool.execute(`INSERT IGNORE INTO accounting_periods (client_id, fiscal_year, fiscal_month) VALUES (?, ?, ?)`, [clientId, fiscalYear, fiscalMonth]);
  const [rows]: any = await pool.execute(`${select} WHERE p.client_id = ? AND p.fiscal_year = ? AND p.fiscal_month = ? LIMIT 1`, [clientId, fiscalYear, fiscalMonth]);
  return rows[0] ? { ...mapRow(rows[0]), frequency: normalized } : null;
}

function mapRow(row: any) {
  const month = new Date(2000, Number(row.monthNum) - 1, 1).toLocaleString('es-ES', { month: 'long' });
  const frequency = normalizeFrequency(row.frequency);
  const monthName = month[0].toUpperCase() + month.slice(1);
  // Impuesto a la Renta es opcional: el cierre mensual depende solo de los
  // tres módulos operativos obligatorios.
  const requiredCompleted = [row.financialDocuments, row.accountDocuments, row.declarationDocuments]
    .filter(Boolean).length;
  const derivedStatus = row.status === 'Completed'
    ? 'Completed'
    : requiredCompleted === 3
    ? 'Completed'
    : requiredCompleted > 0
      ? 'In Progress'
      : 'Pending';
  return { ...row, id: String(row.id), year: String(row.year), frequency,
    periodStatus: statusFromDb[row.status] || row.status,
    isOpen: row.status !== 'Completed',
    documents: { financial: Boolean(row.financialDocuments), accounts: Boolean(row.accountDocuments || row.portfolioReviewed), declarations: Boolean(row.declarationDocuments) },
    month: monthName,
    status: statusFromDb[derivedStatus] || derivedStatus,
    sharedComment: row.sharedComment || '' };
}

export async function ensureAndFindAll(userCode: number, role: AppRole, year?: string, clientId?: string) {
  // El filtro de propietario solo se agrega para CONTADOR; ADMIN ve todos.
  const params: any[] = [];
  let where = ' WHERE c.disabled_at IS NULL';
  if (role !== 'ADMIN') { where += ' AND c.COD_USUEMP = ?'; params.push(userCode); }
  if (year) { where += ' AND p.fiscal_year = ?'; params.push(Number(year)); }
  if (clientId) { where += ' AND p.client_id = ?'; params.push(clientId); }
  const [rows]: any = await pool.execute(`${select}${where} ORDER BY c.business_name, p.fiscal_month`, params);
  return rows.map(mapRow);
}

export async function findById(id: string, userCode: number, role: AppRole) {
  const ownerFilter = role === 'ADMIN' ? '' : ' AND c.COD_USUEMP = ?';
  const params = role === 'ADMIN' ? [id] : [id, userCode];
  const [rows]: any = await pool.execute(`${select} WHERE p.id = ?${ownerFilter} LIMIT 1`, params);
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function findYears(userCode: number, role: AppRole, clientId?: string) {
  const params: any[] = [];
  const clientFilter = clientId ? ' AND p.client_id = ?' : '';
  if (clientId) params.push(clientId);
  const ownerFilter = role === 'ADMIN' ? '' : ' AND c.COD_USUEMP = ?';
  if (role !== 'ADMIN') params.unshift(userCode);
  const [rows]: any = await pool.execute(`SELECT DISTINCT p.fiscal_year AS year
    FROM accounting_periods p INNER JOIN clientes c ON c.id = p.client_id
    WHERE c.disabled_at IS NULL${ownerFilter}${clientFilter} ORDER BY p.fiscal_year DESC`, params);
  return rows.map((row: any) => String(row.year));
}

export async function update(id: string, status: string, userCode: number, role: AppRole) {
  const dbStatus = statusToDb[status];
  if (!dbStatus) return null;
  const ownerFilter = role === 'ADMIN' ? '' : ' AND c.COD_USUEMP = ?';
  const updateParams = role === 'ADMIN' ? [dbStatus, id] : [dbStatus, id, userCode];
  const [result]: any = await pool.execute(`UPDATE accounting_periods p INNER JOIN clientes c ON c.id = p.client_id
    SET p.status = ?, p.completed_at = ${dbStatus === 'Completed' ? 'CURRENT_TIMESTAMP' : 'NULL'}
    WHERE p.id = ?${ownerFilter}`, updateParams);
  if (!result.affectedRows) return null;
  const [rows]: any = await pool.execute(`${select} WHERE p.id = ?`, [id]);
  if (!rows[0]) return null;
  await auditModel.record({ clientId: rows[0].clientId, periodId: id, action: 'period.status_changed', details: { status }, userId: userCode });
  return mapRow(rows[0]);
}

export async function markPortfolioReviewed(id: string, userCode: number, role: AppRole) {
  const ownerFilter = role === 'ADMIN' ? '' : ' AND c.COD_USUEMP = ?';
  const params = role === 'ADMIN' ? [id] : [id, userCode];
  const [result]: any = await pool.execute(`UPDATE accounting_periods p INNER JOIN clientes c ON c.id = p.client_id
    SET p.portfolio_reviewed = 1
    WHERE p.id = ?${ownerFilter} AND c.disabled_at IS NULL`, params);
  if (!result.affectedRows) return null;
  const [rows]: any = await pool.execute(`${select} WHERE p.id = ?`, [id]);
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function share(id: string, userCode: number, role: AppRole, comment = '') {
  const ownerFilter = role === 'ADMIN' ? '' : ' AND c.COD_USUEMP = ?';
  const params = role === 'ADMIN' ? [id] : [id, userCode];
  const [rows]: any = await pool.execute(`SELECT p.client_id AS clientId, p.status,
    EXISTS (SELECT 1 FROM documentos_contables d WHERE d.period_id = p.id AND d.document_group = 'Financial Statements') AS financialDocuments,
    EXISTS (SELECT 1 FROM documentos_contables d WHERE d.period_id = p.id AND d.document_group = 'Portfolio') AS accountDocuments,
    EXISTS (SELECT 1 FROM declaraciones_mensuales dm WHERE dm.period_id = p.id) AS declarationDocuments
    FROM accounting_periods p INNER JOIN clientes c ON c.id = p.client_id
    WHERE p.id = ?${ownerFilter} AND c.disabled_at IS NULL LIMIT 1`, params);
  const completedByModules = rows[0] && [rows[0].financialDocuments, rows[0].accountDocuments, rows[0].declarationDocuments].filter(Boolean).length === 3;
  if (!rows[0] || (rows[0].status !== 'Completed' && !completedByModules)) return null;
  await pool.execute('UPDATE accounting_periods SET shared_at = CURRENT_TIMESTAMP, shared_by = ?, shared_comment = ? WHERE id = ?', [userCode, comment, id]);
  await auditModel.record({ clientId: rows[0].clientId, periodId: id, action: 'period.shared', userId: userCode });
  const [updated]: any = await pool.execute('SELECT shared_at AS sharedAt, shared_by AS sharedBy FROM accounting_periods WHERE id = ?', [id]);
  return updated[0] || null;
}
