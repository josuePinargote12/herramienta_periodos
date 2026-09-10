import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import { PDFDocument as PdfLibDocument, StandardFonts, rgb } from 'pdf-lib';
import XLSX from 'xlsx';
import type { Request, Response } from 'express';
import * as periodModel from '../models/period.model.js';
import * as documentModel from '../models/document.model.js';
import * as portfolioModel from '../models/portfolio.model.js';
import * as annualTaxService from '../services/annualTax.service.js';
import * as declarationModel from '../models/declaration.model.js';
import { findUserById } from '../models/user.model.js';

const TTL = 24 * 60 * 60;
const PAGE_X = 42.5;
const PAGE_WIDTH = 757;
const REPORT_WIDTH = 510;
const secret = () => process.env.SHARE_LINK_SECRET || 'contamatic-share-secret';
const apiBaseUrl = () => (process.env.PUBLIC_API_URL || process.env.API_PUBLIC_URL || 'http://localhost:3000/api').replace(/\/$/, '');
const sign = (data: Record<string, unknown>) => {
  const payload = Buffer.from(JSON.stringify({ ...data, exp: Math.floor(Date.now() / 1000) + TTL })).toString('base64url');
  const signature = crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
  return `${payload}.${signature}`;
};
const read = (token: string) => {
  const [payload, signature] = String(token || '').split('.');
  if (!payload || !signature) return null;
  const expected = crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
  if (signature !== expected) return null;
  try { const data = JSON.parse(Buffer.from(payload, 'base64url').toString()); return data.exp > Date.now() / 1000 ? data : null; } catch { return null; }
};

async function mergeFinancialPdfPages(report: Buffer, documents: any[]) {
  const pdf = await PdfLibDocument.load(report);
  const sourcePdfs = documents.filter(item => {
    const group = String(item.documentGroup ?? item.document_group ?? '').trim().toLowerCase();
    return ['financial statements', 'portfolio'].includes(group);
  });
  // Todas las páginas del reporte quedan consecutivas; los documentos originales van después.
  let insertAt = pdf.getPageCount();
  for (const item of sourcePdfs) {
    const rawFilePath = String(item.filePath ?? item.file_path ?? '');
    const filePath = path.isAbsolute(rawFilePath) || path.win32.isAbsolute(rawFilePath) ? rawFilePath : path.resolve(rawFilePath);
    try {
      const source = await PdfLibDocument.load(await fs.readFile(filePath));
      const pages = await pdf.copyPages(source, source.getPageIndices());
      pages.forEach(page => { pdf.insertPage(insertAt, page); insertAt += 1; });
    } catch {
      // Un archivo inválido no debe impedir la descarga del reporte consolidado.
    }
  }
  return Buffer.from(await pdf.save());
}

type EmbeddedDocumentMarker = { pageIndex: number; documents: any[] };

async function spreadsheetToPdf(filePath: string) {
  const workbook = XLSX.read(await fs.readFile(filePath), { cellDates: true });
  const chunks: Buffer[] = [];
  const source = new PDFDocument({ size: 'A4', layout: 'portrait', margin: 28 });
  source.on('data', chunk => chunks.push(Buffer.from(chunk)));
  workbook.SheetNames.forEach((sheetName, sheetIndex) => {
    if (sheetIndex) source.addPage();
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, raw: false, defval: '' }) as unknown[][];
    const columns = Math.min(Math.max(...rows.map(row => row.length), 1), 12);
    const usableWidth = 539;
    const rawWidths = Array.from({ length: columns }, (_, column) => {
      const longest = Math.max(...rows.slice(0, 25).map(row => String(row[column] ?? '').length), 8);
      return Math.min(Math.max(longest * 4.2 + 12, 55), 220);
    });
    const widthScale = usableWidth / rawWidths.reduce((sum, width) => sum + width, 0);
    const widths = rawWidths.map(width => width * widthScale);
    let top = 46;
    const drawHeader = () => {
      source.fillColor('#1f4778').fontSize(13).font('Helvetica-Bold').text(sheetName, 28, 28, { width: usableWidth });
      let left = 28;
      (rows[0] || []).slice(0, columns).forEach((value, column) => {
        source.fillColor('#1f4778').rect(left, top, widths[column], 22).fill();
        source.strokeColor('#cbd5e1').rect(left, top, widths[column], 22).stroke();
        source.fillColor('#fff').fontSize(6.5).text(String(value ?? ''), left + 3, top + 7, { width: widths[column] - 6, height: 14, ellipsis: true });
        left += widths[column];
      });
      top += 22;
    };
    drawHeader();
    rows.slice(1).forEach((row, rowIndex) => {
      if (top + 19 > 810) { source.addPage(); top = 46; drawHeader(); }
      let left = 28;
      for (let column = 0; column < columns; column += 1) {
        source.fillColor(rowIndex % 2 ? '#f8fafc' : '#eef3f8').rect(left, top, widths[column], 19).fill();
        source.strokeColor('#cbd5e1').rect(left, top, widths[column], 19).stroke();
        source.fillColor('#26364d').fontSize(6.2).text(String(row[column] ?? ''), left + 3, top + 6, { width: widths[column] - 6, height: 12, ellipsis: true });
        left += widths[column];
      }
      top += 19;
    });
  });
  source.end();
  await new Promise<void>(resolve => source.once('end', () => resolve()));
  return Buffer.concat(chunks);
}

async function mergeEmbeddedPdfPages(report: Buffer, markers: EmbeddedDocumentMarker[]) {
  const pdf = await PdfLibDocument.load(report);
  const titleFont = await pdf.embedFont(StandardFonts.HelveticaBold);
  let insertedPages = 0;
  for (const marker of markers) {
    let insertAt = marker.pageIndex + 1 + insertedPages;
    for (const item of marker.documents) {
      const mimeType = String(item.mimeType || '').toLowerCase();
      const rawFilePath = String(item.filePath ?? item.file_path ?? '');
      const filePath = path.isAbsolute(rawFilePath) || path.win32.isAbsolute(rawFilePath) ? rawFilePath : path.resolve(rawFilePath);
      try {
        const originalName = String(item.originalName || '');
        const isSpreadsheet = mimeType.includes('spreadsheet') || mimeType.includes('excel') || /\.(xlsx|xls)$/i.test(originalName);
        if (!mimeType.includes('pdf') && !/\.pdf$/i.test(originalName) && !isSpreadsheet) continue;
        const sourceBytes = isSpreadsheet ? await spreadsheetToPdf(filePath) : await fs.readFile(filePath);
        const source = await PdfLibDocument.load(sourceBytes);
        const pages = await pdf.copyPages(source, source.getPageIndices());
        if (pages[0] && item.embeddedTitle) {
          const { width, height } = pages[0].getSize();
          pages[0].drawRectangle({ x: 0, y: height - 27, width, height: 27, color: rgb(0.96, 0.98, 1), opacity: 0.94 });
          pages[0].drawText(String(item.embeddedTitle), { x: 18, y: height - 18, size: 8, font: titleFont, color: rgb(0.12, 0.28, 0.47), maxWidth: width - 36 });
        }
        pages.forEach(page => { pdf.insertPage(insertAt, page); insertAt += 1; insertedPages += 1; });
      } catch {
        // Un archivo inválido no debe impedir la descarga del informe.
      }
    }
  }
  return Buffer.from(await pdf.save());
}

