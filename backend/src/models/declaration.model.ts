// Modelo de declaraciones mensuales: consulta declaraciones_mensuales.
// Sus valores alimentan el dashboard y la base anual del impuesto.
import { pool } from '../config/database.js';
import type { AppRole } from '../services/permission.service.js';

export async function findByPeriod(periodId: string, userCode: number, role: AppRole = 'CONTADOR') {
  const ownerFilter = role === 'ADMIN' ? '' : ' AND c.COD_USUEMP = ?';
  const params = role === 'ADMIN' ? [periodId] : [periodId, userCode];
  const [rows]: any = await pool.execute(`
    SELECT d.id, d.period_id AS periodId, d.iva_amount AS iva,
      d.iva_costs_amount AS ivaCosts, d.iva_values_amount AS ivaValues, d.employee_expense_amount AS employeeExpense, d.utility_amount AS utility, d.iva_details AS ivaDetails,
      d.iva_detail_rows AS ivaDetailRows,
      d.retention_amount AS retentions, d.income_tax_retention_amount AS incomeTaxRetention,
      d.retention_details AS retentionDetails, d.retention_detail_rows AS retentionDetailRows,
      d.iva_document_id AS ivaDocumentId, d.retention_document_id AS retentionDocumentId,
      d.registered_at AS registeredAt, di.original_name AS ivaFile, dr.original_name AS retentionFile
    FROM declaraciones_mensuales d
    INNER JOIN accounting_periods p ON p.id = d.period_id
    INNER JOIN clientes c ON c.id = p.client_id
    LEFT JOIN documentos_contables di ON di.id = d.iva_document_id
    LEFT JOIN documentos_contables dr ON dr.id = d.retention_document_id
    WHERE d.period_id = ?${ownerFilter}`, params);
  return rows[0] || null;
}

export async function findByClientYear(clientId: string, fiscalYear: string, userCode: number, role: AppRole = 'CONTADOR', months: number[] = []) {
  const ownerFilter = role === 'ADMIN' ? '' : ' AND c.COD_USUEMP = ?';
  const params: any[] = [clientId, Number(fiscalYear)];
  let monthFilter = '';
  if (months.length) { monthFilter = ` AND p.fiscal_month IN (${months.map(() => '?').join(',')})`; params.push(...months); }
  if (role !== 'ADMIN') params.push(userCode);
  const [rows]: any = await pool.execute(`
    SELECT d.id, p.id AS periodId, p.fiscal_month AS monthNum, c.business_name AS clientName,
      d.iva_amount AS iva, d.iva_costs_amount AS ivaCosts, d.iva_values_amount AS ivaValues, d.employee_expense_amount AS employeeExpense, d.utility_amount AS utility,
      d.iva_detail_rows AS ivaDetailRows, d.retention_amount AS retentions, d.income_tax_retention_amount AS incomeTaxRetention,
      d.retention_detail_rows AS retentionDetailRows
    FROM accounting_periods p
    INNER JOIN clientes c ON c.id = p.client_id
    INNER JOIN declaraciones_mensuales d ON d.period_id = p.id
    WHERE p.client_id = ? AND p.fiscal_year = ?${monthFilter}${ownerFilter}
    ORDER BY p.fiscal_month`, params);
  return rows;
}

