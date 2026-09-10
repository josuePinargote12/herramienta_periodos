import fs from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import XLSX from 'xlsx';

const execFileAsync = promisify(execFile);
export type FinancialStatementType = 'balance' | 'results';
type Values = Record<string, number | null>;

export type FinancialDocumentMetadata = { identification: string | null; fiscalYear: number | null };

function extractFinancialYear(normalizedText: string) {
  // En notas aparecen años históricos dentro del cuerpo (por ejemplo, el año
  // de constitución de la compañía). El año del encabezado tiene prioridad.
  const headerYear = normalizedText.match(/(?:ANO\s+TERMINADO|ESTADOS\s+FINANCIEROS|NOTAS\s+A\s+LOS\s+ESTADOS)[^\d]{0,100}(20\d{2})/i)?.[1]
    || normalizedText.match(/AL\s+\d{1,2}\s+DE\s+[A-Z]+\s+(?:DEL|DE)\s+(20\d{2})/i)?.[1];
  if (headerYear) return Number(headerYear);
  const contextualYear = normalizedText.match(/(?:EJERCICIO|PERIODO|PERIODO FISCAL|ANO|YEAR)[^\d]{0,30}(20\d{2})/i)?.[1];
  return Number(contextualYear || normalizedText.match(/\b(20\d{2})\b/)?.[1] || 0) || null;
}

function amount(value: unknown) {
  const text = String(value ?? '').replace(/[()$€£\s]/g, '');
  if (!text) return null;
  const negative = text.startsWith('-');
  const clean = text.replace(/^-/, '');
  const normalized = clean.includes(',') && clean.includes('.')
    ? clean.lastIndexOf(',') > clean.lastIndexOf('.') ? clean.replace(/\./g, '').replace(',', '.') : clean.replace(/,/g, '')
    : clean.includes(',') ? clean.replace(',', '.') : clean;
  const valueNumber = Number(normalized);
  return Number.isFinite(valueNumber) ? Number((negative ? -valueNumber : valueNumber).toFixed(2)) : null;
}

export async function readFinancialDocumentMetadata(filePath: string, mimeType = ''): Promise<FinancialDocumentMetadata> {
  if (!fs.existsSync(filePath)) throw new Error('Archivo de estado financiero no encontrado');
  let text = '';
  if (/\.pdf$/i.test(filePath) || mimeType === 'application/pdf') {
    const command = process.platform === 'win32' ? 'C:\\Program Files\\Git\\mingw64\\bin\\pdftotext.exe' : 'pdftotext';
    const { stdout } = await execFileAsync(command, ['-layout', '-enc', 'UTF-8', filePath, '-'], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
    text = String(stdout);
  } else {
    const workbook = XLSX.readFile(filePath, { cellDates: false, cellText: true });
    text = workbook.SheetNames.map(sheetName => {
      const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, raw: false, defval: '' }) as unknown[][];
      return rows.flat().map(value => String(value ?? '')).join(' ');
    }).join(' ');
  }
  const normalized = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');
  const identification = normalized.match(/(?:RUC|IDENTIFICACION|ID\.?\s*TRIBUTARIA)\s*[:#-]?\s*(\d{10,13})/i)?.[1]
    || normalized.match(/\b\d{13}\b/)?.[0]
    || normalized.match(/\b\d{10}\b/)?.[0]
    || null;
  const fiscalYear = extractFinancialYear(normalized);
  return { identification, fiscalYear };
}

export async function parseFinancialStatement(filePath: string, type: FinancialStatementType, mimeType = ''): Promise<Values> {
  if (!fs.existsSync(filePath)) throw new Error('Archivo de estado financiero no encontrado');
  const result: Values = { activo_corriente: null, activo_no_corriente: null, total_activos: null, pasivo_corriente: null, pasivo_no_corriente: null, total_pasivos: null, patrimonio: null, ingresos_periodo: null, costos_gastos_operativos: null, utilidad_antes_participacion_impuestos: null };
  if (/\.pdf$/i.test(filePath) || mimeType === 'application/pdf') {
    const command = process.platform === 'win32' ? 'C:\\Program Files\\Git\\mingw64\\bin\\pdftotext.exe' : 'pdftotext';
    const { stdout } = await execFileAsync(command, ['-layout', '-enc', 'UTF-8', filePath, '-'], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
    const lines = String(stdout).split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const normalized = line.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      const matches = [...[line, lines[index + 1] || ''].join(' ').matchAll(/(?:-\s*)?\$\s*-?\s*[0-9][0-9.,]*/g)].map(match => amount(match[0])).filter(value => value != null) as number[];
      if (normalized.includes('ingresos') && result.ingresos_periodo == null && matches.length) result.ingresos_periodo = matches.at(-1)!;
      if (normalized.includes('resultado del ejercicio') && result.utilidad_antes_participacion_impuestos == null && matches.length) result.utilidad_antes_participacion_impuestos = matches.at(-1)!;
    }
    if (result.ingresos_periodo != null && result.utilidad_antes_participacion_impuestos != null) result.costos_gastos_operativos = Number((result.ingresos_periodo - result.utilidad_antes_participacion_impuestos).toFixed(2));
    return result;
  }
  const workbook = XLSX.readFile(filePath, { cellDates: false, cellText: true });
  for (const sheetName of workbook.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, raw: true, defval: '' }) as unknown[][];
    for (const row of rows) {
      const code = String(row[1] ?? '').trim();
      const field = type === 'balance' ? ({ '1.01': 'activo_corriente', '1.02': 'activo_no_corriente', '1': 'total_activos', '2.01': 'pasivo_corriente', '2.02': 'pasivo_no_corriente', '2': 'total_pasivos', '3': 'patrimonio' } as Record<string, string>)[code] : undefined;
      if (!field || result[field] != null) continue;
      const values = row.slice(3).map(amount).filter(value => value != null) as number[];
      if (values.length) result[field] = values.at(-1)!;
    }
  }
  return result;
}
