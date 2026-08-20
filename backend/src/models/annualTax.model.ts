// Modelo de declaraciones anuales del Impuesto a la Renta.
// Esta capa solo consulta y modifica declaraciones_anuales; no recibe req/res.
// Las reglas de negocio y la coordinación del flujo deben vivir en services/controllers.
import { pool } from '../config/database.js';

// Busca la declaración anual de un cliente y año, verificando que el cliente
// pertenezca al usuario autenticado mediante COD_USUEMP.
export async function findByClientYear(clientId: string, fiscalYear: string, userCode: number) {
  const [rows]: any = await pool.execute(`
    SELECT a.id,
      a.client_id AS clientId,
      a.income_tax_config_id AS incomeTaxConfigId,
      a.fiscal_year AS fiscalYear,
      a.accumulated_base AS accumulatedBase,
      a.rate,
      a.calculated_tax AS calculatedTax,
      a.status,
      a.due_date AS dueDate,
      a.presentation_date AS presentationDate,
      a.paid_amount AS paidAmount,
      a.payment_date AS paymentDate,
      a.annual_document_id AS annualDocumentId,
      a.created_by AS createdBy,
      a.created_at AS createdAt,
      a.updated_at AS updatedAt
    FROM declaraciones_anuales a
    INNER JOIN clientes c ON c.id = a.client_id
    WHERE a.client_id = ?
      AND a.fiscal_year = ?
      AND c.COD_USUEMP = ?
    LIMIT 1`, [clientId, fiscalYear, userCode]);
  return rows[0] || null;
}

export async function findById(declarationId: string, userCode: number) {
  const [rows]: any = await pool.execute(`
    SELECT a.id, a.client_id AS clientId, a.fiscal_year AS fiscalYear,
      a.status, a.annual_document_id AS annualDocumentId
    FROM declaraciones_anuales a
    INNER JOIN clientes c ON c.id = a.client_id
    WHERE a.id = ? AND c.COD_USUEMP = ?
    LIMIT 1`, [declarationId, userCode]);
  return rows[0] || null;
}

// Calcula la base acumulada en tiempo real desde las declaraciones mensuales.
// Este valor no reemplaza la base congelada que se guarda al cerrar el año.
export async function getAccumulatedBase(clientId: string, fiscalYear: string, userCode: number) {
  const [rows]: any = await pool.execute(`
    SELECT COALESCE(SUM(dm.iva_amount), 0) AS iva,
      COALESCE(SUM(dm.retention_amount), 0) AS retentions,
      COALESCE(SUM(dm.iva_amount + dm.retention_amount), 0) AS accumulatedBase
    FROM declaraciones_mensuales dm
    INNER JOIN accounting_periods p ON p.id = dm.period_id
    INNER JOIN clientes c ON c.id = p.client_id
    WHERE p.client_id = ?
      AND p.fiscal_year = ?
      AND c.COD_USUEMP = ?`, [clientId, fiscalYear, userCode]);
  const row = rows[0] || {};
  return {
    iva: Number(row.iva || 0),
    retentions: Number(row.retentions || 0),
    total: Number(row.accumulatedBase || 0)
  };
}

// El documento anual se guarda asociado al primer periodo del año, porque
// documentos_contables conserva la relación obligatoria con accounting_periods.
export async function findFirstPeriod(clientId: string, fiscalYear: string, userCode: number) {
  const [rows]: any = await pool.execute(`
    SELECT p.id
    FROM accounting_periods p
    INNER JOIN clientes c ON c.id = p.client_id
    WHERE p.client_id = ? AND p.fiscal_year = ? AND c.COD_USUEMP = ?
    ORDER BY p.fiscal_month ASC
    LIMIT 1`, [clientId, fiscalYear, userCode]);
  return rows[0]?.id || null;
}

// Crea el registro anual en estado acumulando. La restricción UNIQUE
// client_id + fiscal_year evita dos declaraciones para el mismo año.
export async function create(clientId: string, fiscalYear: string, configId: string, rate: number, userCode: number) {
  await pool.execute(`
    INSERT INTO declaraciones_anuales
      (client_id, income_tax_config_id, fiscal_year, rate, created_by)
    SELECT ?, ?, ?, ?, ?
    FROM clientes
    WHERE id = ? AND COD_USUEMP = ?`,
    [clientId, configId, fiscalYear, rate, userCode, clientId, userCode]);
  return findByClientYear(clientId, fiscalYear, userCode);
}

// Congela la base acumulada y guarda el resultado del cálculo anual.
// El service debe calcular dueDate y enviar ambos valores ya validados.
export async function close(
  declarationId: string,
  accumulatedBase: number,
  calculatedTax: number,
  dueDate: string | null,
  userCode: number
) {
  const [result]: any = await pool.execute(`
    UPDATE declaraciones_anuales a
    INNER JOIN clientes c ON c.id = a.client_id
    SET a.accumulated_base = ?,
        a.calculated_tax = ?,
        a.due_date = ?,
        a.status = 'calculada'
    WHERE a.id = ? AND c.COD_USUEMP = ?
      AND a.status = 'acumulando'`,
    [accumulatedBase, calculatedTax, dueDate, declarationId, userCode]);
  return Number(result.affectedRows || 0);
}

// Vincula el PDF del Formulario 101 y cambia la declaración a presentada.
export async function attachDocument(declarationId: string, documentId: string, userCode: number) {
  const [result]: any = await pool.execute(`
    UPDATE declaraciones_anuales a
    INNER JOIN clientes c ON c.id = a.client_id
    SET a.annual_document_id = ?,
        a.presentation_date = CURRENT_TIMESTAMP,
        a.status = 'presentada'
    WHERE a.id = ? AND c.COD_USUEMP = ?
      AND a.status = 'calculada'`,
    [documentId, declarationId, userCode]);
  return Number(result.affectedRows || 0);
}

// Registra el pago únicamente después de haber presentado la declaración.
export async function registerPayment(
  declarationId: string,
  paidAmount: number,
  paymentDate: string,
  userCode: number
) {
  const [result]: any = await pool.execute(`
    UPDATE declaraciones_anuales a
    INNER JOIN clientes c ON c.id = a.client_id
    SET a.paid_amount = ?,
        a.payment_date = ?,
        a.status = 'pagada'
    WHERE a.id = ? AND c.COD_USUEMP = ?
      AND a.status = 'presentada'
      AND a.annual_document_id IS NOT NULL`,
    [paidAmount, paymentDate, declarationId, userCode]);
  return Number(result.affectedRows || 0);
}
