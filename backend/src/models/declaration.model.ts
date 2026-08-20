// Modelo de declaraciones mensuales: consulta declaraciones_mensuales.
// Sus valores alimentan el dashboard y la base anual del impuesto.
import { pool } from '../config/database.js';
import type { AppRole } from '../services/permission.service.js';

export async function findByPeriod(periodId: string, userCode: number, role: AppRole = 'CONTADOR') {
  const ownerFilter = role === 'ADMIN' ? '' : ' AND c.COD_USUEMP = ?';
  const params = role === 'ADMIN' ? [periodId] : [periodId, userCode];
  const [rows]: any = await pool.execute(`
    SELECT d.id, d.period_id AS periodId, d.iva_amount AS iva, d.retention_amount AS retentions,
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

export async function upsert(periodId: string, iva: number, retentions: number, ivaDocumentId: number | null, retentionDocumentId: number | null, userCode: number, role: AppRole = 'CONTADOR') {
  await pool.execute(`
    INSERT INTO declaraciones_mensuales
      (period_id, iva_amount, retention_amount, iva_document_id, retention_document_id, registered_by)
    VALUES (?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE iva_amount = VALUES(iva_amount), retention_amount = VALUES(retention_amount),
      iva_document_id = COALESCE(VALUES(iva_document_id), iva_document_id),
      retention_document_id = COALESCE(VALUES(retention_document_id), retention_document_id),
      registered_by = VALUES(registered_by)`,
  [periodId, iva, retentions, ivaDocumentId, retentionDocumentId, userCode]);
  return findByPeriod(periodId, userCode, role);
}

export async function clearDocument(periodId: string, type: 'iva' | 'retentions', userCode: number, role: AppRole = 'CONTADOR') {
  const column = type === 'iva' ? 'iva_document_id' : 'retention_document_id';
  const ownerFilter = role === 'ADMIN' ? '' : ' AND c.COD_USUEMP = ?';
  const params = role === 'ADMIN' ? [periodId] : [periodId, userCode];
  await pool.execute(`UPDATE declaraciones_mensuales d INNER JOIN accounting_periods p ON p.id = d.period_id INNER JOIN clientes c ON c.id = p.client_id SET d.${column} = NULL WHERE d.period_id = ?${ownerFilter}`, params);
}
