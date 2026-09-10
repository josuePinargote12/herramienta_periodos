import type { Request, Response } from 'express';
import * as XLSX from 'xlsx';
import PDFDocument from 'pdfkit';
import * as annualTaxService from '../services/annualTax.service.js';

function params(req: Request) {
  const clientId = String(req.params.clientId || '');
  const year = String(req.params.fiscalYear || '');
  if (!clientId || !/^\d{4}$/.test(year)) throw new Error('Cliente y año fiscal son obligatorios');
  return { clientId, year };
}

export async function getAnnualDetail(req: Request, res: Response) {
  try {
    const { clientId, year } = params(req);
    return res.json({ ok: true, data: await annualTaxService.getAnnualDetail(clientId, year, req.user!.codigo) });
  } catch (error: any) {
    return res.status(error?.message === 'Cliente no encontrado' ? 404 : 400).json({ ok: false, error: error?.message || 'No se pudo consultar el detalle anual' });
  }
}

export async function exportAnnualDetailExcel(req: Request, res: Response) {
  try {
    const { clientId, year } = params(req);
    const detail = await annualTaxService.getAnnualDetail(clientId, year, req.user!.codigo);
    const rows = detail.months.map(row => ({ MES: row.name, 'VENTAS DEL MES': row.sales, 'COSTOS BASE DEL MES': row.costs, 'GASTO EMPLEADOS': row.employeeExpense, UTILIDAD: row.utility, RETENCIONES: row.retentions, 'RETENCIONES PARA IMPUESTO': row.incomeTaxRetention, 'IMPUESTO POR PAGAR': row.taxAfterRetentions, 'BASE ACUMULADA': row.accumulatedBase, 'TARIFA APLICADA': row.rate, 'IMPUESTO CAUSADO': row.tax }));
    rows.push({ MES: 'TOTAL ANUAL', 'VENTAS DEL MES': detail.annual.sales, 'COSTOS BASE DEL MES': detail.annual.costs, 'GASTO EMPLEADOS': detail.annual.employeeExpense, UTILIDAD: detail.annual.utility, RETENCIONES: detail.annual.retentions, 'RETENCIONES PARA IMPUESTO': detail.annual.taxRetentions, 'IMPUESTO POR PAGAR': detail.annual.taxPayable, 'BASE ACUMULADA': detail.annual.base, 'TARIFA APLICADA': '', 'IMPUESTO CAUSADO': detail.annual.tax } as any);
    rows.push({ MES: 'IMPUESTO POR PAGAR (IMPUESTO CAUSADO - RETENCIONES)', 'IMPUESTO POR PAGAR': detail.annual.taxPayable } as any);
    const sheet = XLSX.utils.json_to_sheet(rows);
    sheet['!cols'] = [{ wch: 15 }, { wch: 17 }, { wch: 16 }, { wch: 18 }, { wch: 42 }, { wch: 20 }];
    const summary = XLSX.utils.json_to_sheet([
      { CONCEPTO: 'Cliente', VALOR: detail.client.name },
      { CONCEPTO: 'RUC / Cédula', VALOR: detail.client.ruc },
      { CONCEPTO: 'Año fiscal', VALOR: detail.fiscalYear },
      { CONCEPTO: 'Retenciones anuales', VALOR: detail.annual.retentions },
      { CONCEPTO: 'Ventas anuales', VALOR: detail.annual.sales },
      { CONCEPTO: 'Costos y gastos anuales', VALOR: detail.annual.costs },
      { CONCEPTO: 'Gasto empleados anual', VALOR: detail.annual.employeeExpense },
      { CONCEPTO: 'Utilidad anual', VALOR: detail.annual.utility },
      { CONCEPTO: 'Base anual acumulada', VALOR: detail.annual.base },
      { CONCEPTO: 'Impuesto anual por pagar (después de retenciones)', VALOR: detail.annual.taxPayable },
      { CONCEPTO: 'Estado', VALOR: detail.annual.status }
    ]);
    summary['!cols'] = [{ wch: 30 }, { wch: 20 }];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, 'Detalle mensual');
    XLSX.utils.book_append_sheet(workbook, summary, 'Resumen anual');
    const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="detalle-impuesto-renta-${year}.xlsx"`);
    return res.send(buffer);
  } catch (error: any) { return res.status(400).json({ ok: false, error: error?.message || 'No se pudo exportar a Excel' }); }
}

export async function exportAnnualDetailPdf(req: Request, res: Response) {
  try {
    const { clientId, year } = params(req);
    const detail = await annualTaxService.getAnnualDetail(clientId, year, req.user!.codigo);
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 28 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="detalle-impuesto-renta-${year}.pdf"`);
    doc.pipe(res);
    const money = (value: number) => `$${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    doc.fontSize(18).fillColor('#1f3f68').text('Detalle anual del Impuesto a la Renta');
    doc.fontSize(9).fillColor('#64748b').text('Cliente: ' + (detail.client.name || '—') + '  ·  RUC / Cédula: ' + (detail.client.ruc || '—'));
    doc.fontSize(9).fillColor('#64748b').text(`Año fiscal: ${year} · Régimen: ${detail.configuration.regime || '—'} · Contribuyente: ${detail.configuration.taxpayer || '—'}`);
    doc.moveDown();
    const columns = [['MES', 39], ['VENTAS', 65], ['COSTOS BASE', 68], ['GASTO EMPLEADOS', 68], ['UTILIDAD', 65], ['RETENCIONES', 62], ['RET. IMPUESTO', 65], ['IMPUESTO POR PAGAR', 82], ['BASE ACUMULADA', 76], ['TARIFA / REGLA', 115], ['IMPUESTO CAUSADO', 75]];
    let y = doc.y;
    const drawRow = (values: string[], header = false) => { let x = 28; values.forEach((value, i) => { const width = columns[i][1] as number; doc.fillColor(header ? '#1f4778' : '#f3f6fa').rect(x, y, width, 23).fill(); doc.strokeColor('#cbd5e1').rect(x, y, width, 23).stroke(); doc.fillColor(header ? '#fff' : '#26364d').fontSize(header ? 7 : 7).text(value, x + 4, y + 8, { width: width - 8, align: i > 0 ? 'right' : 'left', ellipsis: true }); x += width; }); y += 23; };
    drawRow(columns.map(column => String(column[0])), true);
    detail.months.forEach(row => drawRow([row.name, money(row.sales), money(row.costs), money(row.employeeExpense), money(row.utility), money(row.retentions), money(row.incomeTaxRetention), money(row.taxAfterRetentions), money(row.accumulatedBase), row.rate, money(row.tax)]));
    drawRow(['TOTAL ANUAL', money(detail.annual.sales), money(detail.annual.costs), money(detail.annual.employeeExpense), money(detail.annual.utility), money(detail.annual.retentions), money(detail.annual.taxRetentions), money(detail.annual.taxPayable), money(detail.annual.base), '', money(detail.annual.tax)]);
    const payableY = y; const payableX = 384; const payableWidth = 92;
    doc.fillColor('#f0fdf4').rect(28, payableY, 760, 23).fill(); doc.strokeColor('#16a34a').rect(28, payableY, 760, 23).stroke();
    doc.fillColor('#1f3f68').fontSize(8).text('IMPUESTO POR PAGAR (IMPUESTO CAUSADO - RETENCIONES)', 32, payableY + 8, { width: 340 });
    doc.fillColor('#15803d').fontSize(9).text(money(detail.annual.taxPayable), payableX + 4, payableY + 8, { width: payableWidth - 8, align: 'right' });
    y += 37; doc.fontSize(11).fillColor('#1f3f68').text('Resumen anual tomado de declaraciones_anuales', 28, y); y += 20;
    [['Ventas', detail.annual.sales], ['Costos y gastos', detail.annual.costs], ['Gasto empleados', detail.annual.employeeExpense], ['Utilidad', detail.annual.utility], ['Retenciones', detail.annual.retentions], ['Base acumulada', detail.annual.base], ['Impuesto por pagar', detail.annual.taxPayable]].forEach(([label, value], index) => { const x = 28 + (index % 4) * 185; const cardY = y + Math.floor(index / 4) * 52; doc.fillColor(label === 'Impuesto por pagar' ? '#f0fdf4' : '#eef4fa').rect(x, cardY, 175, 42).fill(); doc.fillColor(label === 'Impuesto por pagar' ? '#15803d' : '#526277').fontSize(8).text(String(label), x + 8, cardY + 8); doc.fillColor(label === 'Impuesto por pagar' ? '#15803d' : '#1f3f68').fontSize(11).text(money(Number(value)), x + 8, cardY + 23); });
    doc.end();
  } catch (error: any) { return res.status(400).json({ ok: false, error: error?.message || 'No se pudo exportar a PDF' }); }
}
