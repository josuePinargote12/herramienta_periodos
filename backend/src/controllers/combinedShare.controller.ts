import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import { PDFDocument as PdfLibDocument } from 'pdf-lib';
import * as XLSX from 'xlsx';
import type { Request, Response } from 'express';
import * as periodModel from '../models/period.model.js';
import * as documentModel from '../models/document.model.js';
import * as portfolioModel from '../models/portfolio.model.js';
import * as annualTaxService from '../services/annualTax.service.js';
import * as declarationModel from '../models/declaration.model.js';

const TTL = 24 * 60 * 60;
const PAGE_X = 42.5;
const PAGE_WIDTH = 757;
const secret = () => process.env.SHARE_LINK_SECRET || 'contamatic-share-secret';
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

async function renderAccountWorkbooks(documents: any[]) {
  const workbooks = documents.filter(item =>
    String(item.documentGroup || '').toLowerCase() === 'portfolio' &&
    !String(item.originalName || '').toLowerCase().endsWith('.pdf')
  );
  if (!workbooks.length) return null;
  const chunks: Buffer[] = [];
  const output = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 36 });
  output.on('data', chunk => chunks.push(Buffer.from(chunk)));
  const pageWidth = 770;
  const pageHeight = 520;
  let hasPage = false;
  for (const item of workbooks) {
    try {
      const filePath = path.resolve(String(item.filePath || ''));
      const workbook = XLSX.read(await fs.readFile(filePath), { cellDates: true });
      for (const sheetName of workbook.SheetNames) {
        const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, raw: false }) as unknown[][];
        if (!rows.length) continue;
        if (hasPage) output.addPage();
        hasPage = true;
        output.fontSize(13).fillColor('#1f3f68').text(`Cuentas por cobrar y por pagar - ${item.originalName}`, 36, 36, { width: pageWidth });
        output.fontSize(9).fillColor('#64748b').text(`Hoja: ${sheetName}`, 36, 54, { width: pageWidth });
        const columns = Math.min(Math.max(...rows.map(row => row.length), 1), 10);
        const widths = Array.from({ length: columns }, (_, column) => {
          const longest = Math.max(...rows.slice(0, 20).map(row => String(row[column] ?? '').length), 8);
          return Math.min(Math.max(longest * 5.2 + 10, 55), pageWidth / columns);
        });
        const totalWidth = widths.reduce((sum, width) => sum + width, 0);
        const scale = pageWidth / totalWidth;
        const scaledWidths = widths.map(width => width * scale);
        let y = 78;
        rows.forEach((row, rowIndex) => {
          if (y > pageHeight) { output.addPage(); y = 36; }
          let x = 36;
          const height = rowIndex === 0 ? 28 : 21;
          for (let column = 0; column < columns; column += 1) {
            const width = scaledWidths[column];
            output.fillColor(rowIndex === 0 ? '#1f4778' : rowIndex % 2 ? '#f8fafc' : '#eef3f8').rect(x, y, width, height).fill();
            output.strokeColor('#cbd5e1').rect(x, y, width, height).stroke();
            output.fillColor(rowIndex === 0 ? '#fff' : '#26364d').fontSize(rowIndex === 0 ? 7 : 6.5).text(String(row[column] ?? ''), x + 3, y + 6, { width: width - 6, height: height - 8, ellipsis: true });
            x += width;
          }
          y += height;
        });
      }
    } catch {
      // Un archivo de cuentas inválido no impide generar el reporte.
    }
  }
  if (!hasPage) { output.end(); return null; }
  output.end();
  await new Promise<void>(resolve => output.once('end', () => resolve()));
  return Buffer.concat(chunks);
}

export async function createCombinedShareLink(req: Request, res: Response) {
  const period = await periodModel.findById(String(req.params.id), req.user!.codigo, req.user!.role);
  if (!period || period.status !== 'Completado') return res.status(409).json({ ok: false, error: 'Solo se pueden enviar periodos completados' });
  const comment = String(req.body?.comment || '').trim().slice(0, 1000);
  const shared = await periodModel.share(String(period.id), req.user!.codigo, req.user!.role, comment);
  if (!shared) return res.status(409).json({ ok: false, error: 'El periodo no está disponible para envío' });
  const token = sign({ periodId: period.id, clientId: period.clientId, year: period.year, monthNum: period.monthNum, userCode: req.user!.codigo, role: req.user!.role, comment });
  return res.json({ ok: true, data: { token, expiresIn: TTL } });
}

