import { execFile } from 'node:child_process';
import fs from 'node:fs';
import { promisify } from 'node:util';
import { RETENTION_LABELS, RETENTION_FIELD_PAIRS } from '../config/retentionLabels.js';

function detailGroupsFromPairs(text: string) {
  const groups: { label: string; fields: { code: string; value: number }[] }[] = [];
  for (const pair of RETENTION_FIELD_PAIRS) {
    const codes = [pair.base, pair.retained, ...(pair.extra || [])].filter(Boolean) as string[];
    const fields = codes
      .map(code => ({ code, value: valueForCode(text, Number(code)) }))
      .filter((f): f is { code: string; value: number } => f.value != null);
    if (fields.length) {
      groups.push({ label: RETENTION_LABELS[pair.base] || 'Casillero del formulario', fields });
    }
  }
  return groups;
}

const execFileAsync = promisify(execFile);

function amount(value: string | undefined) {
  if (!value) return null;
  const normalized = value.includes(',') && value.includes('.') ? value.replace(/,/g, '') : value.includes(',') ? value.replace(',', '.') : value;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function repairLabel(value: string) {
  return value
    .replace(/Ã¡/g, 'á').replace(/Ã©/g, 'é').replace(/Ã­/g, 'í').replace(/Ã³/g, 'ó').replace(/Ãº/g, 'ú')
    .replace(/Ã±/g, 'ñ').replace(/Ã‰/g, 'É').replace(/Ãš/g, 'Ú').replace(/Ã‘/g, 'Ñ')
    .replace(/retenci[\uFFFD?]n/gi, 'retención').replace(/declaraci[\uFFFD?]n/gi, 'declaración')
    .replace(/operaci[\uFFFD?]n/gi, 'operación').replace(/adquisici[\uFFFD?]n/gi, 'adquisición')
    .replace(/liquidaci[\uFFFD?]n/gi, 'liquidación').replace(/tributaci[\uFFFD?]n/gi, 'tributación')
    .replace(/compensaci[\uFFFD?]n/gi, 'compensación').replace(/informaci[\uFFFD?]n/gi, 'información')
    .replace(/relaci[\uFFFD?]n/gi, 'relación').replace(/despu[\uFFFD?]s/gi, 'después')
    .replace(/cr[\uFFFD?]dito/gi, 'crédito').replace(/pa[\uFFFD?]s/gi, 'país')
    .replace(/tributaci[\uFFFD?]n/gi, 'tributación');
}

function valueForCode(text: string, code: number) {
  const after = [...text.matchAll(new RegExp(`(?:^|\\s)${code}(?:\\s+)([0-9][0-9.,]*)`, 'gm'))];
  const before = [...text.matchAll(new RegExp(`([0-9][0-9.,]*)(?:\\s+)${code}(?=\\s|$)`, 'gm'))];
  return amount(after[0]?.[1] ?? before[0]?.[1]);
}

function valueForCodes(text: string, codes: number[]) {
  for (const code of codes) {
    const value = valueForCode(text, code);
    if (value != null) return { value, field: code };
  }
  return null;
}

const spanishMonths = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];

type DeclarationPeriodType = 'monthly' | 'quarterly' | 'semesterly';

const periodOrdinalPattern = 'PRIMER(?:O)?|SEGUNDO|TERCER(?:O)?|CUARTO|1ER|2DO|3ER|4TO|I{1,3}|IV';

function ordinalNumber(value: string) {
  const normalized = value.toUpperCase();
  if (normalized === 'PRIMER' || normalized === 'PRIMERO' || normalized === '1ER' || normalized === 'I') return 1;
  if (normalized === 'SEGUNDO' || normalized === '2DO' || normalized === 'II') return 2;
  if (normalized === 'TERCER' || normalized === 'TERCERO' || normalized === '3ER' || normalized === 'III') return 3;
  if (normalized === 'CUARTO' || normalized === '4TO' || normalized === 'IV') return 4;
  return null;
}

