import crypto from 'node:crypto';
import { pool } from '../config/database.js';
import type { AppRole } from '../services/permission.service.js';

export type ClientInput = { ruc: string; idType?: string; name: string; owner: string; email: string; phone: string; clientStatus?: string; taxRegime?: string; taxpayerType?: string; accounting?: string; frequency?: string };

const selectClient = `SELECT id, ruc_cedula AS ruc,
  identification_type AS idType,
  business_name AS name, responsible AS owner,
  email, phone, CASE status WHEN 'Active' THEN 'Activo' ELSE 'Inactivo' END AS clientStatus,
  COALESCE((SELECT cp.frequency FROM configuraciones_periodos cp WHERE cp.client_id = clientes.id ORDER BY cp.fiscal_year DESC LIMIT 1), 'Mensual') AS frequency,
  tax_regime AS taxRegime, taxpayer_type AS taxpayerType, CASE accounting_required WHEN 'Yes' THEN 'Sí' ELSE 'No' END AS accounting,
  disabled_at AS disabledAt, disabled_by AS disabledBy,
  COD_USUEMP AS userCode,
  (SELECT u.NOM_USUEMP FROM usuarios u WHERE u.COD_USUEMP = clientes.COD_USUEMP LIMIT 1) AS assignedUser,
  created_at AS createdAt FROM clientes`;

function scope(role: AppRole, userCode: number, prefix = '') {
  // ADMIN consulta globalmente; los demás roles quedan limitados a COD_USUEMP.
  return role === 'ADMIN' ? { sql: '', params: [] as number[] } : { sql: ` AND ${prefix}COD_USUEMP = ?`, params: [userCode] };
}

export async function findAll(userCode: number, role: AppRole) {
  const s = scope(role, userCode);
  const [rows] = await pool.execute(`${selectClient} WHERE disabled_at IS NULL${s.sql} ORDER BY created_at DESC`, s.params);
  return rows;
}

export async function findDisabled(userCode: number, role: AppRole) {
  const s = scope(role, userCode);
  const [rows] = await pool.execute(`${selectClient} WHERE disabled_at IS NOT NULL${s.sql} ORDER BY disabled_at DESC`, s.params);
  return rows;
}

export async function findById(id: string, userCode: number, role: AppRole = 'CONTADOR') {
  const s = scope(role, userCode);
  const [rows] = await pool.execute(`${selectClient} WHERE id = ?${s.sql} LIMIT 1`, [id, ...s.params]);
  return (rows as Record<string, unknown>[])[0] || null;
}

export async function create(data: ClientInput, userCode: number, role: AppRole, assignedUserCode?: number) {
  const id = crypto.randomUUID();
  await pool.execute(`INSERT INTO clientes
    (id, ruc_cedula, identification_type, business_name, responsible, email, phone, status, tax_regime, taxpayer_type, accounting_required, COD_USUEMP)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [id, data.ruc, (data as any).idType || 'ruc', data.name, data.owner, data.email, data.phone,
      data.clientStatus === 'Inactivo' ? 'Inactive' : 'Active', data.taxRegime || 'General regime',
      data.taxpayerType || 'Sociedad', data.accounting === 'No' ? 'No' : 'Yes', role === 'ADMIN' && assignedUserCode ? assignedUserCode : userCode]);
  return findById(id, userCode, role);
}

export async function update(id: string, data: ClientInput, userCode: number, role: AppRole) {
  const s = scope(role, userCode);
  await pool.execute(`UPDATE clientes SET ruc_cedula = ?, identification_type = ?, business_name = ?, responsible = ?, email = ?, phone = ?, status = ?, tax_regime = ?, taxpayer_type = ?, accounting_required = ? WHERE id = ?${s.sql}`,
    [data.ruc, (data as any).idType || 'ruc', data.name, data.owner, data.email, data.phone, data.clientStatus === 'Inactivo' ? 'Inactive' : 'Active', data.taxRegime || 'General regime', data.taxpayerType || 'Sociedad', data.accounting === 'No' ? 'No' : 'Yes', id, ...s.params]);
  return findById(id, userCode, role);
}

export async function remove(id: string, userCode: number, role: AppRole) {
  const s = scope(role, userCode);
  const [result] = await pool.execute(`UPDATE clientes SET disabled_at = CURRENT_TIMESTAMP, disabled_by = ? WHERE id = ?${s.sql} AND disabled_at IS NULL`, [userCode, id, ...s.params]);
  return (result as { affectedRows?: number }).affectedRows === 1;
}

export async function restore(id: string, userCode: number, role: AppRole) {
  const s = scope(role, userCode);
  const [result] = await pool.execute(`UPDATE clientes SET disabled_at = NULL, disabled_by = NULL, status = 'Active' WHERE id = ?${s.sql} AND disabled_at IS NOT NULL`, [id, ...s.params]);
  return (result as { affectedRows?: number }).affectedRows === 1;
}
