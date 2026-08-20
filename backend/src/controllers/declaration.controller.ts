import type { Request, Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import * as documentModel from '../models/document.model.js';
import * as declarationModel from '../models/declaration.model.js';
import { parseIvaDeclaration } from '../services/pdfDeclaration.service.js';

async function ownsPeriod(periodId: string, userCode: number, role: any) {
  return documentModel.ownsPeriod(periodId, userCode, role);
}

export async function getDeclaration(req: Request, res: Response) {
  const periodId = String(req.params.id);
  if (!await ownsPeriod(periodId, req.user!.codigo, req.user!.role)) return res.status(404).json({ ok: false, error: 'Periodo no encontrado' });
  return res.json({ ok: true, data: await declarationModel.findByPeriod(periodId, req.user!.codigo, req.user!.role) });
}

export async function parseDeclarationPdf(req: Request, res: Response) {
  const file = req.file;
  if (!file) return res.status(400).json({ ok: false, error: 'Debes adjuntar un PDF de IVA' });
  try {
    return res.json({ ok: true, data: await parseIvaDeclaration(file.path) });
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
  if (ivaFile && (req.body.iva == null || req.body.iva === '')) {
    try { iva = (await parseIvaDeclaration(ivaFile.path)).iva; }
    catch (error) { return res.status(422).json({ ok: false, error: error instanceof Error ? error.message : 'No se pudo leer el PDF de IVA' }); }
  }
  const retentions = Number(req.body.retentions || 0);
  if (!Number.isFinite(iva) || iva < 0 || !Number.isFinite(retentions) || retentions < 0) return res.status(400).json({ ok: false, error: 'Los valores declarados no son válidos' });
  const ivaDocument = ivaFile ? await documentModel.create(periodId, 'Declaration', 'iva', ivaFile, req.user!.codigo) : null;
  const retentionDocument = retentionFile ? await documentModel.create(periodId, 'Declaration', 'retentions', retentionFile, req.user!.codigo) : null;
  const data = await declarationModel.upsert(periodId, iva, retentions, ivaDocument?.id || null, retentionDocument?.id || null, req.user!.codigo, req.user!.role);
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
