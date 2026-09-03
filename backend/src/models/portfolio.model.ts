import { pool } from '../config/database.js';

export async function createLoad(periodId: string, documentId: string, accountType: 'CXC' | 'CXP') {
  const [result]: any = await pool.execute('INSERT INTO cxc_cxp_cargas (period_id, document_id, account_type, status) VALUES (?, ?, ?, \'processing\')', [periodId, documentId, accountType]);
  return String(result.insertId);
}

export async function saveRows(loadId: string, rows: any[], userId: number) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    for (const row of rows) {
      await connection.execute(`INSERT INTO cxc_cxp_movimientos
        (carga_id, source_row_number, transaction_date, third_party_identification, third_party_name, document_type, document_number, description,
         total_amount, paid_amount, pending_amount, payment_status, validation_status, validation_message, raw_data)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [loadId, row.sourceRowNumber, row.transactionDate, row.thirdPartyIdentification, row.thirdPartyName, row.documentType, row.documentNumber, row.description,
        row.totalAmount, row.paidAmount, row.pendingAmount, row.paymentStatus, row.validationStatus, row.validationMessage, JSON.stringify(row.rawData)]);
    }
    const valid = rows.filter(row => row.validationStatus === 'valid').length;
    const errors = rows.length - valid;
    await connection.execute(`UPDATE cxc_cxp_cargas SET status = ?, total_rows = ?, valid_rows = ?, error_rows = ?, processed_at = CURRENT_TIMESTAMP, processed_by = ? WHERE id = ?`, [errors ? 'processed' : 'validated', rows.length, valid, errors, userId, loadId]);
    await connection.commit();
    return { totalRows: rows.length, validRows: valid, errorRows: errors };
  } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
}

export async function findByPeriod(periodId: string) {
  const [rows]: any = await pool.execute(`SELECT l.id, l.account_type AS accountType, l.status, l.total_rows AS totalRows, l.valid_rows AS validRows, l.error_rows AS errorRows,
    l.created_at AS createdAt, l.processed_at AS processedAt, d.id AS documentId, d.original_name AS originalName, d.version, d.file_size AS fileSize,
    d.delivery_status AS deliveryStatus, d.uploaded_by AS uploadedBy,
    COALESCE(SUM(m.total_amount), 0) AS totalAmount, COALESCE(SUM(m.pending_amount), 0) AS pendingAmount, COUNT(m.id) AS movementCount
    FROM cxc_cxp_cargas l INNER JOIN documentos_contables d ON d.id = l.document_id
    LEFT JOIN cxc_cxp_movimientos m ON m.carga_id = l.id
    WHERE l.period_id = ? GROUP BY l.id ORDER BY l.created_at DESC`, [periodId]);
  return rows;
}

export async function summaryByClientYear(clientId: string, fiscalYear: string) {
  const [rows]: any = await pool.execute(`SELECT l.account_type AS accountType, p.fiscal_month AS fiscalMonth,
    0 AS subtotal, 0 AS taxAmount, 0 AS retentionAmount,
    COALESCE(SUM(m.total_amount), 0) AS totalAmount,
    COALESCE(SUM(m.pending_amount), 0) AS pendingAmount, COUNT(m.id) AS movementCount
    FROM cxc_cxp_cargas l INNER JOIN cxc_cxp_movimientos m ON m.carga_id = l.id INNER JOIN accounting_periods p ON p.id = l.period_id
    WHERE p.client_id = ? AND p.fiscal_year = ?
      AND NOT EXISTS (
        SELECT 1 FROM cxc_cxp_cargas newer
        WHERE newer.period_id = l.period_id
          AND newer.account_type = l.account_type
          AND (newer.created_at > l.created_at OR (newer.created_at = l.created_at AND newer.id > l.id))
      )
    GROUP BY l.account_type, p.fiscal_month ORDER BY p.fiscal_month, l.account_type`, [clientId, fiscalYear]);
  return rows;
}
