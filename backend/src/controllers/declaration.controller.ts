import type { Request, Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { pool } from '../config/database.js';
import * as documentModel from '../models/document.model.js';
import * as declarationModel from '../models/declaration.model.js';
import { parseIvaDeclaration, parseRetentionDeclaration } from '../services/pdfDeclaration.service.js';
import { parseFinancialStatement, type FinancialStatementType } from '../services/financialStatement.service.js';

async function ownsPeriod(periodId: string, userCode: number, role: any) {
  return documentModel.ownsPeriod(periodId, userCode, role);
}

async function getDeclarationPeriod(periodId: string, userCode: number, role: any) {
  const ownerFilter = role === 'ADMIN' ? '' : ' AND c.COD_USUEMP = ?';
  const params = role === 'ADMIN' ? [periodId] : [periodId, userCode];
  const [rows]: any = await pool.execute(`
    SELECT p.fiscal_year AS fiscalYear, p.fiscal_month AS fiscalMonth,
      c.ruc_cedula AS identification
    FROM accounting_periods p
    INNER JOIN clientes c ON c.id = p.client_id
    WHERE p.id = ?${ownerFilter}
    LIMIT 1`, params);
  return rows[0] || null;
}

function validateDeclarationMetadata(type: 'iva' | 'retentions', metadata: any, period: any) {
  const expectedDocument = type === 'iva' ? 'Declaración de IVA' : 'Declaración de retenciones';
  if (!metadata?.identification || !metadata?.fiscalMonth || !metadata?.fiscalYear) {
    throw new Error(`No se pudo leer RUC, mes y año del documento de ${expectedDocument}.`);
  }
  const expectedIdentification = String(period.identification || '').replace(/\D/g, '');
  const documentIdentification = String(metadata.identification).replace(/\D/g, '');
  if (documentIdentification !== expectedIdentification) {
    throw new Error('RUC incorrecto. Ingrese los datos correctos del cliente seleccionado.');
  }
  if (Number(metadata.fiscalMonth) !== Number(period.fiscalMonth) || Number(metadata.fiscalYear) !== Number(period.fiscalYear)) {
    throw new Error('Período incorrecto. Ingrese el documento correspondiente al período seleccionado.');
  }
}

export async function parseFinancialStatementFile(req: Request, res: Response) {
  const file = req.file;
  const type = req.query.type === 'results' ? 'results' : 'balance';
  if (!file) return res.status(400).json({ ok: false, error: 'Debes adjuntar un archivo Excel o PDF' });
  try { return res.json({ ok: true, data: await parseFinancialStatement(file.path, type as FinancialStatementType, file.mimetype) }); }
  catch (error) { return res.status(422).json({ ok: false, error: error instanceof Error ? error.message : 'No se pudo leer el estado financiero' }); }
  finally { if (fs.existsSync(file.path)) fs.unlinkSync(file.path); }
}

export async function getDeclaration(req: Request, res: Response) {
  const periodId = String(req.params.id);
  if (!await ownsPeriod(periodId, req.user!.codigo, req.user!.role)) return res.status(404).json({ ok: false, error: 'Periodo no encontrado' });
  return res.json({ ok: true, data: await declarationModel.findByPeriod(periodId, req.user!.codigo, req.user!.role) });
}

export async function updateEmployeeExpense(req: Request, res: Response) {
  const periodId = String(req.params.id);
  if (!await ownsPeriod(periodId, req.user!.codigo, req.user!.role)) return res.status(404).json({ ok: false, error: 'Periodo no encontrado' });
  const value = Number(req.body?.employeeExpense);
  if (!Number.isFinite(value) || value < 0) return res.status(400).json({ ok: false, error: 'El gasto de empleados no es válido' });
  return res.json({ ok: true, data: await declarationModel.updateEmployeeExpense(periodId, value, req.user!.codigo, req.user!.role) });
}

export async function updateRetention(req: Request, res: Response) {
  const periodId = String(req.params.id);
  if (!await ownsPeriod(periodId, req.user!.codigo, req.user!.role)) return res.status(404).json({ ok: false, error: 'Periodo no encontrado' });
  const value = Number(req.body?.retentions);
  if (!Number.isFinite(value) || value < 0) return res.status(400).json({ ok: false, error: 'Las retenciones no son válidas' });
  return res.json({ ok: true, data: await declarationModel.updateRetention(periodId, value, req.user!.codigo, req.user!.role) });
}

export async function updateIncomeTaxRetention(req: Request, res: Response) {
  const periodId = String(req.params.id);
  if (!await ownsPeriod(periodId, req.user!.codigo, req.user!.role)) return res.status(404).json({ ok: false, error: 'Periodo no encontrado' });
  const value = Number(req.body?.incomeTaxRetention);
  if (!Number.isFinite(value) || value < 0) return res.status(400).json({ ok: false, error: 'La retención para impuesto no es válida' });
  return res.json({ ok: true, data: await declarationModel.updateIncomeTaxRetention(periodId, value, req.user!.codigo, req.user!.role) });
}

export async function parseDeclarationPdf(req: Request, res: Response) {
  const file = req.file;
  // El lector envía el tipo en la query string (?type=retentions).
  // También aceptamos body.type para mantener compatibilidad con clientes anteriores.
  const requestedType = req.query.type ?? req.body.type;
  const type = requestedType === 'retentions' ? 'retentions' : 'iva';
  if (!file) return res.status(400).json({ ok: false, error: `Debes adjuntar un PDF de ${type === 'retentions' ? 'retenciones' : 'IVA'}` });
  try {
    const data = type === 'retentions' ? await parseRetentionDeclaration(file.path) : await parseIvaDeclaration(file.path);
    return res.json({ ok: true, data });
  } catch (error) {
    return res.status(422).json({ ok: false, error: error instanceof Error ? error.message : 'No se pudo leer el PDF' });
  } finally {
    if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
  }
}


export async function saveDeclaration(req: Request, res: Response) {
  const periodId = String(req.params.id);
  if (!await ownsPeriod(periodId, req.user!.codigo, req.user!.role)) return res.status(404).json({ ok: false, error: 'Periodo no encontrado' });
  const period = await getDeclarationPeriod(periodId, req.user!.codigo, req.user!.role);
  if (!period) return res.status(404).json({ ok: false, error: 'Periodo no encontrado' });
  const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
  const ivaFile = files?.ivaFile?.[0];
  const retentionFile = files?.retentionFile?.[0];
  const current = await declarationModel.findByPeriod(periodId, req.user!.codigo, req.user!.role);
  if (!ivaFile && !retentionFile && !current) return res.status(400).json({ ok: false, error: 'Debes adjuntar al menos un PDF' });
  let iva = Number(req.body.iva || 0);
  let ivaCosts = req.body.ivaCosts === '' || req.body.ivaCosts == null ? null : Number(req.body.ivaCosts);
  let ivaValues = req.body.ivaValues === '' || req.body.ivaValues == null ? null : Number(req.body.ivaValues);
  let employeeExpense = req.body.employeeExpense === '' || req.body.employeeExpense == null ? 0 : Number(req.body.employeeExpense);
  let utility: number | null = null;
  let ivaDetails: Record<string, number> | null = null;
  let ivaDetailRows: unknown[] | null = null;
  let retentionDetails: Record<string, number> | null = null;
  let retentionDetailRows: unknown[] | null = null;
  if (ivaFile) {
    try {
      const parsed = await parseIvaDeclaration(ivaFile.path);
      validateDeclarationMetadata('iva', parsed.metadata, period);
      iva = parsed.iva;
      ivaCosts = parsed.costs;
      ivaValues = parsed.values;
      ivaDetails = parsed.details;
      // Se conserva el detalle completo para poder revisarlo por mes desde el historial.
      // La vista de resumen aplica sus propios filtros de valores y secciones.
      ivaDetailRows = parsed.detailGroups;
    }
    catch (error) { return res.status(422).json({ ok: false, error: error instanceof Error ? error.message : 'No se pudo leer el PDF de IVA' }); }
  }
  let retentions = Number(req.body.retentions || 0);
  if (retentionFile) {
    try {
      const parsed = await parseRetentionDeclaration(retentionFile.path);
      validateDeclarationMetadata('retentions', parsed.metadata, period);
      retentions = parsed.retentions;
      retentionDetails = parsed.details;
      retentionDetailRows = parsed.detailGroups;
    }
    catch (error) { return res.status(422).json({ ok: false, error: error instanceof Error ? error.message : 'No se pudo leer el PDF de retenciones' }); }
  }
  if (!Number.isFinite(iva) || iva < 0 || !Number.isFinite(retentions) || retentions < 0 || (ivaCosts != null && (!Number.isFinite(ivaCosts) || ivaCosts < 0)) || (ivaValues != null && (!Number.isFinite(ivaValues) || ivaValues < 0))) return res.status(400).json({ ok: false, error: 'Los valores declarados no son válidos' });
  const savedSales = ivaCosts ?? current?.ivaCosts;
  const savedCosts = ivaValues ?? current?.ivaValues;
  if (!Number.isFinite(employeeExpense) || employeeExpense < 0) return res.status(400).json({ ok: false, error: 'El gasto de empleados no es válido' });
  if (savedSales != null && savedCosts != null) utility = Number((Number(savedSales) - Number(savedCosts) - employeeExpense).toFixed(2));
  const ivaDocument = ivaFile ? await documentModel.create(periodId, 'Declaration', 'iva', ivaFile, req.user!.codigo) : null;
  const retentionDocument = retentionFile ? await documentModel.create(periodId, 'Declaration', 'retentions', retentionFile, req.user!.codigo) : null;
  const data = await declarationModel.upsert(periodId, iva, retentions, ivaCosts, ivaValues, employeeExpense, utility, ivaDetails, ivaDetailRows, retentionDetails, retentionDetailRows, ivaDocument?.id || null, retentionDocument?.id || null, req.user!.codigo, req.user!.role);
  return res.status(201).json({ ok: true, data });
}

export async function deleteDeclarationDocument(req: Request, res: Response) {
  const periodId = String(req.params.id);
  const type = req.params.type === 'retentions' ? 'retentions' : 'iva';
  if (!await ownsPeriod(periodId, req.user!.codigo, req.user!.role)) return res.status(404).json({ ok: false, error: 'Periodo no encontrado' });
  const current = await declarationModel.findByPeriod(periodId, req.user!.codigo, req.user!.role);
  const documentId = type === 'iva' ? current?.ivaDocumentId : current?.retentionDocumentId;
  if (!documentId) return res.status(404).json({ ok: false, error: 'Documento no encontrado' });
  const file = await documentModel.deleteOwned(String(documentId), req.user!.codigo, req.user!.role);
  await declarationModel.clearDocument(periodId, type, req.user!.codigo, req.user!.role);
  if (file?.filePath) { const absolutePath = path.resolve(file.filePath); if (fs.existsSync(absolutePath)) fs.unlinkSync(absolutePath); }
  return res.json({ ok: true, data: await declarationModel.findByPeriod(periodId, req.user!.codigo, req.user!.role) });
}
