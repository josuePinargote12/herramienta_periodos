/**
 * Lector de archivos PDF de CxC y CxP.
 *
 * Este servicio no modifica la base de datos. Su única responsabilidad es
 * convertir el texto de un PDF en una estructura común de movimientos que el
 * controller pueda validar y guardar.
 *
 * El PDF puede llegar en dos formatos principales:
 * 1. Estado de cuenta de clientes: devuelve saldos pendientes por cliente.
 * 2. Resumen general de cartera: devuelve totales como ventas, IVA o saldo.
 */
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** Convierte importes con formato latino o anglosajón a un número seguro. */
function numberValue(value: string) {
  const normalized = value.replace(/\s/g, '').replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(',', '.');
  const parsed = Number(normalized.replace(/[^\d.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Busca el primer importe que aparezca después de alguna etiqueta conocida. */
function findAmount(text: string, labels: string[]) {
  const pattern = new RegExp(`(?:${labels.join('|')})[^\\d]{0,80}([\\d.,]+)`, 'i');
  const match = text.match(pattern);
  return match ? numberValue(match[1]) : 0;
}

/** Obtiene todos los importes precedidos por el símbolo de dólar. */
function currencyValues(text: string) {
  return [...text.matchAll(/\$\s*([\d.,]+)/g)].map(match => numberValue(match[1]));
}

/**
 * Obtiene números del documento cuando no se imprimieron con símbolo de dólar.
 * Se ignoran los años de cuatro dígitos para no confundirlos con importes.
 */
function numericAmounts(text: string) {
  const currency = currencyValues(text);
  if (currency.length) return currency;
  return [...text.matchAll(/\b\d+(?:[.,]\d+)?\b/g)]
    .map(match => match[0])
    .filter(value => !/^\d{4}$/.test(value))
    .map(numberValue);
}

/** Normaliza encabezados para comparar texto con y sin tildes. */
function normalizeHeader(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase().replace(/IDENTIFICACI[^A-Z0-9]N/g, 'IDENTIFICACION').replace(/\s+/g, ' ');
}

const REQUIRED_CUSTOMER_HEADERS = {
  identification: ['IDENTIFICACION'],
  client: ['CLIENTE'],
  pending: ['PENDIENTE']
};

const CUSTOMER_DATE_HEADERS = ['FECHA', 'VENCIMIENTO', 'FECHA VENCIMIENTO', 'FECHA EMISION', 'FECHA DOCUMENTO'];

/**
 * Encuentra la fila de encabezados del estado de cuenta y guarda la posición
 * de las columnas que necesitamos para leer las filas posteriores.
 */
function findCustomerHeaders(text: string) {
  const lines = text.split(/\r?\n/);
  const headerLine = lines.find(line => {
    const normalized = normalizeHeader(line);
    return Object.values(REQUIRED_CUSTOMER_HEADERS).every(names => names.some(name => normalized.includes(name)));
  });
  if (!headerLine) {
    const normalized = normalizeHeader(text);
    const missing = Object.entries(REQUIRED_CUSTOMER_HEADERS)
      .filter(([, names]) => !names.some(name => normalized.includes(name)))
      .map(([name]) => ({ identification: 'IDENTIFICACION', client: 'CLIENTE', pending: 'PENDIENTE' } as Record<string, string>)[name] || name.toUpperCase());
    throw new Error(`El estado de cuenta no contiene las columnas obligatorias: ${missing.join(', ')}`);
  }
  const normalized = normalizeHeader(headerLine);
  const dateHeader = CUSTOMER_DATE_HEADERS.find(name => normalized.includes(name));
  const positionOf = (names: string[]) => names.map(name => normalized.indexOf(name)).find(position => position >= 0) ?? -1;
  return {
    headerLine,
    hasDate: Boolean(dateHeader),
    dateHeader,
    positions: {
      identification: positionOf(REQUIRED_CUSTOMER_HEADERS.identification),
      client: positionOf(REQUIRED_CUSTOMER_HEADERS.client),
      pending: positionOf(REQUIRED_CUSTOMER_HEADERS.pending),
      date: dateHeader ? normalized.indexOf(dateHeader) : -1
    }
  };
}

/** Convierte una fecha en formato AAAA-MM-DD o DD-MM-AAAA a Date. */
function parseReportDate(value: string) {
  const match = value.match(/(\d{4})[-/](\d{2})[-/](\d{2})|(\d{2})[-/](\d{2})[-/](\d{4})/);
  if (!match) return null;
  const year = Number(match[1] || match[6]);
  const month = Number(match[2] || match[5]);
  const day = Number(match[3] || match[4]);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
}

/** Obtiene la fecha de corte usada para calcular la antigüedad de saldos. */
function cutoffDate(text: string) {
  const match = text.match(/FECHA\s+CORTE\s*:?[\s-]*(\d{4}[-/]\d{2}[-/]\d{2}|\d{2}[-/]\d{2}[-/]\d{4})/i);
  return match ? parseReportDate(match[1]) || new Date() : new Date();
}

/**
 * Construye la respuesta estándar cuando el PDF contiene un total agregado o
 * cuando no fue posible identificar cada cliente individualmente.
 */
function customerStatementResult(pendingAmount: number, clientCount: number, rows: any[] = [], aging: any = null) {
  return {
    sheetName: 'PDF',
    headerRow: 1,
    columns: ['Identificación', 'Cliente', 'Saldo pendiente'],
    rows: rows.length ? rows : [{
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
    }],
    errors: [],
    totals: { subtotal: 0, taxAmount: 0, retentionAmount: 0, totalAmount: pendingAmount, pendingAmount },
    aging
  };
}

/**
 * Parser alternativo para estados de cuenta donde cada fila contiene fecha,
 * identificación, nombre y saldo en una sola línea.
 */
function parseDatedCustomerStatement(text: string, headerInfo: { headerLine: string; positions: { identification: number; client: number; pending: number; date: number } }) {
  const cutoff = cutoffDate(text);
  const rows: any[] = [];
  const aging = { '0-30': 0, '31-60': 0, '61-90': 0, over90: 0, withoutDate: 0 };
  const lines = text.split(/\r?\n/);

  // Se separan clientes e importes porque algunos extractores PDF rompen las
  // columnas en líneas distintas. Luego se emparejan por orden de aparición.
  const clients: any[] = [];
  const amounts: number[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Una fila válida normalmente comienza con un número de fila.
    if (/^\s*\d+\s+/.test(line)) {
      const identification = line.match(/\b\d{10,13}\b/);
      if (identification) {
        const date = parseReportDate(line);
        const clientStart = headerInfo.positions.client >= 0 ? headerInfo.positions.client : 0;
        let clientEnd = headerInfo.positions.pending > clientStart ? headerInfo.positions.pending : line.length;
        let cleanName = line.slice(clientStart, clientEnd);
        const dollarIdx = cleanName.indexOf('$');
        if (dollarIdx !== -1) cleanName = cleanName.substring(0, dollarIdx);

        cleanName = cleanName
          .replace(/\d{4}[-/]\d{2}[-/]\d{2}|\d{2}[-/]\d{2}[-/]\d{4}/g, '')
          .replace(/[\s|]+$/g, '')
          .trim();

        clients.push({
          sourceRowNumber: i + 1,
          identification: identification[0],
          name: cleanName || null,
          date: date
        });
      }
    }

    // Se recogen todos los importes de la línea para poder asociarlos a los
    // clientes detectados posteriormente.
    const amtMatches = line.match(/\$\s*[\d.,]+/g);
    if (amtMatches) {
        for (const amt of amtMatches) {
            amounts.push(Number(amt.replace(/[$\s,]/g, '')));
        }
    }
  }

  // Si hay más clientes que importes, solo se procesan pares completos.
  const count = Math.min(clients.length, amounts.length);
  for (let i = 0; i < count; i++) {
    const client = clients[i];
    const pendingAmount = amounts[i];

    const row = {
      sourceRowNumber: client.sourceRowNumber,
      transactionDate: client.date ? client.date.toISOString().slice(0, 10) : null,
      thirdPartyIdentification: client.identification,
      thirdPartyName: client.name,
      documentType: 'Estado de cuenta',
      documentNumber: null,
      description: 'Saldo pendiente extraído del estado de cuenta',
      subtotal: 0, taxAmount: 0, retentionAmount: 0,
      totalAmount: pendingAmount, paidAmount: 0, pendingAmount,
      paymentStatus: 'pending', validationStatus: 'valid', validationMessage: null,
      rawData: { extractedFrom: 'PDF', format: 'customer-account-statement', header: headerInfo.headerLine }
    };
    rows.push(row);
    // Clasifica el saldo según los días transcurridos desde la fecha del
    // documento hasta la fecha de corte.
    if (!client.date) aging.withoutDate += pendingAmount;
    else {
      const days = Math.max(0, Math.floor((cutoff.getTime() - client.date.getTime()) / 86400000));
      if (days <= 30) aging['0-30'] += pendingAmount;
      else if (days <= 60) aging['31-60'] += pendingAmount;
      else if (days <= 90) aging['61-90'] += pendingAmount;
      else aging.over90 += pendingAmount;
    }
  }

  const total = rows.reduce((sum, row) => sum + row.pendingAmount, 0);
  if (!rows.length) throw new Error('El estado de cuenta con fecha no contiene filas reconocibles');
  return customerStatementResult(total, rows.length, rows, { ...aging, cutoff: cutoff.toISOString().slice(0, 10) });
}

/**
 * Ejecuta pdftotext. En Windows se prueban primero el ejecutable del PATH y
 * después la ubicación habitual de Git; en Linux/macOS se usa pdftotext.
 *
 * -layout conserva la posición de las columnas.
 * -raw facilita el análisis de filas cuando el PDF tiene texto tabular.
 */
async function extractText(filePath: string, raw = false) {
  const commands = process.platform === 'win32' ? ['pdftotext.exe', 'C:\\Program Files\\Git\\mingw64\\bin\\pdftotext.exe'] : ['pdftotext'];
  let lastError: unknown;
  for (const command of commands) {
    try { return (await execFileAsync(command, [raw ? '-raw' : '-layout', filePath, '-'], { maxBuffer: 8 * 1024 * 1024 })).stdout; }
    catch (error) { lastError = error; }
  }
  throw new Error(`No se pudo leer el PDF: ${String(lastError)}`);
}

/**
 * Lee estados de cuenta con filas multilínea:
 * identificación + nombre en una línea y saldo/fecha en líneas siguientes.
 */
function parseCustomerStatementRows(text: string, headerInfo: { headerLine: string }) {
  const rows: any[] = [];
  const lines = text.split(/\r?\n/);
  let current: { sourceRowNumber: number; identification: string; nameLines: string[]; pendingAmount: number | null } | null = null;
  let reportedTotal: number | null = null;
  const rowPattern = /^\s*\d+\s+(\d{10,13})\s+(.+?)\s*$/;
  const amountPattern = /\$\s*([\d.,]+)/;

  // Cierra el cliente actual y crea una fila normalizada cuando ya se conoce
  // su saldo pendiente.
  const finish = () => {
    if (!current || current.pendingAmount == null) return;
    const name = current.nameLines.join(' ').replace(/\s+/g, ' ').trim();
    rows.push({
      sourceRowNumber: current.sourceRowNumber,
      transactionDate: null,
      thirdPartyIdentification: current.identification,
      thirdPartyName: name || 'Cliente sin nombre',
      documentType: 'Estado de cuenta',
      documentNumber: null,
      description: 'Saldo pendiente extraído del estado de cuenta',
      subtotal: 0, taxAmount: 0, retentionAmount: 0,
      totalAmount: current.pendingAmount, paidAmount: 0, pendingAmount: current.pendingAmount,
      paymentStatus: 'pending', validationStatus: 'valid', validationMessage: null,
      rawData: { extractedFrom: 'PDF', format: 'customer-account-statement', header: headerInfo.headerLine }
    });
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line || /^page\s+\d+\s*\/\s*\d+$/i.test(line) || /^#\s+IDENTIFICACI/i.test(line)) continue;
    if (/^TOTAL\b/i.test(line)) {
      const totalMatch = line.match(amountPattern);
      if (totalMatch) reportedTotal = numberValue(totalMatch[1]);
      finish();
      current = null;
      continue;
    }
    const rowMatch = line.match(rowPattern);
    // Inicio de una nueva fila de cliente.
    if (rowMatch) {
      finish();
      const amountMatch = line.match(amountPattern);
      const name = rowMatch[2].replace(amountPattern, '').trim();
      current = {
        sourceRowNumber: index + 1,
        identification: rowMatch[1],
        nameLines: name ? [name] : [],
        pendingAmount: amountMatch ? numberValue(amountMatch[1]) : null
      };
      continue;
    }
    // Las líneas siguientes completan el nombre o el saldo del cliente actual.
    if (!current) continue;
    const amountMatch = line.match(amountPattern);
    const textBeforeAmount = amountMatch ? line.replace(amountPattern, '').trim() : line;
    if (textBeforeAmount) current.nameLines.push(textBeforeAmount);
    if (amountMatch) current.pendingAmount = numberValue(amountMatch[1]);
  }
  finish();

  // Se compara el total calculado con el total impreso, pero no se descarta el
  // documento por una diferencia de redondeo o por una extracción imperfecta.
  const extractedTotal = rows.reduce((sum, row) => sum + Number(row.pendingAmount || 0), 0);
  if (reportedTotal != null && Math.abs(extractedTotal - reportedTotal) > 0.01) {
    console.warn(`[portfolioPdf] El total de filas (${extractedTotal.toFixed(2)}) no coincide con el total del PDF (${reportedTotal.toFixed(2)}).`);
  }
  if (!rows.length) throw new Error('El estado de cuenta no contiene filas reconocibles');
  return customerStatementResult(extractedTotal, rows.length, rows, null);
}

/**
 * Punto de entrada público. Detecta el formato del PDF y selecciona el parser
 * especializado o el parser genérico de totales.
 */
export async function parsePortfolioPdf(filePath: string) {
  if (!fs.existsSync(filePath)) throw new Error('Archivo PDF no encontrado');
  const text = await extractText(filePath);
  const normalized = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  // Este formato es un estado de cuenta de clientes: sus valores son saldos
  // pendientes, no una declaración tributaria. No se buscan IVA/retenciones
  // porque esas palabras pueden aparecer dentro de nombres como RIVAS.
  if (/ESTADO DE CUENTA CLIENTES/i.test(normalized)) {
    const statementText = await extractText(filePath, true);
    const headerInfo = findCustomerHeaders(statementText);
    // Primero se intenta obtener el detalle individual.
    try {
      return parseCustomerStatementRows(statementText, headerInfo);
    } catch {
      // El fallback agregado se conserva solo cuando no se pudo leer ninguna fila individual.
    }
    // En este reporte el último importe impreso corresponde al TOTAL oficial.
    // Los importes de detalle ya están incluidos en ese total y no deben sumarse otra vez.
    const amounts = currencyValues(normalized);
    const pendingAmount = amounts.at(-1) || 0;
    const clientCount = (normalized.match(/^\s*\d+\s+\d{10,13}\s+/gm) || []).length;
    if (!clientCount || !pendingAmount) throw new Error('El estado de cuenta no contiene clientes o saldos pendientes reconocibles');
    console.warn('[portfolioPdf] No se pudo leer el detalle individual; se devolvera un total agregado, no un cliente real.');
    const row = {
      sourceRowNumber: 1,
      transactionDate: null,
      thirdPartyIdentification: null,
      thirdPartyName: 'Detalle no reconocido (total agregado)',
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
      validationStatus: 'warning',
      validationMessage: 'No se pudo leer el detalle individual del PDF; el total es agregado.',
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

  // Para otros PDFs se construye un resumen usando las etiquetas encontradas.
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
  // El parser genérico devuelve una sola fila resumen porque no puede asociar
  // los importes a clientes individuales con suficiente seguridad.
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
