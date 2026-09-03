import { pool } from '../config/database.js';
import * as auditModel from './audit.model.js';
import type { AppRole } from '../services/permission.service.js';

function owner(role: AppRole, userId: number, alias = 'c') {
  // Evita que un contador descargue o modifique documentos de otro contador.
  // ADMIN no recibe esta condición y puede operar globalmente.
  return role === 'ADMIN' ? { sql: '', params: [] as number[] } : { sql: ` AND ${alias}.COD_USUEMP = ?`, params: [userId] };
}

export async function create(periodId: string, group: string, type: string, file: { originalname: string; filename: string; path: string; mimetype: string; size: number }, userId: number) {
  const normalizedType = group === 'Portfolio'
    ? (['CXC', 'receivable'].includes(type) ? 'CXC' : ['CXP', 'payable'].includes(type) ? 'CXP' : type)
    : type;
  const versionTypes = normalizedType === 'CXC' ? ['CXC', 'receivable'] : normalizedType === 'CXP' ? ['CXP', 'payable'] : [normalizedType];
  const placeholders = versionTypes.map(() => '?').join(',');
  const [versions]: any = await pool.execute(`SELECT COALESCE(MAX(version), 0) + 1 AS nextVersion FROM documentos_contables WHERE period_id = ? AND document_group = ? AND document_type IN (${placeholders})`, [periodId, group, ...versionTypes]);
  const version = Number(versions[0].nextVersion);
  const [result]: any = await pool.execute(`INSERT INTO documentos_contables (period_id, document_group, document_type, version, original_name, stored_name, file_path, mime_type, file_size, uploaded_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [periodId, group, normalizedType, version, file.originalname, file.filename, file.path, file.mimetype, file.size, userId]);
  const [periodRows]: any = await pool.execute('SELECT client_id AS clientId FROM accounting_periods WHERE id = ? LIMIT 1', [periodId]);
  await auditModel.record({ clientId: periodRows[0]?.clientId, periodId, documentId: result.insertId, action: 'document.uploaded', details: { group, type: normalizedType, version, name: file.originalname }, userId });
  return { id: result.insertId, version, type: normalizedType, name: file.originalname };
}

export async function ownsPeriod(periodId: string, userId: number, role: AppRole) {
  const s = owner(role, userId);
  const [rows]: any = await pool.execute(`SELECT p.id FROM accounting_periods p INNER JOIN clientes c ON c.id = p.client_id WHERE p.id = ?${s.sql} AND c.disabled_at IS NULL LIMIT 1`, [periodId, ...s.params]);
  return rows.length > 0;
}

export async function findByPeriod(periodId: string, userId: number, role: AppRole) {
  const s = owner(role, userId);
  const [rows]: any = await pool.execute(`SELECT d.id, d.document_group AS documentGroup,
    d.document_type AS documentType, d.version, d.original_name AS originalName,
    d.file_size AS fileSize, d.file_path AS filePath, d.mime_type AS mimeType, d.uploaded_at AS uploadedAt,
    d.uploaded_by AS uploadedBy, d.delivery_status AS deliveryStatus
    FROM documentos_contables d
    INNER JOIN accounting_periods p ON p.id = d.period_id
    INNER JOIN clientes c ON c.id = p.client_id
    WHERE d.period_id = ?${s.sql} AND c.disabled_at IS NULL
    ORDER BY d.document_group, d.document_type, d.version DESC`, [periodId, ...s.params]);
  return rows;
}

export async function findByClient(clientId: string, userId: number, role: AppRole) {
  const s = owner(role, userId);
  const [rows]: any = await pool.execute(`SELECT d.period_id AS periodId,
    d.id, d.document_group AS documentGroup, d.document_type AS documentType,
    d.version, d.original_name AS originalName, d.file_size AS fileSize,
    d.uploaded_at AS uploadedAt, d.uploaded_by AS uploadedBy,
    d.delivery_status AS deliveryStatus
    FROM documentos_contables d
    INNER JOIN accounting_periods p ON p.id = d.period_id
    INNER JOIN clientes c ON c.id = p.client_id
    WHERE p.client_id = ?${s.sql} AND c.disabled_at IS NULL
    ORDER BY d.period_id, d.document_group, d.document_type, d.version DESC`, [clientId, ...s.params]);
  return rows;
}

export async function findFile(documentId: string, userId: number, role: AppRole) {
  const s = owner(role, userId);
  const [rows]: any = await pool.execute(`SELECT d.original_name AS originalName,
    d.file_path AS filePath, d.mime_type AS mimeType
    FROM documentos_contables d
    INNER JOIN accounting_periods p ON p.id = d.period_id
    INNER JOIN clientes c ON c.id = p.client_id
    WHERE d.id = ?${s.sql} LIMIT 1`, [documentId, ...s.params]);
  return rows[0] || null;
}

export async function updateDeliveryStatus(documentId: string, status: string, userId: number, role: AppRole) {
  const s = owner(role, userId);
  const values: Record<string, string> = { Pendiente: 'Pending', Enviado: 'Sent', Entregado: 'Delivered' };
  const dbStatus = values[status] || status;
  if (!['Pending', 'Sent', 'Delivered'].includes(dbStatus)) return null;
  const [rows]: any = await pool.execute(`SELECT d.period_id AS periodId, p.client_id AS clientId
    FROM documentos_contables d INNER JOIN accounting_periods p ON p.id = d.period_id
    INNER JOIN clientes c ON c.id = p.client_id
    WHERE d.id = ?${s.sql} LIMIT 1`, [documentId, ...s.params]);
  if (!rows[0]) return null;
  await pool.execute('UPDATE documentos_contables SET delivery_status = ? WHERE id = ?', [dbStatus, documentId]);
  await auditModel.record({ clientId: rows[0].clientId, periodId: rows[0].periodId, documentId, action: 'document.delivery_status_changed', details: { status: dbStatus }, userId });
  return { documentId, deliveryStatus: status };
}

export async function getPeriodOwner(periodId: string, userId: number, role: AppRole) {
  const s = owner(role, userId);
  const [rows]: any = await pool.execute(`SELECT p.id AS periodId, p.client_id AS clientId
    FROM accounting_periods p INNER JOIN clientes c ON c.id = p.client_id
    WHERE p.id = ?${s.sql} AND c.disabled_at IS NULL LIMIT 1`, [periodId, ...s.params]);
  return rows[0] || null;
}

export async function deleteOwned(documentId: string, userId: number, role: AppRole) {
  const s = owner(role, userId);
  const [rows]: any = await pool.execute(`SELECT d.file_path AS filePath FROM documentos_contables d INNER JOIN accounting_periods p ON p.id = d.period_id INNER JOIN clientes c ON c.id = p.client_id WHERE d.id = ?${s.sql} LIMIT 1`, [documentId, ...s.params]);
  if (!rows[0]) return null;
  await pool.execute('DELETE FROM documentos_contables WHERE id = ?', [documentId]);
  return rows[0];
}
