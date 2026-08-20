import { pool } from '../config/database.js';
import type { AppRole } from '../services/permission.service.js';

export async function record(input: {
  clientId?: string | null;
  periodId?: string | null;
  documentId?: string | number | null;
  action: string;
  details?: Record<string, unknown>;
  userId: number;
}) {
  await pool.execute(`INSERT INTO accounting_audit_log
    (client_id, period_id, document_id, action, details, user_id)
    VALUES (?, ?, ?, ?, ?, ?)`, [
    input.clientId || null,
    input.periodId || null,
    input.documentId || null,
    input.action,
    input.details ? JSON.stringify(input.details) : null,
    input.userId
  ]);
}

// Consulta el historial respetando el alcance del usuario. ADMIN ve todo;
// CONTADOR solo ve eventos de clientes asignados a su código.
export async function findAll(userId: number, role: AppRole) {
  const scope = role === 'ADMIN' ? '' : ' AND c.COD_USUEMP = ?';
  const params = role === 'ADMIN' ? [] : [userId];
  const [rows]: any = await pool.execute(`
    SELECT a.id, a.action, a.details, a.created_at AS createdAt,
           a.client_id AS clientId, a.period_id AS periodId,
           a.document_id AS documentId, a.user_id AS userId,
           COALESCE(u.NOM_USUEMP, 'Usuario del sistema') AS userName,
           c.business_name AS clientName, c.ruc_cedula AS clientRuc
    FROM accounting_audit_log a
    LEFT JOIN usuarios u ON u.COD_USUEMP = a.user_id
    LEFT JOIN clientes c ON c.id = a.client_id
    WHERE 1 = 1${scope}
    ORDER BY a.created_at DESC, a.id DESC
    LIMIT 500`, params);
  return rows.map((row: any) => ({
    ...row,
    details: typeof row.details === 'string' ? JSON.parse(row.details || '{}') : (row.details || {})
  }));
}
