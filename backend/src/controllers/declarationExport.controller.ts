import type { Request, Response } from 'express';
import * as XLSX from 'xlsx';
import * as declarationModel from '../models/declaration.model.js';

const parseJson = (value: unknown): any[] => {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [];
  try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
};
const money = (value: unknown) => Number(value || 0);

const horizontalSheet = (title: string, headers: string[], rows: any[][]) => {
  const sheet = XLSX.utils.aoa_to_sheet([[title], headers, ...rows]);
  sheet['!cols'] = headers.map((header, index) => ({
    wch: index === 1 ? 62 : header.includes('VALOR') || header.includes('MONTO') ? 16 : 12
  }));
  sheet['!freeze'] = { xSplit: 2, ySplit: 2 };
  return sheet;
};

const ivaHorizontalSheet = (salesRows: any[][], expenseRows: any[][]) => {
  const header = ['RESUMEN DE VENTAS Y OTRAS OPERACIONES DEL PERIODO QUE DECLARA', '', 'VALOR BRUTO', '', 'VALOR NETO', '', 'IMPUESTO GENERADO', ''];
  const subheader = ['', '', 'CASILLERO', 'VALOR', 'CASILLERO', 'VALOR', 'CASILLERO', 'VALOR'];
  const sheet = XLSX.utils.aoa_to_sheet([
    header, subheader, ...salesRows,
    [],
    ['RESUMEN DE ADQUISICIONES Y PAGOS DEL PERIODO QUE DECLARA', '', 'VALOR BRUTO', '', 'VALOR NETO', '', 'IMPUESTO GENERADO', ''],
    subheader, ...expenseRows
  ]);
  sheet['!cols'] = [{ wch: 70 }, { wch: 12 }, { wch: 12 }, { wch: 16 }, { wch: 12 }, { wch: 16 }, { wch: 12 }, { wch: 16 }];
  sheet['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 1 } },
    { s: { r: 0, c: 2 }, e: { r: 0, c: 3 } },
    { s: { r: 0, c: 4 }, e: { r: 0, c: 5 } },
    { s: { r: 0, c: 6 }, e: { r: 0, c: 7 } }
  ];
  sheet['!freeze'] = { xSplit: 2, ySplit: 2 };
  return sheet;
};

const ivaColumn = (code: unknown) => {
  const numericCode = Number(String(code).replace(/\s/g, '').split('+')[0]);
  if ((numericCode >= 400 && numericCode <= 409) || (numericCode >= 430 && numericCode <= 439) || (numericCode >= 500 && numericCode <= 509)) return 2;
  if ((numericCode >= 410 && numericCode <= 419) || (numericCode >= 440 && numericCode <= 449) || (numericCode >= 510 && numericCode <= 519)) return 4;
  if ((numericCode >= 420 && numericCode <= 429) || (numericCode >= 450 && numericCode <= 459) || (numericCode >= 520 && numericCode <= 529)) return 6;
  return 2;
};

export async function exportDeclarationsExcel(req: Request, res: Response) {
  const clientId = String(req.query.clientId || '');
  const year = String(req.query.year || '');
  const months = String(req.query.months || '').split(',').map(Number).filter(month => Number.isInteger(month) && month >= 1 && month <= 12);
  if (!clientId || !year) return res.status(400).json({ ok: false, error: 'Cliente y año son obligatorios' });
  const rows = await declarationModel.findByClientYear(clientId, year, req.user!.codigo, req.user!.role, months);
  if (!rows.length) return res.status(404).json({ ok: false, error: 'No hay declaraciones para los meses seleccionados' });
  const monthName = (num: number) => new Date(2000, num - 1, 1).toLocaleString('es-ES', { month: 'long' });
  const summary = rows.map((row: any) => ({ CLIENTE: row.clientName, MES: monthName(Number(row.monthNum)), VENTAS: money(row.ivaCosts), 'COSTOS Y GASTOS': money(row.ivaValues), IVA: money(row.iva), RETENCIONES: money(row.retentions) }));
  summary.push({ CLIENTE: '', MES: 'TOTAL SELECCIONADO', VENTAS: summary.reduce((total: number, row: any) => total + row.VENTAS, 0), 'COSTOS Y GASTOS': summary.reduce((total: number, row: any) => total + row['COSTOS Y GASTOS'], 0), IVA: summary.reduce((total: number, row: any) => total + row.IVA, 0), RETENCIONES: summary.reduce((total: number, row: any) => total + row.RETENCIONES, 0) });
  const ivaDetails: any[] = [];
  const retentionDetails: any[] = [];
  rows.forEach((row: any) => {
    const month = monthName(Number(row.monthNum));
    parseJson(row.ivaDetailRows).forEach(group => {
      const fields = (group.fields || []).filter((field: any) => money(field.value) > 0);
      if (fields.length) ivaDetails.push({ MES: month, DESCRIPTION: group.label || 'Casillero del formulario', FIELDS: fields });
    });
    parseJson(row.retentionDetailRows).forEach(group => {
      const fields = (group.fields || []).filter((field: any) => money(field.value) > 0 || String(field.code) === '399 + 498');
      if (fields.length) retentionDetails.push({ MES: month, DESCRIPTION: group.label || 'Casillero del formulario', 'BASE IMPONIBLE': fields[0]?.code || '', 'VALOR BASE': fields[0]?.value == null ? '' : money(fields[0].value), 'VALOR RETENIDO': fields[1]?.code || fields[0]?.code || '', 'MONTO RETENIDO': fields[1]?.value == null ? money(fields[0]?.value) : money(fields[1].value) });
    });
  });
  const workbook = XLSX.utils.book_new();
  const ivaRows = ivaDetails.map(detail => {
    const row = [detail.DESCRIPTION, '', '', '', '', '', '', ''];
    detail.FIELDS.forEach((field: any) => {
      const column = ivaColumn(field.code);
      row[column] = field.code;
      row[column + 1] = money(field.value);
    });
    return row;
  });
  const retentionRows = retentionDetails.map(detail => [detail.MES, detail.DESCRIPTION, detail['BASE IMPONIBLE'], detail['VALOR BASE'], detail['VALOR RETENIDO'], detail['MONTO RETENIDO']]);
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(summary), 'Resumen');
  const expenseRows = ivaRows.filter(row => [2, 4, 6].some(index => Number(row[index]) >= 500));
  const salesRows = ivaRows.filter(row => !expenseRows.includes(row));
  XLSX.utils.book_append_sheet(workbook, ivaHorizontalSheet(salesRows, expenseRows), 'Detalle IVA');
  XLSX.utils.book_append_sheet(workbook, horizontalSheet('Detalle horizontal de retenciones', ['MES', 'DESCRIPCION', 'BASE IMPONIBLE', 'VALOR BASE', 'VALOR RETENIDO', 'MONTO RETENIDO'], retentionRows), 'Detalle Retenciones');
  const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  const clientFileName = String(rows[0].clientName || 'cliente').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '');
  res.setHeader('Content-Disposition', `attachment; filename="declaraciones-${clientFileName}-${year}.xlsx"`);
  return res.send(buffer);
}
