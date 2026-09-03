import type { Request, Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import * as documentModel from '../models/document.model.js';
import * as declarationModel from '../models/declaration.model.js';
import { parseIvaDeclaration, parseRetentionDeclaration } from '../services/pdfDeclaration.service.js';

async function ownsPeriod(periodId: string, userCode: number, role: any) {
  return documentModel.ownsPeriod(periodId, userCode, role);
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
      iva = parsed.iva;
      ivaCosts = parsed.costs;
      ivaValues = parsed.values;
      ivaDetails = parsed.details;
      const groups = parsed.detailGroups
        .filter(group => group.fields.some(field => Number(field.value) > 0))
        .filter(group => Number(group.fields[0]?.code) < 480 || Number(group.fields[0]?.code) >= 500);
      const expenseTotalIndex = groups.findIndex(group => /^TOTAL ADQUISICIONES Y PAGOS$/i.test(group.label.trim()));
      const displayGroups = groups
        .filter((group, index) => Number(group.fields[0]?.code) < 500 || expenseTotalIndex < 0 || index <= expenseTotalIndex)
        .map(group => ({ ...group, fields: group.fields.filter(field => Number(field.value) > 0) }))
        .filter(group => group.fields.length);
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
