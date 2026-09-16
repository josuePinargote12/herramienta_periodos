import type { Request, Response } from 'express';
import PDFDocument from 'pdfkit';
import * as declarationModel from '../models/declaration.model.js';

const json = (value: unknown): any[] => { try { const parsed = Array.isArray(value) ? value : JSON.parse(String(value || '[]')); return Array.isArray(parsed) ? parsed : []; } catch { return []; } };
const amount = (value: unknown) => Number(value || 0);
const monthName = (num: number) => new Date(2000, num - 1, 1).toLocaleString('es-ES', { month: 'long' });

const PAGE_X = 28;

export async function previewDeclarationsPdf(req: Request, res: Response) {
  const clientId = String(req.query.clientId || '');
  const year = String(req.query.year || '');
  const months = String(req.query.months || '').split(',').map(Number).filter(month => Number.isInteger(month) && month > 0 && month < 13);
  if (!clientId || !year) return res.status(400).json({ ok: false, error: 'Cliente y año son obligatorios' });
  const declarations = await declarationModel.findByClientYear(clientId, year, req.user!.codigo, req.user!.role, months);
  if (!declarations.length) return res.status(404).json({ ok: false, error: 'No hay declaraciones para los meses seleccionados' });

  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 28 });
  res.setHeader('Content-Type', 'application/pdf');
  const clientFileName = String(declarations[0].clientName || 'cliente')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '');
  res.setHeader('Content-Disposition', `attachment; filename="declaraciones-${clientFileName}-${year}.pdf"`);
  doc.pipe(res);

  const drawTable = (title: string, rows: any[]) => {
    const x = PAGE_X; const rowH = 22;
    if (doc.y > 480) doc.addPage();

    const top = doc.y;
    doc.fontSize(9);
    const titleHeight = doc.heightOfString(title, { width: 292 });
    const barHeight = Math.max(22, titleHeight + 12);

    doc.fillColor('#1f4778').rect(x, top, 681, barHeight).fill();
    doc.fillColor('#ffffff').fontSize(9).text(title, x + 5, top + 6, { width: 292 });

    let cx = x + 300;
    ['VALOR BRUTO', 'VALOR NETO', 'IMPUESTO GENERADO'].forEach((label) => {
      doc.fillColor('#ffffff').fontSize(9)
        .text(label, cx + 4, top + (barHeight - 10) / 2, { width: 127, align: 'center' });
      cx += 127;
    });

    doc.y = top + barHeight;

    rows.forEach(row => {
      if (doc.y > 550) doc.addPage();
      const rowTop = doc.y;
      doc.fillColor('#f3f6fa').rect(x, rowTop, 681, rowH).fill();
      doc.strokeColor('#cbd5e1').rect(x, rowTop, 681, rowH).stroke();
      doc.fillColor('#26364d').fontSize(7)
        .text(row.label, x + 4, rowTop + 7, { width: 292, ellipsis: true });
      row.fields.slice(0, 3).forEach((field: any, index: number) => {
        const col = x + 300 + index * 127;
        doc.fillColor('#5b7fa6').fontSize(7)
          .text(String(field?.code || ''), col + 4, rowTop + 7, { width: 48, align: 'center' });
        doc.fillColor('#26364d').fontSize(7)
          .text(field?.value == null ? '' : amount(field.value).toFixed(2), col + 55, rowTop + 7, { width: 68, align: 'right' });
      });
      doc.y = rowTop + rowH;
    });

    doc.y += 16;
  };

  doc.fontSize(18).fillColor('#1f3f68').text('Detalle de declaraciones tributarias');
  doc.fontSize(9).fillColor('#64748b').text(`Cliente: ${declarations[0].clientName || clientId} · Año fiscal: ${year}`);

  const totals = declarations.reduce((total: any, declaration: any) => ({
    sales: total.sales + amount(declaration.ivaCosts),
    costs: total.costs + amount(declaration.ivaValues),
    retentions: total.retentions + amount(declaration.retentions)
  }), { sales: 0, costs: 0, retentions: 0 });

  doc.y += 20;
  doc.fontSize(11).fillColor('#1f3f68').text('SUMATORIA DE LOS MESES SELECCIONADOS', PAGE_X, doc.y);

  const summaryTop = doc.y;
  const summaryLabels = ['VENTAS', 'COSTOS Y GASTOS', 'RETENCIONES'];
  const summaryValues = [totals.sales, totals.costs, totals.retentions];
  summaryLabels.forEach((label, index) => {
    const x = PAGE_X + index * 227;
    doc.fillColor('#eef4fa').rect(x, summaryTop, 215, 42).fill();
    doc.strokeColor('#cbd5e1').rect(x, summaryTop, 215, 42).stroke();
    doc.fillColor('#526277').fontSize(8).text(label, x + 8, summaryTop + 8);
    doc.fillColor('#1f3f68').fontSize(12).text(summaryValues[index].toFixed(2), x + 8, summaryTop + 22);
  });
  doc.y = summaryTop + 52;

  declarations.forEach((declaration: any) => {
    doc.y += 16;
    doc.fontSize(11).fillColor('#1f3f68').text(monthName(Number(declaration.monthNum)).toUpperCase(), PAGE_X, doc.y);
    doc.y += 4;

    const groups = json(declaration.ivaDetailRows)
      .map(group => ({
        label: group.label || 'Casillero del formulario',
        fields: (group.fields || []).filter((field: any) => amount(field.value) > 0)
      }))
      .filter(group => group.fields.length);

    drawTable('RESUMEN DE VENTAS Y OTRAS OPERACIONES DEL PERIODO QUE DECLARA', groups.filter(group => Number(group.fields[0]?.code) < 500));
    drawTable('RESUMEN DE ADQUISICIONES Y PAGOS DEL PERIODO QUE DECLARA', groups.filter(group => Number(group.fields[0]?.code) >= 500));
  });

  doc.end();
}