export async function upsert(periodId: string, iva: number, retentions: number, ivaCosts: number | null, ivaValues: number | null, employeeExpense: number, utility: number | null, ivaDetails: Record<string, number> | null, ivaDetailRows: unknown[] | null, retentionDetails: Record<string, number> | null, retentionDetailRows: unknown[] | null, ivaDocumentId: number | null, retentionDocumentId: number | null, userCode: number, role: AppRole = 'CONTADOR') {
  await pool.execute(`
    INSERT INTO declaraciones_mensuales
      (period_id, iva_amount, iva_costs_amount, iva_values_amount, employee_expense_amount, utility_amount, iva_details, iva_detail_rows, retention_amount, retention_details, retention_detail_rows, iva_document_id, retention_document_id, registered_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE iva_amount = VALUES(iva_amount), retention_amount = VALUES(retention_amount),
      iva_costs_amount = COALESCE(VALUES(iva_costs_amount), iva_costs_amount),
      iva_values_amount = COALESCE(VALUES(iva_values_amount), iva_values_amount),
      employee_expense_amount = VALUES(employee_expense_amount),
      utility_amount = COALESCE(VALUES(utility_amount), utility_amount),
      iva_details = COALESCE(VALUES(iva_details), iva_details),
      iva_detail_rows = COALESCE(VALUES(iva_detail_rows), iva_detail_rows),
      retention_details = COALESCE(VALUES(retention_details), retention_details),
      retention_detail_rows = COALESCE(VALUES(retention_detail_rows), retention_detail_rows),
      iva_document_id = COALESCE(VALUES(iva_document_id), iva_document_id),
      retention_document_id = COALESCE(VALUES(retention_document_id), retention_document_id),
      registered_by = VALUES(registered_by)`,
  [periodId, iva, ivaCosts, ivaValues, employeeExpense, utility, ivaDetails ? JSON.stringify(ivaDetails) : null, ivaDetailRows ? JSON.stringify(ivaDetailRows) : null, retentions, retentionDetails ? JSON.stringify(retentionDetails) : null, retentionDetailRows ? JSON.stringify(retentionDetailRows) : null, ivaDocumentId, retentionDocumentId, userCode]);
  return findByPeriod(periodId, userCode, role);
}

export async function clearDocument(periodId: string, type: 'iva' | 'retentions', userCode: number, role: AppRole = 'CONTADOR') {
  const column = type === 'iva' ? 'iva_document_id' : 'retention_document_id';
  const ownerFilter = role === 'ADMIN' ? '' : ' AND c.COD_USUEMP = ?';
  const params = role === 'ADMIN' ? [periodId] : [periodId, userCode];
  await pool.execute(`UPDATE declaraciones_mensuales d INNER JOIN accounting_periods p ON p.id = d.period_id INNER JOIN clientes c ON c.id = p.client_id SET d.${column} = NULL WHERE d.period_id = ?${ownerFilter}`, params);
}

export async function updateEmployeeExpense(periodId: string, employeeExpense: number, userCode: number, role: AppRole = 'CONTADOR') {
  const ownerFilter = role === 'ADMIN' ? '' : ' AND c.COD_USUEMP = ?';
  const params: any[] = [employeeExpense, periodId];
  if (role !== 'ADMIN') params.push(userCode);
  await pool.execute(`UPDATE declaraciones_mensuales d INNER JOIN accounting_periods p ON p.id = d.period_id INNER JOIN clientes c ON c.id = p.client_id
    SET d.employee_expense_amount = ?, d.utility_amount = CASE WHEN d.iva_costs_amount IS NOT NULL AND d.iva_values_amount IS NOT NULL THEN ROUND(d.iva_costs_amount - d.iva_values_amount - ?, 2) ELSE d.utility_amount END
    WHERE d.period_id = ?${ownerFilter}`, [employeeExpense, employeeExpense, ...params.slice(1)]);
  return findByPeriod(periodId, userCode, role);
}

export async function updateRetention(periodId: string, retentions: number, userCode: number, role: AppRole = 'CONTADOR') {
  const ownerFilter = role === 'ADMIN' ? '' : ' AND c.COD_USUEMP = ?';
  const params: any[] = [retentions, periodId];
  if (role !== 'ADMIN') params.push(userCode);
  await pool.execute(`UPDATE declaraciones_mensuales d INNER JOIN accounting_periods p ON p.id = d.period_id INNER JOIN clientes c ON c.id = p.client_id
    SET d.retention_amount = ?
    WHERE d.period_id = ?${ownerFilter}`, params);
  return findByPeriod(periodId, userCode, role);
}

export async function updateIncomeTaxRetention(periodId: string, value: number, userCode: number, role: AppRole = 'CONTADOR') {
  const ownerFilter = role === 'ADMIN' ? '' : ' AND c.COD_USUEMP = ?';
  const params: any[] = [value, periodId];
  if (role !== 'ADMIN') params.push(userCode);
  await pool.execute(`UPDATE declaraciones_mensuales d INNER JOIN accounting_periods p ON p.id = d.period_id INNER JOIN clientes c ON c.id = p.client_id
    SET d.income_tax_retention_amount = ?
    WHERE d.period_id = ?${ownerFilter}`, params);
  return findByPeriod(periodId, userCode, role);
}
