import { execFile } from 'node:child_process';
import fs from 'node:fs';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

function numberValue(value: string) {
  const normalized = value.replace(/\s/g, '').replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(',', '.');
  const parsed = Number(normalized.replace(/[^\d.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function findAmount(text: string, labels: string[]) {
  const pattern = new RegExp(`(?:${labels.join('|')})[^\\d]{0,80}([\\d.,]+)`, 'i');
  const match = text.match(pattern);
  return match ? numberValue(match[1]) : 0;
}

function currencyValues(text: string) {
  return [...text.matchAll(/\$\s*([\d.,]+)/g)].map(match => numberValue(match[1]));
}

async function extractText(filePath: string) {
  const commands = process.platform === 'win32' ? ['pdftotext.exe', 'C:\\Program Files\\Git\\mingw64\\bin\\pdftotext.exe'] : ['pdftotext'];
  let lastError: unknown;
  for (const command of commands) {
    try { return (await execFileAsync(command, ['-layout', filePath, '-'], { maxBuffer: 8 * 1024 * 1024 })).stdout; }
    catch (error) { lastError = error; }
  }
  throw new Error(`No se pudo leer el PDF: ${String(lastError)}`);
}

export async function parsePortfolioPdf(filePath: string) {
  if (!fs.existsSync(filePath)) throw new Error('Archivo PDF no encontrado');
  const text = await extractText(filePath);
  const normalized = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  // Este formato es un estado de cuenta de clientes: sus valores son saldos
  // pendientes, no una declaración tributaria. No se buscan IVA/retenciones
  // porque esas palabras pueden aparecer dentro de nombres como RIVAS.
  if (/ESTADO DE CUENTA CLIENTES/i.test(normalized) && /PENDIENTE/i.test(normalized)) {
    // En este reporte el último importe impreso corresponde al TOTAL oficial.
    // Los importes de detalle ya están incluidos en ese total y no deben sumarse otra vez.
    const amounts = currencyValues(normalized);
    const pendingAmount = amounts.at(-1) || 0;
    const clientCount = (normalized.match(/^\s*\d+\s+\d{10,13}\s+/gm) || []).length;
    if (!clientCount || !pendingAmount) throw new Error('El estado de cuenta no contiene clientes o saldos pendientes reconocibles');
    const row = {
      sourceRowNumber: 1,
      transactionDate: null,
      thirdPartyIdentification: null,
      thirdPartyName: 'Estado de cuenta de clientes',
      documentType: 'Estado de cuenta',
      documentNumber: null,
      description: `${clientCount} clientes con saldos pendientes`,
      subtotal: 0,
      taxAmount: 0,
      retentionAmount: 0,
      totalAmount: pendingAmount,
      paidAmount: 0,
      pendingAmount,
      paymentStatus: 'pending',
      validationStatus: 'valid',
      validationMessage: null,
      rawData: { extractedFrom: 'PDF', format: 'customer-account-statement', clientCount }
    } as const;
    return {
      sheetName: 'PDF',
      headerRow: 1,
      columns: ['Identificación', 'Cliente', 'Saldo pendiente'],
      rows: [row],
      errors: [],
      totals: { subtotal: 0, taxAmount: 0, retentionAmount: 0, totalAmount: pendingAmount, pendingAmount }
    };
  }

  const columns: string[] = [];
  if (/(?:ventas|facturacion|facturación)/i.test(normalized)) columns.push('Ventas');
  if (/(?:compras|adquisiciones)/i.test(normalized)) columns.push('Compras');
  if (/iva/i.test(normalized)) columns.push('IVA');
  if (/retencion|retención/i.test(normalized)) columns.push('Retenciones');
  if (/(?:saldo|pendiente|por cobrar|por pagar)/i.test(normalized)) columns.push('Saldo pendiente');
  const subtotal = findAmount(normalized, ['subtotal', 'ventas', 'compras', 'base imponible']);
  const taxAmount = findAmount(normalized, ['iva', 'impuesto']);
  const retentionAmount = findAmount(normalized, ['retenciones', 'retencion']);
  const totalAmount = findAmount(normalized, ['total', 'total factura', 'total ventas', 'total compras']) || subtotal + taxAmount;
  const pendingAmount = findAmount(normalized, ['saldo pendiente', 'saldo', 'pendiente', 'por cobrar', 'por pagar']);
  if (!columns.length || (!subtotal && !taxAmount && !retentionAmount && !totalAmount && !pendingAmount)) {
    throw new Error('El PDF no contiene etiquetas o valores reconocibles de CxC/CxP');
  }
  const row = {
    sourceRowNumber: 1,
    transactionDate: null,
    thirdPartyIdentification: null,
    thirdPartyName: null,
    documentType: 'Resumen PDF',
    documentNumber: null,
    description: 'Resumen extraído del documento PDF',
    subtotal, taxAmount, retentionAmount, totalAmount,
    paidAmount: Math.max(totalAmount - pendingAmount, 0),
    pendingAmount,
    paymentStatus: pendingAmount <= 0 && totalAmount > 0 ? 'paid' : pendingAmount > 0 ? 'pending' : 'unknown',
    validationStatus: 'valid',
    validationMessage: null,
    rawData: { extractedFrom: 'PDF', labels: columns }
  } as const;
  return { sheetName: 'PDF', headerRow: 1, columns, rows: [row], errors: [], totals: { subtotal, taxAmount, retentionAmount, totalAmount, pendingAmount } };
}
