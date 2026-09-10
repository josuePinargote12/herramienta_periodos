import * as XLSX from 'xlsx';

type ParsedRow = {
  sourceRowNumber: number;
  transactionDate: string | null;
  thirdPartyIdentification: string | null;
  thirdPartyName: string | null;
  documentType: string | null;
  documentNumber: string | null;
  description: string | null;
  subtotal: number;
  taxAmount: number;
  retentionAmount: number;
  totalAmount: number;
  paidAmount: number;
  pendingAmount: number;
  paymentStatus: 'pending' | 'partial' | 'paid' | 'unknown';
  validationStatus: 'valid' | 'warning' | 'error';
  validationMessage: string | null;
  rawData: Record<string, unknown>;
};

const aliases: Record<string, string[]> = {
  transactionDate: ['fecha', 'fecha emision', 'fecha emisión', 'fecha factura', 'fecha vencimiento', 'fecha de vencimiento', 'vencimiento', 'date'],
  thirdPartyIdentification: ['ruc', 'cedula', 'cédula', 'identificacion', 'identificación', 'ruc proveedor', 'ruc cliente'],
  thirdPartyName: ['cliente', 'proveedor', 'razon social', 'razón social', 'nombre', 'tercero'],
  documentType: ['tipo comprobante', 'tipo documento', 'comprobante', 'document type'],
  documentNumber: ['numero', 'número', 'no comprobante', 'nro comprobante', 'secuencial', 'document number'],
  description: ['detalle', 'descripcion', 'descripción', 'concepto', 'observacion', 'observación'],
  subtotal: ['subtotal', 'base imponible', 'valor sin iva', 'valor neto'],
  taxAmount: ['iva', 'impuesto', 'iva generado', 'tax'],
  retentionAmount: ['retencion', 'retención', 'retenciones', 'withholding'],
  totalAmount: ['total', 'total factura', 'valor total', 'total amount'],
  paidAmount: ['pagado', 'abonado', 'cobrado', 'valor pagado'],
  pendingAmount: ['pendiente', 'saldo', 'saldo pendiente', 'por cobrar', 'por pagar']
};

function normalize(value: unknown) {
  return String(value ?? '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
}

function numberValue(value: unknown) {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const text = String(value).replace(/\s/g, '').replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(',', '.');
  const parsed = Number(text.replace(/[^\d.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function dateValue(value: unknown) {
  if (!value) return null;
  if (typeof value === 'number') {
    const date = XLSX.SSF.parse_date_code(value);
    return date ? `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}` : null;
  }
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function findHeaderRow(rows: unknown[][]) {
  let best = { index: -1, score: 0 };
  rows.slice(0, 30).forEach((row, index) => {
    const values = row.map(normalize);
    const score = Object.values(aliases).reduce((total, names) => total + (values.some(value => names.includes(value)) ? 1 : 0), 0);
    if (score > best.score) best = { index, score };
  });
  if (best.index < 0 || best.score < 2) throw new Error('No se encontraron encabezados reconocibles. El Excel debe incluir columnas como Fecha, Cliente/Proveedor, Total o Saldo.');
  return best;
}

function columnMap(header: unknown[]) {
  const result: Record<string, number> = {};
  header.forEach((value, index) => {
    const name = normalize(value);
    for (const [field, names] of Object.entries(aliases)) if (names.includes(name) && result[field] === undefined) result[field] = index;
  });
  return result;
}

function textAt(row: unknown[], map: Record<string, number>, field: string) {
  const index = map[field];
  return index === undefined || row[index] === undefined || row[index] === '' ? null : String(row[index]).trim();
}

export function parsePortfolioWorkbook(filePath: string) {
  const workbook = XLSX.readFile(filePath, { cellDates: false, raw: true });
  const sheets = workbook.SheetNames;
  if (!sheets.length) throw new Error('El archivo no contiene hojas de cálculo');
  const sheetName = sheets[0];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], { header: 1, defval: null, raw: true });
  const headerInfo = findHeaderRow(rows);
  const map = columnMap(rows[headerInfo.index]);
  if (!['subtotal', 'taxAmount', 'totalAmount', 'pendingAmount'].some(field => map[field] !== undefined)) {
    throw new Error('El archivo no contiene columnas monetarias reconocibles. No subas el informe de cierre; usa el Excel detallado de CxC o CxP.');
  }
  const parsed: ParsedRow[] = [];
  const errors: string[] = [];

  rows.slice(headerInfo.index + 1).forEach((row, offset) => {
    if (!row.some(value => value !== null && String(value).trim() !== '')) return;
    const sourceRowNumber = headerInfo.index + offset + 2;
    const subtotal = numberValue(row[map.subtotal]);
    const taxAmount = numberValue(row[map.taxAmount]);
    const retentionAmount = numberValue(row[map.retentionAmount]);
    const totalAmount = map.totalAmount === undefined ? subtotal + taxAmount : numberValue(row[map.totalAmount]);
    const paidAmount = numberValue(row[map.paidAmount]);
    const pendingAmount = map.pendingAmount === undefined ? Math.max(totalAmount - paidAmount, 0) : numberValue(row[map.pendingAmount]);
    const messages: string[] = [];
    if (!textAt(row, map, 'thirdPartyName') && !textAt(row, map, 'thirdPartyIdentification')) messages.push('Falta cliente/proveedor');
    if (!totalAmount && !subtotal && !pendingAmount) messages.push('No existe un valor monetario');
    const status = pendingAmount <= 0 && totalAmount > 0 ? 'paid' : paidAmount > 0 ? 'partial' : totalAmount > 0 ? 'pending' : 'unknown';
    const validationStatus = messages.length ? 'warning' : 'valid';
    if (messages.length) errors.push(`Fila ${sourceRowNumber}: ${messages.join(', ')}`);
    const rawData: Record<string, unknown> = {};
    (rows[headerInfo.index] || []).forEach((header, index) => { if (header !== null && header !== '') rawData[String(header)] = row[index]; });
    parsed.push({
      sourceRowNumber,
      transactionDate: dateValue(row[map.transactionDate]),
      thirdPartyIdentification: textAt(row, map, 'thirdPartyIdentification'),
      thirdPartyName: textAt(row, map, 'thirdPartyName'),
      documentType: textAt(row, map, 'documentType'),
      documentNumber: textAt(row, map, 'documentNumber'),
      description: textAt(row, map, 'description'),
      subtotal, taxAmount, retentionAmount, totalAmount, paidAmount, pendingAmount,
      paymentStatus: status,
      validationStatus,
      validationMessage: messages.length ? messages.join('; ') : null,
      rawData
    });
  });
  if (!parsed.length) throw new Error('No se encontraron filas de movimientos después de los encabezados');
  const totals = parsed.reduce((result, row) => ({
    subtotal: result.subtotal + row.subtotal,
    taxAmount: result.taxAmount + row.taxAmount,
    retentionAmount: result.retentionAmount + row.retentionAmount,
    totalAmount: result.totalAmount + row.totalAmount,
    pendingAmount: result.pendingAmount + row.pendingAmount
  }), { subtotal: 0, taxAmount: 0, retentionAmount: 0, totalAmount: 0, pendingAmount: 0 });
  return { sheetName, headerRow: headerInfo.index + 1, columns: Object.keys(map), rows: parsed, errors, totals };
}