function findNumberedPeriod(text: string, periodWord: 'TRIMESTRE' | 'SEMESTRE') {
  const direct = text.match(new RegExp(`\\b(${periodOrdinalPattern})\\s+${periodWord}\\b(?:\\s+(?:DE|DEL)\\s*)?(20\\d{2})\\b`));
  if (direct) return { number: ordinalNumber(direct[1]), year: Number(direct[2]) };

  const directWithoutYear = text.match(new RegExp(`\\b(${periodOrdinalPattern})\\s+${periodWord}\\b`));
  if (directWithoutYear) return { number: ordinalNumber(directWithoutYear[1]), year: null };

  const reversed = text.match(new RegExp(`\\b${periodWord}\\s*:?\\s*(${periodOrdinalPattern})\\b(?:\\s+(?:DE|DEL)\\s*)?(20\\d{2})\\b`));
  if (reversed) return { number: ordinalNumber(reversed[1]), year: Number(reversed[2]) };

  const reversedWithoutYear = text.match(new RegExp(`\\b${periodWord}\\s*:?\\s*(${periodOrdinalPattern})\\b`));
  if (reversedWithoutYear) return { number: ordinalNumber(reversedWithoutYear[1]), year: null };

  const numeric = text.match(new RegExp(`\\b${periodWord}\\s*:?\\s*([1-4])\\s*(?:DE|DEL)?\\s*(20\\d{2})\\b`));
  if (numeric) return { number: Number(numeric[1]), year: Number(numeric[2]) };

  const numericWithoutYear = text.match(new RegExp(`\\b${periodWord}\\s*:?\\s*([1-4])\\b`));
  if (numericWithoutYear) return { number: Number(numericWithoutYear[1]), year: null };

  return null;
}

function fiscalYearNearPeriod(text: string) {
  const periodIndex = text.indexOf('PERIODO FISCAL');
  const context = periodIndex >= 0 ? text.slice(periodIndex, periodIndex + 180) : '';
  return Number(context.match(/\b(20\d{2})\b/)?.[1] || 0) || null;
}

function declarationMetadata(text: string) {
  const normalized = text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ');
  const identification = normalized.match(/IDENTIFICACION\s*:?\s*(\d{10,13})/)?.[1] || null;
  const period = normalized.match(new RegExp(`PERIODO\\s+FISCAL\\s*:?\\s*(${spanishMonths.join('|')})\\s+(20\\d{2})`));
  const quarterly = findNumberedPeriod(normalized, 'TRIMESTRE');
  const semesterly = findNumberedPeriod(normalized, 'SEMESTRE');
  const explicitQuarterly = /\bTRIMESTR(?:E|AL)\b/.test(normalized);
  const explicitSemesterly = /\bSEMESTR(?:E|AL)\b/.test(normalized);
  const contextualYear = fiscalYearNearPeriod(normalized);

  if (explicitQuarterly) {
    const fiscalMonth = quarterly?.number ? quarterly.number * 3 : period ? [3, 6, 9, 12][Math.ceil((spanishMonths.indexOf(period[1]) + 1) / 3) - 1] : null;
    return {
      identification,
      fiscalMonth,
      fiscalYear: quarterly?.year ?? (period ? Number(period[2]) : contextualYear ?? (Number(normalized.match(/\b(20\d{2})\b/)?.[1] || 0) || null)),
      periodType: 'quarterly' as DeclarationPeriodType
    };
  }

  if (explicitSemesterly) {
    const fiscalMonth = semesterly?.number ? semesterly.number === 1 ? 6 : semesterly.number === 2 ? 12 : null : period && [6, 12].includes(spanishMonths.indexOf(period[1]) + 1) ? spanishMonths.indexOf(period[1]) + 1 : null;
    return {
      identification,
      fiscalMonth,
      fiscalYear: semesterly?.year ?? (period ? Number(period[2]) : contextualYear ?? (Number(normalized.match(/\b(20\d{2})\b/)?.[1] || 0) || null)),
      periodType: 'semesterly' as DeclarationPeriodType
    };
  }

  return {
    identification,
    fiscalMonth: period ? spanishMonths.indexOf(period[1]) + 1 : null,
    fiscalYear: period ? Number(period[2]) : null,
    periodType: 'monthly' as DeclarationPeriodType
  };
}