type ReportContext = { detail: any; documents: any[]; accounts: any[]; declaration: any; data: any; movements?: any[]; financialSummary?: any; financialSummaries?: any[] };
type PdfKitDocument = InstanceType<typeof PDFDocument>;

function reportMoney(value: unknown) {
  return `$${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function reportRows(value: unknown): any[] {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function declarationFields(groups: any[]) {
  return groups.flatMap(group => Array.isArray(group.fields) ? group.fields.map((field: any) => ({ ...field, group: group.label })) : []);
}

function fieldTotal(fields: any[], codes: string[]) {
  return fields.filter(field => codes.includes(String(field.code))).reduce((sum, field) => sum + Number(field.value || 0), 0);
}

function reportPage(doc: PdfKitDocument, title: string, subtitle = '', newPage = true, requiredHeight = 0) {
  if (!newPage) {
    if (doc.y + requiredHeight > 720) { reportPage(doc, title, subtitle, true); return; }
    doc.moveDown(1.5);
    doc.fillColor('#1f3f68').fontSize(15).text(title, 42.5, doc.y, { width: REPORT_WIDTH });
    if (subtitle) doc.fillColor('#64748b').fontSize(9).text(subtitle, 42.5, doc.y + 5, { width: REPORT_WIDTH });
    doc.y += subtitle ? 28 : 20;
    return;
  }
  doc.addPage();
  doc.fillColor('#1f3f68').fontSize(8).text('ContaMatic | Informe Contable y Tributario', 42.5, 28);
  doc.moveTo(42.5, 40).lineTo(552.5, 40).strokeColor('#cbd5e1').stroke();
  doc.fillColor('#1f3f68').fontSize(15).text(title, 42.5, 58, { width: REPORT_WIDTH });
  if (subtitle) doc.fillColor('#64748b').fontSize(9).text(subtitle, 42.5, 80, { width: REPORT_WIDTH });
  doc.fillColor('#64748b').fontSize(8).text('ContaMatic - Sistema de control contable y tributario', 42.5, 775, { width: REPORT_WIDTH, align: 'left' });
  if (false) {
  doc.fillColor('#64748b').fontSize(8).text(`Informe mensual - Página ${doc.bufferedPageRange().count}`, 350, 800, { width: 202, align: 'right' });
  doc.fillColor('#64748b').fontSize(8).text(`Página ${doc.bufferedPageRange().count}`, 710, 560, { width: 89, align: 'right' });
  }
  doc.fillColor('#64748b').fontSize(8).text(`Informe mensual - Pagina ${doc.bufferedPageRange().count}`, 350, 775, { width: 202, align: 'right' });
  doc.x = 42.5;
  doc.y = subtitle ? 100 : 85;
}

function reportTable(doc: PdfKitDocument, headers: string[], rows: string[][], widths: number[], top = doc.y, rowLinks: Array<string | null> = []) {
  const x = 42.5;
  if (headers[0] === 'DOCUMENTO' && headers[1] === 'TIPO') return;
  if (/^N/i.test(String(headers[0])) && /SECCI/i.test(String(headers[1]))) {
    if (top > 150) top = 105;
    rows.forEach(([number, section]) => {
      doc.fillColor('#334155').fontSize(10).text(`${number}.  ${section}`, x, top, { width: REPORT_WIDTH });
      top += 24;
    });
    doc.y = top + 8;
    return;
  }
  const scale = REPORT_WIDTH / widths.reduce((sum, width) => sum + width, 0);
  const fittedWidths = widths.map(width => width * scale);
  const indicatorTable = /INDICADOR/i.test(String(headers[0]));
  const rowHeight = 22;
  const drawRow = (values: string[], header = false, link?: string) => {
    if (top + rowHeight > 740) {
      reportPage(doc, 'DETALLE DE CUENTAS');
      top = 100;
      if (!header) {
        let cursor = x;
        headers.forEach((val, index) => {
          const width = fittedWidths[index];
          doc.fillColor('#1f4778').rect(cursor, top, width, rowHeight).fill();
          doc.strokeColor('#cbd5e1').rect(cursor, top, width, rowHeight).stroke();
          doc.fillColor('#fff').fontSize(7).text(val, cursor + 5, top + 7, { width: width - 10, height: rowHeight - 8, align: index === 0 ? 'left' : 'right', ellipsis: true });
          cursor += width;
        });
        top += rowHeight;
      }
    }
    let cursor = x;
    values.forEach((value, index) => {
      const width = fittedWidths[index];
      const status = String(value).toUpperCase();
      const cellColor = header ? '#1f4778' : indicatorTable && index === 2
        ? status.includes('REVISAR') ? '#FEE2E2' : status.includes('PENDIENTE') ? '#FEF3C7' : '#DCFCE7'
        : '#f3f6fa';
      doc.fillColor(cellColor).rect(cursor, top, width, rowHeight).fill();
      doc.strokeColor('#cbd5e1').rect(cursor, top, width, rowHeight).stroke();
      doc.fillColor(header ? '#fff' : '#26364d').fontSize(header ? 7 : 8).text(value, cursor + 5, top + 7, { width: width - 10, height: rowHeight - 8, align: header || index === 0 ? 'left' : 'right', ellipsis: true });
      if (!header && link && index === 1) doc.link(cursor, top, width, rowHeight, link);
      cursor += width;
    });
    top += rowHeight;
  };
  drawRow(headers, true);
  rows.forEach((row, rowIndex) => drawRow(row, false, rowLinks[rowIndex] || undefined));
  doc.y = top + 8;
}

function reportIvaHistoryTable(doc: PdfKitDocument, title: string, groups: any[]) {
  if (!groups.length) return;
  const x = 42.5;
  const widths = [235, 32, 62, 32, 62, 32, 62];
  const totalWidth = widths.reduce((sum, width) => sum + width, 0);
  const scale = REPORT_WIDTH / totalWidth;
  const fitted = widths.map(width => width * scale);
  const rowHeight = 19;
  let top = doc.y;
  if (top + rowHeight * 3 + groups.length * rowHeight > 735) { reportPage(doc, 'DETALLE DE IVA'); top = doc.y; }
  const cell = (left: number, width: number, height: number, text: string, header = false, highlighted = false) => {
    doc.fillColor(header ? '#1f4778' : highlighted ? '#fff1a8' : '#f3f6fa').rect(left, top, width, height).fill();
    doc.strokeColor('#cbd5e1').rect(left, top, width, height).stroke();
    doc.fillColor(header ? '#fff' : '#26364d').fontSize(header ? 6.2 : 6.3).text(text, left + 3, top + (header ? 6 : 5), { width: width - 6, height: height - 5, align: header || left === x ? 'left' : 'right', ellipsis: true });
  };
  cell(x, REPORT_WIDTH, rowHeight, title, true);
  top += rowHeight;
  cell(x, fitted[0], rowHeight, 'CONCEPTO', true);
  cell(x + fitted[0], fitted[1] + fitted[2], rowHeight, 'VALOR BRUTO', true);
  cell(x + fitted[0] + fitted[1] + fitted[2], fitted[3] + fitted[4], rowHeight, 'VALOR NETO', true);
  cell(x + fitted[0] + fitted[1] + fitted[2] + fitted[3] + fitted[4], fitted[5] + fitted[6], rowHeight, 'IMPUESTO GENERADO', true);
  top += rowHeight;
  let cursor = x;
  [' ', 'CÓD.', 'VALOR', 'CÓD.', 'VALOR', 'CÓD.', 'VALOR'].forEach((header, index) => { cell(cursor, fitted[index], rowHeight, header, true); cursor += fitted[index]; });
  top += rowHeight;
  groups.forEach(group => {
    const fields = (group.fields || []).filter((field: any) => Number(field.value) > 0 && (Number(field.code) < 480 || Number(field.code) > 499)).slice(0, 3);
    const values = [String(group.label || 'Casillero del formulario'), ...fields.flatMap((field: any) => [String(field.code), reportMoney(field.value)]), ...Array(Math.max(0, 3 - fields.length) * 2).fill('')];
    cursor = x;
    values.forEach((value, index) => { const codeIndex = index > 0 ? 1 + Math.floor((index - 1) / 2) * 2 : -1; const highlighted = codeIndex >= 0 && ['419', '519'].includes(String(values[codeIndex])); cell(cursor, fitted[index], rowHeight, value, false, highlighted); cursor += fitted[index]; });
    top += rowHeight;
  });
  doc.y = top + 8;
}

function reportParagraph(doc: PdfKitDocument, text: string) {
  if (/No existe detalle de (IVA|retenciones)|No existen documentos de estados financieros|No existen cuentas por cobrar|No existen cuentas por pagar|Los estados financieros originales/i.test(text)) return;
  doc.fillColor('#334155').fontSize(9).text(text, 42.5, doc.y, { width: REPORT_WIDTH, lineGap: 3, align: 'justify' });
  doc.moveDown(0.8);
}

function reportAccountantComment(doc: PdfKitDocument, comment: string, sectionTitle = '8. CONCLUSIONES Y RECOMENDACIONES') {
  const x = PAGE_X;
  const width = REPORT_WIDTH;
  const padding = 11;
  const label = 'Observación adicional del contador';
  const value = comment?.trim() || 'Sin observaciones adicionales.';
  const bodyWidth = width - padding * 2;
  const bodyHeight = doc.heightOfString(value, { width: bodyWidth, lineGap: 3 });
  const height = padding + 13 + 6 + bodyHeight + padding;
  const top = doc.y;

  if (top + height > 720) {
    reportPage(doc, sectionTitle);
  }

  const boxTop = doc.y;
  doc.save();
  doc.roundedRect(x, boxTop, width, height, 7).fillAndStroke('#eef5ff', '#6b9ed6');
  doc.fillColor('#1f4778').fontSize(9).font('Helvetica-Bold')
    .text(label, x + padding, boxTop + padding, { width: bodyWidth });
  doc.fillColor('#334155').fontSize(9).font('Helvetica')
    .text(value, x + padding, boxTop + padding + 19, { width: bodyWidth, lineGap: 3 });
  doc.restore();
  doc.y = boxTop + height + 16;
}

function groupPortfolioRows(rows: any[]) {
  const grouped = new Map<string, { name: string; identification: string; amount: number }>();
  rows.forEach(row => {
    const amount = Number(row.pendingAmount || 0);
    if (amount <= 0) return;
    const name = String(row.thirdPartyName || 'Tercero sin nombre').trim();
    const identification = String(row.thirdPartyIdentification || '').trim();
    const key = identification || name.toLowerCase();
    const current = grouped.get(key) || { name, identification, amount: 0 };
    current.amount += amount;
    grouped.set(key, current);
  });
  return [...grouped.values()].sort((a, b) => b.amount - a.amount);
}

function percentage(value: number, total: number) {
  return total > 0 ? `${((value / total) * 100).toFixed(2)}%` : '0.00%';
}

function reportPortfolioTop(doc: PdfKitDocument, title: string, groups: any[], total: number, label: string) {
  doc.fillColor('#1473b8').fontSize(11).font('Helvetica-Bold').text(title, PAGE_X, doc.y);
  doc.moveDown(0.45);
  const rows = groups.slice(0, 5).map(row => [
    row.name,
    reportMoney(row.amount),
    percentage(row.amount, total)
  ]);
  const rest = groups.slice(5);
  if (rest.length) {
    const restAmount = rest.reduce((sum, row) => sum + row.amount, 0);
    rows.push([`Otros (${rest.length} ${label})`, reportMoney(restAmount), percentage(restAmount, total)]);
  }
  reportTable(doc, ['NOMBRE', 'SALDO PENDIENTE', '% DEL TOTAL'], rows.length ? rows : [['Sin datos', reportMoney(0), '0.00%']], [390, 170, 127]);
}

function reportPortfolioAlert(doc: PdfKitDocument, text: string, tone: 'high' | 'warning' | 'ok', sectionTitle = '3. ESTADO DE CARTERA Y OBLIGACIONES') {
  const colors = tone === 'high'
    ? { fill: '#fff1f2', stroke: '#e11d48', text: '#9f1239' }
    : tone === 'warning'
      ? { fill: '#fffbeb', stroke: '#d97706', text: '#92400e' }
      : { fill: '#ecfdf5', stroke: '#16a34a', text: '#166534' };
  const width = REPORT_WIDTH;
  const padding = 9;
  doc.font('Helvetica').fontSize(8.5);
  const height = Math.max(27, doc.heightOfString(text, { width: width - padding * 2, lineGap: 2 }) + padding * 2);
  if (doc.y + height > 735) reportPage(doc, sectionTitle, '', true);
  const top = doc.y;
  doc.save();
  doc.roundedRect(PAGE_X, top, width, height, 5).fillAndStroke(colors.fill, colors.stroke);
  doc.fillColor(colors.text).font('Helvetica-Bold').fontSize(8.5)
    .text(text, PAGE_X + padding, top + padding, { width: width - padding * 2, lineGap: 2 });
  doc.restore();
  doc.y = top + height + 6;
}

async function buildLexfinReport({ detail, documents, accounts, declaration, data, movements = [], financialSummary = null, financialSummaries = [] }: ReportContext) {
  const chunks: Buffer[] = [];
  const embeddedMarkers: EmbeddedDocumentMarker[] = [];
  const doc = new PDFDocument({ size: 'A4', layout: 'portrait', margin: 42.5, bufferPages: true });
  doc.on('data', chunk => chunks.push(Buffer.from(chunk)));
  const client = detail.client || {};
  const monthName = detail.months?.find((row: any) => Number(row.month) === Number(data.monthNum))?.name || String(data.monthNum);
  const year = Number(data.year);
  const currentAccounts = accounts.filter((row: any) => Number(row.fiscalMonth) === Number(data.monthNum));
  const receivables = currentAccounts.filter((row: any) => row.accountType === 'CXC');
  const payables = currentAccounts.filter((row: any) => row.accountType === 'CXP');
  const cxcMovements = movements.filter((row: any) => String(row.accountType).toUpperCase() === 'CXC');
  const cxpMovements = movements.filter((row: any) => String(row.accountType).toUpperCase() === 'CXP');
  const annualFull = detail.annual || {};
  const selectedMonths = (detail.months || []).filter((row: any) => Number(row.month) <= Number(data.monthNum));
  const selectedAnnual = selectedMonths.reduce((total: any, row: any) => ({
    sales: total.sales + Number(row.sales || 0),
    costs: total.costs + Number(row.costs || 0),
    employeeExpense: total.employeeExpense + Number(row.employeeExpense || 0),
    utility: total.utility + Number(row.utility || 0),
    tax: total.tax + Number(row.tax || 0),
    taxRetentions: total.taxRetentions + Number(row.incomeTaxRetention || 0),
    iva: total.iva + Number(row.iva || 0),
    retentions: total.retentions + Number(row.retentions || 0),
    base: Number(row.accumulatedBase || total.base || 0)
  }), { sales: 0, costs: 0, employeeExpense: 0, utility: 0, tax: 0, taxRetentions: 0, iva: 0, retentions: 0, base: 0 });
  // La utilidad de cada fila ya descuenta el gasto de empleados. La base del
  // reporte debe recalcular el impuesto sobre la utilidad acumulada final, no
  // sumar las provisiones mensuales de `row.tax`.
  const taxableBase = Math.max(0, Number(selectedAnnual.utility.toFixed(2)));
  const selectedCalculation = annualTaxService.calculateIncomeTax(detail.configuration, {
    sales: selectedAnnual.sales,
    costs: selectedAnnual.costs,
    utility: taxableBase,
    retentions: selectedAnnual.taxRetentions
  });
  const selectedTax = Number(selectedCalculation.tax || 0);
  const annual = {
    ...annualFull,
    ...selectedAnnual,
    base: taxableBase,
    tax: selectedTax,
    taxBase: selectedCalculation.taxBase,
    rate: selectedCalculation.rule,
    taxPayable: Number(Math.max(0, selectedTax - selectedAnnual.taxRetentions).toFixed(2))
  };
  const current = detail.months?.find((row: any) => Number(row.month) === Number(data.monthNum)) || {};
  const totalPending = (rows: any[]) => rows.reduce((sum, row) => sum + Number(row.pendingAmount || 0), 0);
  const iva = Number(declaration?.iva || current.iva || 0);
  const retentionSourceGroups = reportRows(declaration?.retentionDetailRows);
  const retentionSourceFields = declarationFields(retentionSourceGroups);
  const retentions = declaration?.retentions != null
    ? Number(declaration.retentions)
    : current.retentions != null
      ? Number(current.retentions)
      : fieldTotal(retentionSourceFields, ['499']);
  const financialStatementDocuments = documents.filter(item => String(item.documentGroup || '').toLowerCase() === 'financial statements');
  const currentFinancialIds = new Set([financialSummary?.balance_document_id, financialSummary?.results_document_id].filter(Boolean).map(Number));
  const financialDocuments = currentFinancialIds.size
    ? financialStatementDocuments.filter(item => currentFinancialIds.has(Number(item.id)))
    : [...new Map(financialStatementDocuments.map(item => [String(item.documentType || ''), item])).values()];
  const portfolioDocuments = documents.filter(item => String(item.documentGroup || '').toLowerCase() === 'portfolio');
  const portfolioDocs = ['cxc', 'cxp'].map(type => portfolioDocuments
    .filter(item => String(item.documentType || '').toLowerCase() === type)
    .sort((a, b) => Number(b.version || 1) - Number(a.version || 1))[0])
    .filter(Boolean);
  const hasReceivableDocs = portfolioDocs.some(item => ['cxc', 'receivable'].includes(String(item.documentType || '').toLowerCase()));
  const hasPayableDocs = portfolioDocs.some(item => ['cxp', 'payable'].includes(String(item.documentType || '').toLowerCase()));
  const automaticComment = data.comment || (Number(current.utility || 0) > 0
    ? `La empresa cerró el mes con un resultado positivo de ${reportMoney(current.utility)}.`
    : Number(current.utility || 0) < 0
      ? `La empresa cerró el mes con un resultado negativo de ${reportMoney(Math.abs(Number(current.utility || 0)))}; se recomienda revisar costos y gastos.`
      : 'El período no registra utilidad o pérdida; se recomienda validar la información cargada.');

  doc.fillColor('#1f3f68').fontSize(22).text('ContaMatic', 42.5, 75, { width: REPORT_WIDTH, align: 'center' });
  doc.fillColor('#64748b').fontSize(10).text('SISTEMA DE CONTROL CONTABLE Y TRIBUTARIO', 42.5, 105, { width: REPORT_WIDTH, align: 'center' });
  doc.fillColor('#1f3f68').fontSize(20).text('INFORME CONTABLE, TRIBUTARIO Y FINANCIERO MENSUAL', 42.5, 180, { width: REPORT_WIDTH, align: 'center' });
  doc.fillColor('#64748b').fontSize(11).text('Informe consolidado generado por ContaMatic', 42.5, 220, { width: REPORT_WIDTH, align: 'center' });
  reportTable(doc, ['DATO', 'VALOR'], [
    ['Empresa / cliente', String(client.name || 'No disponible')],
    ['RUC / Cédula', String(client.ruc || 'No disponible')],
    ['Período', `${monthName} ${year}`],
    ['Elaborado por', String(data.userName || 'ContaMatic')],
    ['Fecha de emisión', new Date().toLocaleDateString('es-EC')]
  ], [220, 537], 285);
  doc.fillColor('#64748b').fontSize(8).text('Los valores corresponden exclusivamente a la información registrada en ContaMatic.', 42.5, 520, { width: REPORT_WIDTH, align: 'center' });

  const sectionDefinitions = [
    { key: 'executive', title: 'Resumen ejecutivo', show: true },
    { key: 'financial', title: 'Estados financieros', show: financialDocuments.length > 0 },
    { key: 'portfolio', title: 'Estado de cartera', show: hasReceivableDocs || hasPayableDocs },
    { key: 'obligations', title: 'Obligaciones tributarias', show: true },
    { key: 'tax', title: 'Proyección de Impuesto a la Renta', show: true },
    { key: 'indicators', title: 'Indicadores y alertas contables', show: true },
    { key: 'attachments', title: 'Documentación adjunta', show: true },
    { key: 'conclusions', title: 'Conclusiones y recomendaciones', show: true }
  ].filter(section => section.show);
  const sectionNumber = (key: string) => sectionDefinitions.findIndex(section => section.key === key) + 1;
  const sectionTitle = (key: string) => `${sectionNumber(key)}. ${sectionDefinitions.find(section => section.key === key)?.title.toUpperCase() || key}`;
  const addEmbeddedDocumentMarkers = (title: string, sourceDocuments: any[]) => {
    if (!sourceDocuments.length) return;
    embeddedMarkers.push({
      pageIndex: doc.bufferedPageRange().start + doc.bufferedPageRange().count - 1,
      documents: sourceDocuments.map(item => ({ ...item, embeddedTitle: title }))
    });
  };

  reportPage(doc, 'ÍNDICE');
  reportTable(doc, ['N°', 'SECCIÓN'], sectionDefinitions.map((section, index) => [String(index + 1), section.title]), [70, 687], 105);

  reportPage(doc, sectionTitle('executive'), `Cierre mensual de ${monthName} ${year}`);
  reportParagraph(doc, `Durante el período de ${monthName} ${year} se consolidó la información contable y tributaria registrada para ${client.name || 'el cliente'}. Este informe presenta los valores disponibles, documentos adjuntos y cálculos acumulados hasta el mes seleccionado.`);
  reportTable(doc, ['CONCEPTO', 'VALOR'], [
    ['Ventas · mes', reportMoney(current.sales)], ['Costos y gastos · mes', reportMoney(current.costs)],
    ['Resultado · mes', reportMoney(current.utility)], ['IVA declarado · mes', reportMoney(iva)],
    ['Retenciones declaradas · mes', reportMoney(retentions)], ['Utilidad · acumulado fiscal', reportMoney(annual.utility)],
    ['Impuesto a la Renta estimado · acumulado fiscal', reportMoney(annual.tax)],
  ], [420, 337]);
  reportParagraph(doc, `Comentario ejecutivo: ${automaticComment}`);

  const financialDocs = financialDocuments;
  const balance: any = financialSummary || {};
  const accumulated = financialSummaries.filter((row: any) => Number(row.monthNum) <= Number(data.monthNum));
  const sum = (field: string) => accumulated.reduce((total: number, row: any) => total + Number(row[field] || 0), 0);
  const financialMoney = (value: unknown) => value == null ? 'N/D' : reportMoney(value);
  if (false && financialDocs.length) {
    reportParagraph(doc, 'Los estados financieros originales se incluyen en la documentaciÃ³n adjunta de este informe. En esta secciÃ³n se identifica cada archivo registrado para el perÃ­odo.');
    reportTable(doc, ['DOCUMENTO', 'TIPO', 'VERSIÃ“N'], financialDocs.map(item => [String(item.originalName || 'Documento'), 'Estados financieros', `v${item.version || 1}.0`]), [560, 130, 67]);
  }
  if (false && financialDocs.length) {
    reportParagraph(doc, `Se adjuntan los Estados Financieros correspondientes al periodo terminado el 31 de ${monthName} de ${year}.`);
    doc.fillColor('#1473b8').fontSize(12).text('Estado de Situacion Financiera', 42.5, doc.y);
    doc.moveDown(0.6);
    reportTable(doc, ['Concepto', 'Saldo'], [
      ['Activo corriente', financialMoney(balance.activo_corriente)],
      ['Activo no corriente', financialMoney(balance.activo_no_corriente)],
      ['TOTAL ACTIVOS', financialMoney(balance.total_activos)],
      ['Pasivo corriente', financialMoney(balance.pasivo_corriente)],
      ['Pasivo no corriente', financialMoney(balance.pasivo_no_corriente)],
      ['TOTAL PASIVOS', financialMoney(balance.total_pasivos)],
      ['PATRIMONIO', financialMoney(balance.patrimonio)]
    ], [560, 217]);
    doc.fillColor('#1473b8').fontSize(12).text('Estado de Resultados', 42.5, doc.y);
    doc.moveDown(0.6);
    reportTable(doc, ['Concepto', `Mes · ${monthName}`, `Acumulado fiscal · enero-${monthName}`], [
      ['Ingresos', financialMoney(balance.ingresos_periodo), financialMoney(sum('ingresos_periodo'))],
      ['Costos y gastos operativos', financialMoney(balance.costos_gastos_operativos), financialMoney(sum('costos_gastos_operativos'))],
      ['Utilidad antes de participación e impuestos', financialMoney(balance.utilidad_antes_participacion_impuestos), financialMoney(sum('utilidad_antes_participacion_impuestos'))]
    ], [420, 190, 167]);
    reportParagraph(doc, 'Los estados financieros originales se incluyen en la documentación adjunta de este informe. En esta sección se identifica cada archivo registrado para el período.');
    reportTable(doc, ['DOCUMENTO', 'TIPO', 'VERSIÓN'], financialDocs.map(item => [String(item.originalName || 'Documento'), 'Estados financieros', `v${item.version || 1}.0`]), [560, 130, 67]);
  } else reportParagraph(doc, 'No existen documentos de estados financieros registrados para este período.');

  if (financialDocs.length) addEmbeddedDocumentMarkers('2. ESTADOS FINANCIEROS - DOCUMENTO ORIGINAL', financialDocs);

  const cxcRows = cxcMovements.length ? cxcMovements : receivables;
  const cxpRows = cxpMovements.length ? cxpMovements : payables;
  if (false && (hasReceivableDocs || hasPayableDocs)) {
    const portfolioSectionTitle = sectionTitle('portfolio');
    const portfolioSectionNumber = sectionNumber('portfolio');
    reportPage(doc, portfolioSectionTitle, `Valores consolidados al cierre del período: ${monthName} ${year}`, false, 300);
    const cxcGroups = groupPortfolioRows(cxcRows);
    const cxpGroups = groupPortfolioRows(cxpRows);
    const totalPendingCxc = cxcGroups.reduce((sum, row) => sum + row.amount, 0);
    const totalPendingCxp = cxpGroups.reduce((sum, row) => sum + row.amount, 0);
    const liquidityGap = totalPendingCxc - totalPendingCxp;

    doc.fillColor('#1f3f68').fontSize(11).font('Helvetica-Bold').text(`${portfolioSectionNumber}.1. Visión Global`, PAGE_X, doc.y);
    doc.moveDown(0.45);
    reportTable(doc, ['MÉTRICA', 'MONTO'], [
      ['Total Cuentas por Cobrar (Clientes)', reportMoney(totalPendingCxc)],
      ['Total Cuentas por Pagar (Proveedores)', reportMoney(totalPendingCxp)],
      ['Brecha de liquidez (CxC - CxP)', reportMoney(liquidityGap)]
    ], [510, 217]);

    doc.fillColor('#1f3f68').fontSize(11).font('Helvetica-Bold').text(`${portfolioSectionNumber}.3. Concentración de Riesgo (Top 5)`, PAGE_X, doc.y);
    doc.moveDown(0.45);
    reportParagraph(doc, 'El sistema ordena los saldos de mayor a menor y agrupa el resto en “Otros”.');
    reportPortfolioTop(doc, 'Principales Deudores (Cuentas por Cobrar)', cxcGroups, totalPendingCxc, 'clientes');
    reportPortfolioTop(doc, 'Principales Acreedores (Cuentas por Pagar)', cxpGroups, totalPendingCxp, 'proveedores');

    doc.fillColor('#1f3f68').fontSize(11).font('Helvetica-Bold').text(`${portfolioSectionNumber}.4. Alertas del Sistema`, PAGE_X, doc.y);
    doc.moveDown(0.45);
    const alerts: Array<{ text: string; tone: 'high' | 'warning' }> = [];
    const topClient = cxcGroups[0];
    if (topClient && totalPendingCxc > 0 && topClient.amount / totalPendingCxc > 0.4) {
      alerts.push({ text: `RIESGO ALTO: Alta dependencia de liquidez en un solo cliente (${topClient.name}).`, tone: 'high' });
    }
    const cutoff = new Date(year, Number(data.monthNum), 0, 23, 59, 59, 999);
    const over60 = cxcRows.reduce((sum: number, row: any) => {
      const pending = Number(row.pendingAmount || 0);
      const transactionDate = row.transactionDate ? new Date(row.transactionDate) : null;
      if (!pending || !transactionDate || Number.isNaN(transactionDate.getTime())) return sum;
      const days = Math.floor((cutoff.getTime() - transactionDate.getTime()) / 86400000);
      return days > 60 ? sum + pending : sum;
    }, 0);
    const over60Percentage = totalPendingCxc > 0 ? (over60 / totalPendingCxc) * 100 : 0;
    if (over60Percentage > 20) {
      alerts.push({ text: `ATENCIÓN: El ${over60Percentage.toFixed(2)}% de la cartera por cobrar tiene un retraso severo (>60 días). Se recomienda gestión de cobranza inmediata.`, tone: 'warning' });
    }
    if (totalPendingCxp > totalPendingCxc) {
      alerts.push({ text: 'ALERTA DE FLUJO: Las obligaciones por pagar a corto plazo superan las cuentas por cobrar actuales.', tone: 'high' });
    }
    if (alerts.length) alerts.forEach(alert => reportPortfolioAlert(doc, alert.text, alert.tone, portfolioSectionTitle));
    else reportPortfolioAlert(doc, 'OK: No se activaron alertas automáticas para este período.', 'ok', portfolioSectionTitle);
  }

  if (hasReceivableDocs || hasPayableDocs) {
    const cxcDocuments = portfolioDocs.filter(item => ['cxc', 'receivable'].includes(String(item.documentType || '').toLowerCase()));
    const cxpDocuments = portfolioDocs.filter(item => ['cxp', 'payable'].includes(String(item.documentType || '').toLowerCase()));
    addEmbeddedDocumentMarkers('3. ESTADO DE CARTERA - CUENTAS POR COBRAR', cxcDocuments);
    addEmbeddedDocumentMarkers('3. ESTADO DE CARTERA - CUENTAS POR PAGAR', cxpDocuments);
  }

  const ivaGroups = reportRows(declaration?.ivaDetailRows);
  const ivaFields = declarationFields(ivaGroups);
  const ivaSales = fieldTotal(ivaFields, ['419']) || Number(declaration?.ivaCosts || 0);
  const ivaZeroRate = fieldTotal(ivaFields, ['409', '411', '412', '413', '414', '415']);
  const ivaGenerated = fieldTotal(ivaFields, ['421', '422', '423', '424', '425']);
  const ivaPurchases = fieldTotal(ivaFields, ['519']) || Number(declaration?.ivaValues || 0);
  reportPage(doc, sectionTitle('obligations'), `IVA, retenciones y resumen del período ${monthName} ${year}`, true);
  doc.fillColor('#1473b8').fontSize(12).text('IVA mensual', 42.5, doc.y);
  doc.moveDown(0.6);
  const ivaGroupsForReport = ivaGroups
    .filter((group: any) => Array.isArray(group.fields) && group.fields.some((field: any) => Number(field.value) > 0) && !group.fields.some((field: any) => String(field.code) === '554') && !/factor de proporcionalidad/i.test(String(group.label || '')));
  const ivaDetailRows = (groups: any[]) => groups.map((group: any) => {
    const fields = group.fields.filter((field: any) => Number(field.value) > 0).slice(0, 3);
    return [String(group.label || 'Casillero del formulario'), ...fields.map((field: any) => `${field.code}: ${reportMoney(field.value)}`), ...Array(Math.max(0, 3 - fields.length)).fill('')];
  });
  const ivaSalesGroups = ivaGroupsForReport.filter((group: any) => Number(group.fields[0]?.code) >= 400 && Number(group.fields[0]?.code) < 480);
  const ivaExpenseGroups = ivaGroupsForReport.filter((group: any) => Number(group.fields[0]?.code) >= 500 && Number(group.fields[0]?.code) < 600);
  if (ivaSalesGroups.length) {
    reportIvaHistoryTable(doc, 'RESUMEN DE VENTAS Y OTRAS OPERACIONES DEL PERÍODO QUE DECLARA', ivaSalesGroups);
  }
  if (ivaExpenseGroups.length) {
    reportIvaHistoryTable(doc, 'RESUMEN DE ADQUISICIONES Y PAGOS DEL PERÍODO QUE DECLARA', ivaExpenseGroups);
  }
  if (!ivaSalesGroups.length && !ivaExpenseGroups.length) reportTable(doc, ['RESUMEN EJECUTIVO IVA', 'VALOR'], [['Ventas gravadas', reportMoney(ivaSales)], ['Ventas tarifa 0%', reportMoney(ivaZeroRate)], ['IVA generado', reportMoney(ivaGenerated)], ['IVA en compras', reportMoney(ivaPurchases)], ['Retenciones recibidas', reportMoney(retentions)], ['IVA a pagar / crédito tributario', reportMoney(iva)]], [420, 337]);
  reportParagraph(doc, `Estado: ${iva ? 'DECLARADO' : 'PENDIENTE'} · Fecha de presentación: ${declaration?.registeredAt ? new Date(declaration.registeredAt).toLocaleDateString('es-EC') : 'No registrada'} · Formulario: IVA · Adjunto: ${declaration?.ivaFile || 'No registrado'}.`);
  if (false && ivaGroups.length) {
    const ivaRows = ivaGroups.flatMap((group: any) => (Array.isArray(group.fields) ? group.fields : []).filter((field: any) => Number(field.value) > 0).map((field: any) => [String(group.label || 'Casillero'), String(field.code || ''), reportMoney(field.value)]));
    reportTable(doc, ['CONCEPTO', 'CASILLERO', 'VALOR'], ivaRows, [510, 100, 147]);
  } else reportParagraph(doc, 'No existe detalle de IVA registrado para este período.');

  /* Retenciones en la fuente se presenta únicamente en el historial; no se duplica en el informe. */
  /*
  // El historial de retenciones conserva el total declarado en `retentions`.
  // No se deben sumar los casilleros 303-399 porque también pueden contener
  // bases imponibles y producir valores ajenos al total real del formulario.
  const incomeRetention = Number(current.retentions ?? retentions ?? declaration?.incomeTaxRetention ?? 0);
  reportTable(doc, ['RESUMEN EJECUTIVO DE RETENCIONES', 'VALOR'], [['Retenciones declaradas (historial)', reportMoney(incomeRetention)], ['Retenciones de IVA', reportMoney(0)], ['Total declarado', reportMoney(retentions)]], [420, 337]);
  reportParagraph(doc, `Estado: ${retentions || incomeRetention ? 'DECLARADO' : 'PENDIENTE'} · Fecha de presentación: ${declaration?.registeredAt ? new Date(declaration.registeredAt).toLocaleDateString('es-EC') : 'No registrada'} · Formulario: Retenciones · Adjunto: ${declaration?.retentionFile || 'No registrado'}.`);
  if (false && retentionGroups.length) {
    const rows = retentionGroups.flatMap((group: any) => (Array.isArray(group.fields) ? group.fields : []).filter((field: any) => Number(field.value) > 0).map((field: any) => [String(group.label || 'Casillero'), String(field.code || ''), reportMoney(field.value)]));
    reportTable(doc, ['CONCEPTO', 'CASILLERO', 'VALOR'], rows, [510, 100, 147]);
  } else reportParagraph(doc, retentions ? `Retenciones declaradas: ${reportMoney(retentions)}.` : 'No existe detalle de retenciones registrado para este período.');

  */
  doc.fillColor('#1473b8').fontSize(12).text('Resumen de obligaciones', 42.5, doc.y);
  doc.moveDown(0.6);
  reportTable(doc, ['OBLIGACIÓN', 'VALOR', 'ESTADO'], [['IVA', reportMoney(iva), iva ? 'Registrado' : 'Pendiente'], ['Retenciones', reportMoney(retentions), retentions ? 'Registrado' : 'Pendiente'], ['TOTAL OBLIGACIONES', reportMoney(iva + retentions), iva + retentions ? 'Registrado' : 'Pendiente']], [430, 170, 157]);

  reportPage(doc, sectionTitle('tax'), `Acumulado fiscal hasta ${monthName} de ${year}`, false);
  const remainingMonths = Math.max(1, 12 - Number(data.monthNum));
  const suggestedProvision = Number((Number(annual.taxPayable || 0) / remainingMonths).toFixed(2));
  reportTable(doc, ['PROYECCIÓN DE IMPUESTO A LA RENTA', 'VALOR'], [['Ingresos acumulados', reportMoney(annual.sales)], ['(-) Costos', reportMoney(annual.costs)], ['(-) Gastos de empleados', reportMoney(annual.employeeExpense)], ['(=) Utilidad contable', reportMoney(annual.utility)], ['(+) Ajustes tributarios', reportMoney(0)], ['(=) Base imponible proyectada', reportMoney(annual.base)], ['Tarifa aplicable', current.rate || 'No definida'], ['IR estimado', reportMoney(annual.tax)], ['(-) Retenciones / anticipos acumulados', reportMoney(annual.taxRetentions)], ['(=) Impuesto pendiente estimado', reportMoney(annual.taxPayable)], ['Provisión mensual sugerida', reportMoney(suggestedProvision)]], [420, 337]);
  if (selectedMonths.length) {
    doc.fillColor('#1473b8').fontSize(12).text('Detalle mensual del impuesto a la renta', PAGE_X, doc.y);
    doc.moveDown(0.6);
    reportTable(doc, ['MES', 'VENTAS', 'COSTOS', 'BASE ACUMULADA', 'REGLA / TARIFA', 'IMPUESTO'], selectedMonths.map((row: any) => [
      String(row.name || ''), reportMoney(row.sales), reportMoney(row.costs), reportMoney(row.accumulatedBase), String(row.rate || ''), reportMoney(row.tax)
    ]), [95, 105, 105, 125, 170, 95]);
  }
  reportParagraph(doc, `Fórmula de provisión: ${reportMoney(annual.taxPayable)} ÷ ${remainingMonths} meses restantes = ${reportMoney(suggestedProvision)} mensuales.`);
  reportParagraph(doc, `Regla aplicada: ${current.rate || 'No definida'}. El cálculo corresponde a la configuración tributaria registrada y no incluye ajustes que no hayan sido ingresados en el sistema.`);

  reportPage(doc, sectionTitle('indicators'), '', false);
  reportTable(doc, ['INDICADOR', 'RESULTADO', 'ESTADO'], [['Resultado del mes', reportMoney(current.utility), Number(current.utility || 0) >= 0 ? 'POSITIVO' : 'REVISAR'], ['Resultado acumulado', reportMoney(annual.utility), Number(annual.utility || 0) >= 0 ? 'POSITIVO' : 'REVISAR'], ['IVA declarado', reportMoney(iva), iva ? 'REGISTRADO' : 'PENDIENTE'], ['Retenciones declaradas', reportMoney(retentions), retentions ? 'REGISTRADO' : 'PENDIENTE']], [430, 170, 157]);

  reportPage(doc, sectionTitle('attachments'), '', false);
  const latestDocuments = new Map<string, any>();
  documents.forEach(item => {
    const key = `${item.documentGroup || 'Documento'}|${item.documentType || item.originalName || ''}`;
    const previous = latestDocuments.get(key);
    if (!previous || Number(item.version || 1) > Number(previous.version || 1)) latestDocuments.set(key, item);
  });
  const financialDocumentIds = new Set([financialSummary?.balance_document_id, financialSummary?.results_document_id].filter(Boolean).map(Number));
  const attachmentDocuments = [...latestDocuments.values()].filter(item => String(item.documentGroup || '').toLowerCase() !== 'financial statements' || financialDocumentIds.has(Number(item.id)));
  const filteredAttachmentRows = attachmentDocuments.map(item => [String(item.documentGroup || 'Documento'), String(item.originalName || 'Sin nombre'), `v${item.version || 1}.0`]);
  const attachmentLinks = attachmentDocuments.map(item => `${apiBaseUrl()}/public/document-download?token=${encodeURIComponent(sign({ periodId: data.periodId, documentId: item.id, userCode: data.userCode, role: data.role }))}`);
  if (filteredAttachmentRows.length) reportTable(doc, ['SECCIÓN', 'DOCUMENTO', 'VERSIÓN'], filteredAttachmentRows, [230, 460, 67], doc.y, attachmentLinks);
  else reportParagraph(doc, 'No existen documentos adjuntos para este período.');

  const conclusionsSectionTitle = sectionTitle('conclusions');
  reportPage(doc, conclusionsSectionTitle, '', false);
  reportParagraph(doc, `De acuerdo con la información procesada al cierre de ${monthName} ${year}, el resultado acumulado registrado es de ${reportMoney(annual.utility)}.`);
  reportParagraph(doc, 'Se recomienda revisar periódicamente las cuentas por cobrar y por pagar, validar las declaraciones tributarias contra los formularios originales y mantener actualizados los documentos de respaldo del período.');
  reportAccountantComment(doc, data.comment || 'Sin observaciones adicionales.', conclusionsSectionTitle);
  doc.moveDown(2).fillColor('#334155').fontSize(10).text('Atentamente,', 42.5);
  doc.moveDown(1).fillColor('#1f3f68').fontSize(11).text('ContaMatic');
  doc.fillColor('#64748b').fontSize(9).text('Sistema de control contable y tributario');
  doc.end();
  await new Promise<void>(resolve => doc.once('end', () => resolve()));
  return { report: Buffer.concat(chunks), embeddedMarkers };
}

export async function createCombinedShareLink(req: Request, res: Response) {
  const period = await periodModel.findById(String(req.params.id), req.user!.codigo, req.user!.role);
  if (!period || period.status !== 'Completado') return res.status(409).json({ ok: false, error: 'Solo se pueden enviar periodos completados' });
  const comment = String(req.body?.comment || '').trim().slice(0, 1000);
  const shared = await periodModel.share(String(period.id), req.user!.codigo, req.user!.role, comment);
  if (!shared) return res.status(409).json({ ok: false, error: 'El periodo no está disponible para envío' });
  const token = sign({ periodId: period.id, clientId: period.clientId, year: period.year, monthNum: period.monthNum, userCode: req.user!.codigo, userName: req.user!.nombre, role: req.user!.role, comment });
  return res.json({ ok: true, data: { token, expiresIn: TTL } });
}

export async function createCombinedPreviewLink(req: Request, res: Response) {
  const period = await periodModel.findById(String(req.params.id), req.user!.codigo, req.user!.role);
  if (!period || period.status !== 'Completado') return res.status(409).json({ ok: false, error: 'Solo se pueden visualizar periodos completados' });
  const token = sign({ periodId: period.id, clientId: period.clientId, year: period.year, monthNum: period.monthNum, userCode: req.user!.codigo, userName: req.user!.nombre, role: req.user!.role, comment: period.sharedComment || '' });
  return res.json({ ok: true, data: { token, expiresIn: TTL } });
}

export async function downloadPublicDocument(req: Request, res: Response) {
  const data: any = read(String(req.query.token || ''));
  if (!data?.periodId || !data?.documentId || !data?.userCode || !data?.role) {
    return res.status(403).json({ ok: false, error: 'El enlace de descarga no es válido o ya expiró' });
  }
  try {
    const documents = await documentModel.findByPeriod(String(data.periodId), Number(data.userCode), data.role);
    const file = documents.find((item: any) => String(item.id) === String(data.documentId));
    const absolutePath = file ? path.resolve(file.filePath) : '';
    const exists = absolutePath ? await fs.stat(absolutePath).catch(() => null) : null;
    if (!file || !exists) return res.status(404).json({ ok: false, error: 'Archivo no encontrado en el almacenamiento' });
    return res.download(absolutePath, file.originalName, { headers: { 'Content-Type': file.mimeType || 'application/octet-stream' } });
  } catch {
    return res.status(404).json({ ok: false, error: 'Archivo no encontrado en el almacenamiento' });
  }
}

export async function downloadCombinedPdf(req: Request, res: Response) {
  const data: any = read(String(req.query.token || ''));
  if (!data) return res.status(403).json({ ok: false, error: 'El enlace no es válido o ya expiró' });
  try {
    const userName = String(data.userName || (await findUserById(Number(data.userCode)))?.name || 'ContaMatic');
    const [detail, documents, accounts, declaration, movements, financialSummary, financialSummaries] = await Promise.all([
      annualTaxService.getAnnualDetail(String(data.clientId), String(data.year), Number(data.userCode)),
      documentModel.findByPeriod(String(data.periodId), Number(data.userCode), data.role),
      portfolioModel.summaryByClientYear(String(data.clientId), String(data.year)),
      declarationModel.findByPeriod(String(data.periodId), Number(data.userCode), data.role),
      portfolioModel.findMovementsByPeriod(String(data.periodId)),
      declarationModel.findFinancialSummaryByPeriod(String(data.periodId)),
      declarationModel.findFinancialSummariesByClientYear(String(data.clientId), String(data.year))
    ]);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="contamatic-${data.year}-${data.monthNum}.pdf"`);
    const generated = await buildLexfinReport({ detail, documents, accounts, declaration, data: { ...data, userName }, movements, financialSummary, financialSummaries });
    const report = await mergeEmbeddedPdfPages(generated.report, generated.embeddedMarkers);
    return res.end(report);
  } catch (error: any) { return res.status(400).json({ ok: false, error: error?.message || 'No se pudo generar el reporte consolidado' }); }
}