export async function createCombinedPreviewLink(req: Request, res: Response) {
  const period = await periodModel.findById(String(req.params.id), req.user!.codigo, req.user!.role);
  if (!period || period.status !== 'Completado') return res.status(409).json({ ok: false, error: 'Solo se pueden visualizar periodos completados' });
  const token = sign({ periodId: period.id, clientId: period.clientId, year: period.year, monthNum: period.monthNum, userCode: req.user!.codigo, role: req.user!.role, comment: period.sharedComment || '' });
  return res.json({ ok: true, data: { token, expiresIn: TTL } });
}

export async function downloadCombinedPdf(req: Request, res: Response) {
  const data: any = read(String(req.query.token || ''));
  if (!data) return res.status(403).json({ ok: false, error: 'El enlace no es válido o ya expiró' });
  try {
    const [detail, documents, accounts, declaration] = await Promise.all([
      annualTaxService.getAnnualDetail(String(data.clientId), String(data.year), Number(data.userCode)),
      documentModel.findByPeriod(String(data.periodId), Number(data.userCode), data.role),
      portfolioModel.summaryByClientYear(String(data.clientId), String(data.year)),
      declarationModel.findByPeriod(String(data.periodId), Number(data.userCode), data.role)
    ]);
    const money = (value: unknown) => `$${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const months = detail.months.filter((row: any) => Number(row.month) <= Number(data.monthNum));
    const accountRows = accounts.filter((row: any) => Number(row.fiscalMonth) === Number(data.monthNum));
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: PAGE_X });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="contamatic-${data.year}-${data.monthNum}.pdf"`);
    const generatedChunks: Buffer[] = [];
    doc.on('data', chunk => generatedChunks.push(Buffer.from(chunk)));
    doc.on('end', async () => {
      try {
        const report = await mergeFinancialPdfPages(Buffer.concat(generatedChunks), documents);
        res.end(report);
      } catch {
        res.end(Buffer.concat(generatedChunks));
      }
    });
    doc.fontSize(18).fillColor('#1f3f68').text('ContaMatic - Reporte consolidado', PAGE_X, doc.y, { width: PAGE_WIDTH, align: 'center' });
    doc.fontSize(9).fillColor('#64748b').text(`Cliente: ${detail.client.name} · RUC/Cédula: ${detail.client.ruc} · Periodo: ${months.at(-1)?.name || data.monthNum} ${data.year}`);
    doc.x = PAGE_X;
    const financialDocuments = documents.filter((item: any) => String(item.documentGroup || '').toLowerCase() === 'financial statements');
    const accountDocuments = documents.filter((item: any) => String(item.documentGroup || '').toLowerCase() === 'portfolio');
    const documentSection = (title: string, items: any[]) => {
      if (!items.length) return;
      doc.moveDown().fontSize(12).fillColor('#1f3f68').text(title, PAGE_X);
    };
    if (false && documents.length) {
      doc.moveDown().fontSize(12).fillColor('#1f3f68').text('Estados y documentos del periodo');
      doc.fontSize(9).fillColor('#334155').text(documents.map((item: any) => `${item.documentGroup}: ${item.originalName} (v${item.version})`).join(' | '));
    }
    let y = doc.y;
    const draw = (values: string[], widths: number[], header = false) => { const rowHeight = header ? 34 : 22; let x = PAGE_X; values.forEach((value, index) => { const width = widths[index]; doc.fillColor(header ? '#1f4778' : '#f3f6fa').rect(x, y, width, rowHeight).fill(); doc.strokeColor('#cbd5e1').rect(x, y, width, rowHeight).stroke(); doc.fillColor(header ? '#fff' : '#26364d').fontSize(header ? 6.5 : 8).text(value, x + 4, y + (header ? 7 : 7), { width: width - 8, height: rowHeight - 8, align: header ? 'center' : index === 0 ? 'left' : 'right' }); x += width; }); doc.x = PAGE_X; y += rowHeight; };
    if (accountRows.length) {
      doc.moveDown().fontSize(12).fillColor('#1f3f68').text('Cuentas del periodo');
      draw(['TIPO', 'TOTAL', 'PENDIENTE', 'MOVIMIENTOS'], [220, 150, 150, 130], true);
      accountRows.forEach((row: any) => draw([row.accountType === 'CXC' ? 'Cuentas por cobrar' : 'Cuentas por pagar', money(row.totalAmount), money(row.pendingAmount), String(row.movementCount || 0)], [220, 150, 150, 130]));
    }
    const ivaGroups = Array.isArray(declaration?.ivaDetailRows)
      ? declaration.ivaDetailRows
      : declaration?.ivaDetailRows ? JSON.parse(String(declaration.ivaDetailRows)) : [];
    const drawIvaTable = (title: string, rows: any[]) => {
      if (!rows.length) return;
      if (doc.y > 480) doc.addPage();
      const x = PAGE_X; const widths = [330, 142, 142, 143]; const top = doc.y; const barHeight = 30;
      doc.fillColor('#1f4778').rect(x, top, PAGE_WIDTH, barHeight).fill();
      doc.fillColor('#fff').fontSize(8).text(title, x + 5, top + 6, { width: 290, height: 20, ellipsis: true });
      ['VALOR BRUTO', 'VALOR NETO', 'IMPUESTO GENERADO'].forEach((label, index) => doc.fillColor('#fff').fontSize(7).text(label, x + 330 + index * 142 + 4, top + 10, { width: 134, align: 'center' }));
      y = top + barHeight;
      rows.forEach((group: any) => {
        const fields = (Array.isArray(group.fields) ? group.fields : []).filter((field: any) => Number(field?.value) > 0);
        if (!fields.length) return;
        doc.fillColor('#f3f6fa').rect(x, y, PAGE_WIDTH, 22).fill();
        doc.strokeColor('#cbd5e1').rect(x, y, PAGE_WIDTH, 22).stroke();
        doc.fillColor('#26364d').fontSize(7).text(String(group.label || 'Casillero del formulario'), x + 4, y + 7, { width: 322, ellipsis: true });
        fields.slice(0, 3).forEach((field: any, index: number) => { const col = x + 330 + index * 142; const key = ['419', '519'].includes(String(field.code)); if (key) doc.fillColor('#FEF08A').rect(col + 1, y + 1, 140, 20).fill(); doc.fillColor(key ? '#000000' : '#5b7fa6').text(String(field.code || ''), col + 4, y + 7, { width: 42, align: 'center' }); doc.fillColor(key ? '#000000' : '#26364d').text(money(field.value), col + 55, y + 7, { width: 78, align: 'right' }); });
        y += 22;
      });
      y += 16; doc.y = y;
    };
    if (ivaGroups.length) {
      doc.moveDown(1).fontSize(12).fillColor('#1f3f68').text(`Declaracion de IVA - ${months.find((row: any) => Number(row.month) === Number(data.monthNum))?.name || 'periodo seleccionado'}`);
      const rows = ivaGroups.map((group: any) => ({ ...group, fields: Array.isArray(group.fields) ? group.fields : [] }));
      const validGroups = rows.filter((group: any) => group.fields.some((field: any) => Number(field.value) > 0) && !/factor de proporcionalidad/i.test(group.label || ''));
      const sales = validGroups.filter((group: any) => Number(group.fields[0]?.code) >= 400 && Number(group.fields[0]?.code) < 480);
      const expenses = validGroups.filter((group: any) => Number(group.fields[0]?.code) >= 500 && Number(group.fields[0]?.code) < 600);
      const expenseTotal = expenses.findIndex((group: any) => /^TOTAL ADQUISICIONES Y PAGOS$/i.test(group.label || ''));
      drawIvaTable('RESUMEN DE VENTAS Y OTRAS OPERACIONES DEL PERIODO QUE DECLARA', sales);
      drawIvaTable('RESUMEN DE ADQUISICIONES Y PAGOS DEL PERIODO QUE DECLARA', expenses.slice(0, expenseTotal >= 0 ? expenseTotal + 1 : expenses.length));
    }
    if (false && ivaGroups.length) {
      doc.moveDown(1).fontSize(12).fillColor('#1f3f68').text(`Declaración de IVA - ${months.find((row: any) => Number(row.month) === Number(data.monthNum))?.name || 'periodo seleccionado'}`);
      ivaGroups.forEach((group: any) => {
        const fields = Array.isArray(group.fields) ? group.fields : [];
        if (!fields.length) return;
        y = doc.y;
        doc.fontSize(8).fillColor('#334155').text(String(group.label || 'Detalle de declaración'), 28, y, { width: 700 });
        y = doc.y + 4;
        draw(['VALOR BRUTO', 'VALOR NETO', 'IMPUESTO GENERADO'], [233, 233, 234], true);
        for (let index = 0; index < fields.length; index += 3) {
          const cells = fields.slice(index, index + 3).map((field: any) => `${field.code || ''}  ${money(field.value)}`);
          while (cells.length < 3) cells.push('');
          draw(cells, [233, 233, 234]);
        }
      });
    }
    doc.x = 28;
    doc.moveDown(1).fontSize(12).fillColor('#1f3f68').text(`Detalle del Impuesto a la Renta acumulado hasta ${months.at(-1)?.name || data.monthNum}`, 28);
    y = doc.y;
    const taxWidths = [50, 70, 70, 62, 65, 70, 70, 75, 145, 70];
    draw(['MES', 'VENTAS DEL MES', 'COSTOS BASE DEL MES', 'GASTO EMPLEADOS', 'UTILIDAD DEL MES', 'RETENCIONES PARA IMPUESTO', 'IMPUESTO POR PAGAR', 'BASE ACUMULADA', 'TARIFA / REGLA APLICADA', 'IMPUESTO CAUSADO'], taxWidths, true);
    months.forEach((row: any) => draw([row.name, money(row.sales), money(Number(row.costs || 0) - Number(row.employeeExpense || 0)), money(row.employeeExpense), money(row.utility), money(row.incomeTaxRetention), money(row.taxAfterRetentions), money(row.accumulatedBase), row.rate, money(row.tax)], taxWidths));
    draw(['TOTAL ANUAL', money(detail.annual.sales), money(Number(detail.annual.costs) - Number(detail.annual.employeeExpense || 0)), money(detail.annual.employeeExpense), money(detail.annual.utility), money(detail.annual.taxRetentions), money(detail.annual.taxPayable), money(detail.annual.base), '', money(detail.annual.tax)], taxWidths);
    const payableWidth = taxWidths.reduce((sum, width) => sum + width, 0);
    if (y + 78 > doc.page.height - PAGE_X) { doc.addPage(); y = doc.y; }
    doc.fillColor('#ECFDF5').rect(PAGE_X, y, payableWidth, 42).fill();
    doc.strokeColor('#10B981').lineWidth(1.5).rect(PAGE_X, y, payableWidth, 42).stroke();
    doc.y = y;
    doc.fillColor('#1f3f68').fontSize(9).text('IMPUESTO POR PAGAR', PAGE_X + 10, y + 9, { width: payableWidth - 150 });
    doc.fillColor('#526277').fontSize(7).text('Impuesto causado - retenciones para impuesto', PAGE_X + 10, y + 25, { width: payableWidth - 150 });
    doc.fillColor('#15803d').fontSize(16).text(money(detail.annual.taxPayable), PAGE_X + payableWidth - 105, y + 12, { width: 95, align: 'right' });
    doc.y = y + 42;
    doc.x = 28;
    doc.moveDown(1).fontSize(11).fillColor('#1f3f68').text('Comentario', 28);
    doc.x = 28;
    doc.fontSize(10).fillColor('#334155').text(data.comment || 'Sin comentario agregado.', 28, doc.y, { width: payableWidth });
    doc.end();
  } catch (error: any) { return res.status(400).json({ ok: false, error: error?.message || 'No se pudo generar el reporte consolidado' }); }
}