function valuesForAllCodes(text: string) {
  const values: Record<string, number> = {};
  const after = [...text.matchAll(/(?:^|\s)(\d{3})(?:\s+)([0-9][0-9.,]*)/gm)];
  const before = [...text.matchAll(/([0-9][0-9.,]*)(?:\s+)(\d{3})(?=\s|$)/gm)];
  for (const match of after) {
    const parsed = amount(match[2]);
    if (parsed != null && values[match[1]] == null) values[match[1]] = parsed;
  }
  for (const match of before) {
    const parsed = amount(match[1]);
    if (parsed != null && values[match[2]] == null) values[match[2]] = parsed;
  }
  return values;
}

function labelsForCodes(text: string) {
  const labels: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const matches = [...line.matchAll(/(?:^|\s)(\d{3})(?=\s|$)/g)];
    if (!matches.length) continue;
    const label = repairLabel(line.slice(0, matches[0].index || 0).replace(/\s+/g, ' ').trim().replace(/[.]+$/, '').trim());
    if (!label || label.length < 3) continue;
    for (const match of matches) if (labels[match[1]] == null) labels[match[1]] = label;
  }
  return labels;
}

function detailGroups(text: string) {
  const lines = text.split(/\r?\n/);
  const knownLabels: Record<string, string> = {
    '409': 'TOTAL VENTAS Y OTRAS OPERACIONES',
    '509': 'TOTAL ADQUISICIONES Y PAGOS',
    '309': 'Publicidad y comunicación'
  };
  return lines.flatMap((line) => {
    const matches = [...line.matchAll(/(?:^|\s)(\d{3})(?:\s+)([0-9][0-9.,]*)/g)];
    const codeOnly = [...line.matchAll(/(?:^|\s)(\d{3})(?=\s|$)/g)];
    const effectiveMatches = matches.length ? matches : codeOnly.map(match => ({ 1: match[1], index: match.index, 2: undefined }));
    if (!effectiveMatches.length) return [];
    const label = repairLabel(line.slice(0, effectiveMatches[0].index || 0).replace(/\s+/g, ' ').trim().replace(/[.]+$/, '').trim());
    const fallbackLabel = knownLabels[effectiveMatches[0][1]];
    if ((!label || label.length < 3) && !fallbackLabel) return [];
    const fields = effectiveMatches.map(match => {
      let value = amount(match[2]);
      return { code: match[1], value };
    }).filter(item => item.value != null);
    return fields.length ? [{ label: label || fallbackLabel, fields }] : [];
  });
}

function normalizeIvaDetailGroups(groups: Array<{ label: string; fields: Array<{ code: string; value: number | null }> }>) {
  const totalIndex = groups.findIndex(group => /^TOTAL VENTAS Y OTRAS OPERACIONES$/i.test(group.label.trim()));
  if (totalIndex < 0) return groups;

  const total = groups[totalIndex];
  const shiftedNet = total.fields.find(field => field.code === '418' && Number(field.value) > 0);
  const followingNotes = groups[totalIndex + 1];
  const shiftedGross = followingNotes?.fields.find(field => field.code === '409' && Number(field.value) > 0);

  // Algunos formularios SRI tienen una capa de texto desplazada una columna:
  // visualmente el total es 409/419/429, pero el texto extraído llega como
  // 408/418/429 y el 409 aparece en la fila siguiente.
  if (!shiftedNet || !shiftedGross) return groups;

  return groups.map((group, index) => {
    if (index === totalIndex) {
      return {
        ...group,
        fields: group.fields.map(field => field.code === '418'
          ? { ...field, code: '419' }
          : field.code === '408' && Number(field.value) === 0
            ? { ...field, code: '409', value: shiftedGross.value }
            : field)
      };
    }
    if (index === totalIndex + 1) {
      return { ...group, fields: group.fields.filter(field => field.code !== '409' || Number(field.value) <= 0) };
    }
    return group;
  });
}

