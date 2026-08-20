// Modelo: esta capa es la que conoce la tabla configuraciones_impuesto_renta.
// Recibe datos del service/controller y ejecuta las consultas SQL.
import { pool } from '../config/database.js';
import type { AppRole } from '../services/permission.service.js';

export function normalizePeriodicity(value: unknown) {
  const periodicity = String(value || '').trim().toLowerCase();
  const values: Record<string, string> = {
    anual: 'Annual', annual: 'Annual',
    anticipos: 'Advances', advances: 'Advances',
    'anual + anticipos': 'Annual + Advances',
    'annual + advances': 'Annual + Advances',
    otra: 'Other', other: 'Other'
  };
  return values[periodicity] || 'Annual';
}

export async function find(clientId: string, year: string, userCode: number, role: AppRole = 'CONTADOR') {
  // Busca la configuración del cliente y año, respetando el usuario propietario.
  const ownerFilter = role === 'ADMIN' ? '' : ' AND c.COD_USUEMP = ?';
  const params = role === 'ADMIN' ? [clientId, year] : [clientId, year, userCode];
  const [rows]: any = await pool.execute(`SELECT r.id, r.client_id AS clientId, r.fiscal_year AS year,
    r.taxpayer_type AS taxpayer, r.tax_regime AS regime, r.accounting_required AS accounting,
    r.tax_type AS taxType, r.rate, r.formula,
    CASE r.periodicity WHEN 'Annual' THEN 'Anual' WHEN 'Advances' THEN 'Anticipos'
      WHEN 'Annual + Advances' THEN 'Anual + anticipos' WHEN 'Other' THEN 'Otra'
      ELSE 'Anual' END AS periodicity, r.rules_enabled AS enabled
    FROM configuraciones_impuesto_renta r INNER JOIN clientes c ON c.id = r.client_id
    WHERE r.client_id = ? AND r.fiscal_year = ?${ownerFilter} LIMIT 1`, params);
  return rows[0] || null;
}

export async function save(clientId: string, year: string, data: any, userCode: number) {
  // Inserta o actualiza una configuración anual; luego devuelve el registro guardado.
  await pool.execute(`INSERT INTO configuraciones_impuesto_renta
    (client_id, fiscal_year, taxpayer_type, tax_regime, accounting_required, tax_type, rate, formula, periodicity, rules_enabled, created_by)
    SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? FROM clientes WHERE id = ? AND COD_USUEMP = ?
    ON DUPLICATE KEY UPDATE taxpayer_type=VALUES(taxpayer_type), tax_regime=VALUES(tax_regime), accounting_required=VALUES(accounting_required),
      tax_type=VALUES(tax_type), rate=VALUES(rate), formula=VALUES(formula), periodicity=VALUES(periodicity), rules_enabled=VALUES(rules_enabled)`,
    [clientId, year, data.taxpayer || 'Sociedad', data.regime || 'Régimen general', data.accounting === 'Sí' ? 'Yes' : 'No', data.taxType || 'Income Tax', data.rate || null, data.formula || null, normalizePeriodicity(data.periodicity), data.enabled !== false ? 1 : 0, userCode, clientId, userCode]);
  return find(clientId, year, userCode);
}
