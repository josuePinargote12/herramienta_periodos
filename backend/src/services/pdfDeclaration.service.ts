import { execFile } from 'node:child_process';
import fs from 'node:fs';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

function amount(value: string | undefined) {
  if (!value) return null;
  const normalized = value.includes(',') && value.includes('.') ? value.replace(/,/g, '') : value.includes(',') ? value.replace(',', '.') : value;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function valueForCode(text: string, code: number) {
  const match = text.match(new RegExp(`\\b${code}\\s+([0-9][0-9.,]*)`));
  return amount(match?.[1]);
}

async function extractText(filePath: string) {
  const commands = process.platform === 'win32' ? ['pdftotext.exe', 'C:\\Program Files\\Git\\mingw64\\bin\\pdftotext.exe'] : ['pdftotext'];
  let lastError: unknown;
  for (const command of commands) {
    try {
      const result = await execFileAsync(command, ['-layout', filePath, '-'], { maxBuffer: 8 * 1024 * 1024 });
      return result.stdout;
    } catch (error) { lastError = error; }
  }
  throw new Error(`No se pudo leer el PDF: ${String(lastError)}`);
}

export async function parseIvaDeclaration(filePath: string) {
  if (!fs.existsSync(filePath)) throw new Error('Archivo PDF no encontrado');
  const text = await extractText(filePath);
  if (!/2011\s+DECLARACION DE IVA/i.test(text)) throw new Error('El PDF no corresponde a una declaración de IVA del SRI');
  const iva902 = valueForCode(text, 902);
  const iva699 = valueForCode(text, 699);
  const iva859 = valueForCode(text, 859);
  const iva = iva902 ?? iva699 ?? iva859;
  if (iva == null) throw new Error('No se encontró el total de IVA en el PDF');
  return { iva, field: iva902 != null ? 902 : iva699 != null ? 699 : 859, declarationType: 'IVA' };
}