async function extractText(filePath: string) {
  const commands = process.platform === 'win32' ? ['pdftotext.exe', 'C:\\Program Files\\Git\\mingw64\\bin\\pdftotext.exe'] : ['pdftotext'];
  let lastError: unknown;
  for (const command of commands) {
    try {
      console.log('>>> EXTRACT v2 ejecutándose', filePath);
      const result = await execFileAsync(
        command,
        ['-layout', '-enc', 'UTF-8', filePath, '-'],
        { maxBuffer: 8 * 1024 * 1024, encoding: 'utf8' }
      );
      return result.stdout;
    } catch (error) { lastError = error; }
  }
  throw new Error(`No se pudo leer el PDF: ${String(lastError)}`);
}

export async function parseIvaDeclaration(filePath: string) {
  if (!fs.existsSync(filePath)) throw new Error('Archivo PDF no encontrado');
  const text = await extractText(filePath);
  const normalizedHeader = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const isIvaDeclaration = /\b2011\s+DECLARACION\s+DE\s+IVA\b/i.test(normalizedHeader)
    || /\b20\d{2}\s*-\s*DECLARACION\s+(?:MENSUAL|TRIMESTRAL|SEMESTRAL)\s+IVA\b/i.test(normalizedHeader);
  if (!isIvaDeclaration) throw new Error('El PDF no corresponde a una declaración de IVA del SRI');
  const details = valuesForAllCodes(text);
  const labels = labelsForCodes(text);
  const groups = normalizeIvaDetailGroups(detailGroups(text));
  const iva499 = valueForCode(text, 499);
  const iva902 = valueForCode(text, 902);
  const iva699 = valueForCode(text, 699);
  const iva859 = valueForCode(text, 859);
  const iva = iva499 ?? iva902 ?? iva699 ?? iva859;
  if (iva == null) throw new Error('No se encontró el total de IVA en el PDF');
  return {
    iva,
    field: iva499 != null ? 499 : iva902 != null ? 902 : iva699 != null ? 699 : 859,
    // El texto interno de algunos PDFs desplaza el código de la fila total:
    // visualmente es 419, pero pdftotext lo entrega como 418. Preferimos el
    // 419 real cuando tiene valor y usamos 418 solo cuando 419 viene en cero.
    costs: details['419'] != null && Number(details['419']) > 0
      ? Number(details['419']) + Number(details['441'] || 0)
      : details['418'] != null && Number(details['418']) > 0
        ? Number(details['418']) + Number(details['441'] || 0)
        : details['419'] != null || details['441'] != null
          ? Number(details['419'] || 0) + Number(details['441'] || 0)
          : null,
    values: details['519'] ?? null,
    details,
    labels,
    detailRows: Object.entries(details).map(([code, value]) => ({ code, value, label: labels[code] || 'Casillero del formulario' })),
    detailGroups: groups,
    metadata: declarationMetadata(text),
    declarationType: 'IVA'
  };
}

export async function parseRetentionDeclaration(filePath: string) {
  if (!fs.existsSync(filePath)) throw new Error('Archivo PDF no encontrado');
  const text = await extractText(filePath);
  const normalizedText = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (!(/\b1031\b[\s\S]{0,320}RETENCIONES/i.test(normalizedText) || /RETENCIONES[\s\S]{0,320}\b1031\b/i.test(normalizedText))) {
    throw new Error('El PDF no corresponde a una declaración de retenciones del SRI (Formulario 103)');
  }

  const result = valueForCodes(text, [499, 902]);
  if (!result) throw new Error('No se encontró el total de retenciones en el PDF');
  const details = valuesForAllCodes(text);
  details[String(result.field)] = result.value;
  if (result.field === 499) details['902'] = valueForCode(text, 902) ?? result.value;
  const labels = labelsForCodes(text);
  const groups = detailGroupsFromPairs(text);
  return {
    retentions: result.value,
    field: result.field,
    details,
    labels,
    detailRows: Object.entries(details).map(([code, value]) => ({ code, value, label: labels[code] || 'Casillero del formulario' })),
    detailGroups: groups,
    metadata: declarationMetadata(text),
    declarationType: 'RETENCIONES'
  };
}
