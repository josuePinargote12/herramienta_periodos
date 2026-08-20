import type { Request, Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import * as documentModel from '../models/document.model.js';

export const listDocuments = async (req: Request, res: Response) => {
  if (!await documentModel.ownsPeriod(String(req.params.id), req.user!.codigo, req.user!.role)) return res.status(404).json({ ok: false, error: 'Periodo no encontrado' });
  const data = await documentModel.findByPeriod(String(req.params.id), req.user!.codigo, req.user!.role);
  return res.json({ ok: true, data });
};

export const listDocumentsByClient = async (req: Request, res: Response) => {
  const clientId = typeof req.query.clientId === 'string' ? req.query.clientId : '';
  if (!clientId) return res.status(400).json({ ok: false, error: 'El cliente es obligatorio' });
  const data = await documentModel.findByClient(clientId, req.user!.codigo, req.user!.role);
  return res.json({ ok: true, data });
};

export const downloadDocument = async (req: Request, res: Response) => {
  const file = await documentModel.findFile(String(req.params.documentId), req.user!.codigo, req.user!.role);
  const absolutePath = file ? path.resolve(file.filePath) : '';
  if (!file || !fs.existsSync(absolutePath)) return res.status(404).json({ ok: false, error: 'Archivo no encontrado en el almacenamiento' });
  return res.download(absolutePath, file.originalName, { headers: { 'Content-Type': file.mimeType || 'application/octet-stream' } });
};

export const uploadDocuments = async (req: Request, res: Response) => {
  if (!await documentModel.ownsPeriod(String(req.params.id), req.user!.codigo, req.user!.role)) return res.status(404).json({ ok: false, error: 'Periodo no encontrado' });
  const files = (req.files as Express.Multer.File[] || []);
  if (!files.length) return res.status(400).json({ ok: false, error: 'Debes adjuntar al menos un archivo' });
  const group = String(req.body.group || 'Financial Statements');
  const types = String(req.body.types || '').split(',');
  const data = await Promise.all(files.map((file, index) => documentModel.create(String(req.params.id), group, types[index] || file.fieldname || 'document', file, req.user!.codigo)));
  return res.status(201).json({ ok: true, data });
};

export const updateDeliveryStatus = async (req: Request, res: Response) => {
  const status = String(req.body?.status || '');
  const data = await documentModel.updateDeliveryStatus(String(req.params.documentId), status, req.user!.codigo, req.user!.role);
  if (!data) return res.status(404).json({ ok: false, error: 'Documento o estado no encontrado' });
  return res.json({ ok: true, data });
};
