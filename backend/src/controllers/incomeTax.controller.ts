// Controller del impuesto a la renta: recibe la petición HTTP y devuelve JSON.
// Los datos llegan desde req.params (cliente/año) y req.body (configuración).
import type { Request, Response } from 'express';
import { pool } from '../config/database.js';
import * as incomeTax from '../models/incomeTax.model.js';
import type { AppRole } from '../services/permission.service.js';

// Comprueba que el cliente pertenece al usuario autenticado antes de consultar o guardar.
async function ownsClient(clientId: string, userCode: number, role: AppRole) {
  const ownerFilter = role === 'ADMIN' ? '' : ' AND COD_USUEMP = ?';
  const params = role === 'ADMIN' ? [clientId] : [clientId, userCode];
  const [rows]: any = await pool.execute(`SELECT id FROM clientes WHERE id = ?${ownerFilter} AND disabled_at IS NULL LIMIT 1`, params);
  return Boolean(rows.length);
}

export async function getIncomeTax(req: Request, res: Response) {
  // Consulta la configuración anual y suma IVA/retenciones de las declaraciones del año.
  const clientId = String(req.params.id); const year = String(req.params.year);
  if (!await ownsClient(clientId, req.user!.codigo, req.user!.role)) return res.status(404).json({ ok: false, error: 'Cliente no encontrado' });
  const month = Number(req.query.month);
  const monthFilter = Number.isInteger(month) && month >= 1 && month <= 12 ? ' AND p.fiscal_month <= ?' : '';
  const params = [clientId, year, ...(monthFilter ? [month] : [])];
  const [rows]: any = await pool.execute(`SELECT COALESCE(SUM(dm.iva_amount),0) AS iva, COALESCE(SUM(dm.retention_amount),0) AS retentions,
    COALESCE(SUM(dm.iva_costs_amount),0) AS sales, COALESCE(SUM(dm.iva_values_amount),0) AS costs,
    COALESCE(SUM(dm.iva_costs_amount - dm.iva_values_amount - COALESCE(dm.employee_expense_amount, 0)),0) AS utility
    FROM declaraciones_mensuales dm INNER JOIN accounting_periods p ON p.id = dm.period_id WHERE p.client_id = ? AND p.fiscal_year = ?${monthFilter}`, params);
  const [monthly]: any = await pool.execute(`SELECT p.fiscal_month AS month,
      COALESCE(SUM(dm.iva_amount),0) AS iva,
      COALESCE(SUM(dm.retention_amount),0) AS retentions,
      COALESCE(SUM(dm.iva_costs_amount),0) AS sales, COALESCE(SUM(dm.iva_values_amount),0) AS costs,
      COALESCE(SUM(dm.iva_costs_amount - dm.iva_values_amount - COALESCE(dm.employee_expense_amount, 0)),0) AS utility
    FROM declaraciones_mensuales dm INNER JOIN accounting_periods p ON p.id = dm.period_id
    WHERE p.client_id = ? AND p.fiscal_year = ?${monthFilter}
    GROUP BY p.fiscal_month ORDER BY p.fiscal_month`, params);
  return res.json({ ok: true, data: { configuration: await incomeTax.find(clientId, year, req.user!.codigo, req.user!.role), base: rows[0], monthly } });
}

export async function saveIncomeTax(req: Request, res: Response) {
  // Guarda la configuración y, cuando createPeriods=true, abre los 12 meses del año.
  const clientId = String(req.params.id); const year = String(req.params.year);
  if (!await ownsClient(clientId, req.user!.codigo, req.user!.role)) return res.status(404).json({ ok: false, error: 'Cliente no encontrado' });
  if (req.body?.createPeriods === true) {
    const fiscalYear = Number(req.body.apertureYear || year);
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [latestRows]: any = await connection.execute('SELECT MAX(fiscal_year) AS latestYear FROM accounting_periods WHERE client_id = ?', [clientId]);
      const latestYear = latestRows[0]?.latestYear == null ? null : Number(latestRows[0].latestYear);
      if (latestYear !== null && fiscalYear !== latestYear + 1) throw new Error(`Solo puedes aperturar el año siguiente: ${latestYear + 1}`);
      const [existing]: any = await connection.execute('SELECT id FROM accounting_periods WHERE client_id = ? AND fiscal_year = ? LIMIT 1', [clientId, fiscalYear]);
      if (existing.length) throw new Error('El año fiscal ya está aperturado');
      const data = req.body;
      await connection.execute(`INSERT INTO configuraciones_impuesto_renta
        (client_id, fiscal_year, taxpayer_type, tax_regime, accounting_required, tax_type, rate, formula, periodicity, rules_enabled, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE taxpayer_type=VALUES(taxpayer_type), tax_regime=VALUES(tax_regime), accounting_required=VALUES(accounting_required), tax_type=VALUES(tax_type), rate=VALUES(rate), formula=VALUES(formula), periodicity=VALUES(periodicity), rules_enabled=VALUES(rules_enabled)`,
        [clientId, fiscalYear, data.taxpayer || 'Sociedad', data.regime || 'Régimen general', data.accounting === 'Sí' ? 'Yes' : 'No', data.taxType || 'Income Tax', data.rate || null, data.formula || null, incomeTax.normalizePeriodicity(data.periodicity), data.enabled !== false ? 1 : 0, req.user!.codigo]);
      await connection.execute('INSERT INTO configuraciones_periodos (client_id, fiscal_year, frequency) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE frequency = VALUES(frequency)', [clientId, fiscalYear, 'Mensual']);
      const values = Array.from({ length: 12 }, (_, index) => [clientId, fiscalYear, index + 1]).flat();
      await connection.execute(`INSERT INTO accounting_periods (client_id, fiscal_year, fiscal_month) VALUES ${Array.from({ length: 12 }, () => '(?, ?, ?)').join(',')}`, values);
      await connection.commit();
      return res.status(201).json({ ok: true, data: await incomeTax.find(clientId, String(fiscalYear), req.user!.codigo) });
    } catch (error: any) {
      await connection.rollback();
      return res.status(400).json({ ok: false, error: error?.message || 'No se pudo crear el año fiscal' });
    } finally { connection.release(); }
  }
  return res.json({ ok: true, data: await incomeTax.save(clientId, year, req.body, req.user!.codigo) });
}
