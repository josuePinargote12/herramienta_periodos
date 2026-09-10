import type { Request, Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import * as documentModel from '../models/document.model.js';
import * as declarationModel from '../models/declaration.model.js';
import { parseFinancialStatement, readFinancialDocumentMetadata, type FinancialStatementType } from '../services/financialStatement.service.js';
import { pool } from '../config/database.js';

async function getFinancialPeriodContext(periodId: string, userCode: number, role: any) {
  const ownerFilter = role === 'ADMIN' ? '' : ' AND c.COD_USUEMP = ?';
  const params = role === 'ADMIN' ? [periodId] : [periodId, userCode];
  const [rows]: any = await pool.execute(`
    SELECT p.fiscal_year AS fiscalYear, c.ruc_cedula AS identification
    FROM accounting_periods p
    INNER JOIN clientes c ON c.id = p.client_id
    WHERE p.id = ?${ownerFilter}
    LIMIT 1`, params);
  return rows[0] || null;
}

function validateFinancialMetadata(metadata: any, period: any) {
  const expectedRuc = String(period.identification || '').replace(/\D/g, '');
  const documentRuc = String(metadata?.identification || '').replace(/\D/g, '');
  if (documentRuc && expectedRuc && documentRuc !== expectedRuc) {
    throw new Error(`RUC incorrecto. Documento: ${documentRuc}. Cliente: ${expectedRuc}.`);
  }
  if (metadata?.fiscalYear && Number(metadata.fiscalYear) !== Number(period.fiscalYear)) {
    throw new Error('Año incorrecto. Ingrese el documento correspondiente al año seleccionado.');
  }
}

function validateNotesYear(metadata: any, period: any) {
  if (!metadata?.fiscalYear) throw new Error('No se pudo extraer el año del documento de notas a los estados financieros.');
  if (Number(metadata.fiscalYear) !== Number(period.fiscalYear)) {
    throw new Error('Año incorrecto. Ingrese las notas correspondientes al año seleccionado.');
  }
}

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
  const periodContext = await getFinancialPeriodContext(String(req.params.id), req.user!.codigo, req.user!.role);
  if (!periodContext) return res.status(404).json({ ok: false, error: 'Periodo no encontrado' });
  const files = (req.files as Express.Multer.File[] || []);
  if (!files.length) return res.status(400).json({ ok: false, error: 'Debes adjuntar al menos un archivo' });
  const group = String(req.body.group || 'Financial Statements');
  const types = String(req.body.types || '').split(',');
  const data = [];
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    const type = types[index] || file.fieldname || 'document';
    let parsedValues: Record<string, number | null> | null = null;
    if (group === 'Financial Statements') {
      // Comprueba el RUC para todos los estados, también en ediciones de
      // patrimonio, flujo de efectivo y notas.
      let documentMetadata = null;
      try { documentMetadata = await readFinancialDocumentMetadata(file.path, file.mimetype); } catch { documentMetadata = null; }
      try {
        if (type === 'notes') validateNotesYear(documentMetadata, periodContext);
        else if (documentMetadata) validateFinancialMetadata(documentMetadata, periodContext);
      }
      catch (error) { return res.status(422).json({ ok: false, error: error instanceof Error ? error.message : 'El documento no coincide con el cliente o año seleccionado' }); }
    }
    if (group === 'Financial Statements' && (type === 'balance' || type === 'results')) {
      let manualValues: Record<string, unknown> = {};
      try { manualValues = JSON.parse(String(req.body.manualValues || '{}')); } catch { manualValues = {}; }
      let values;
      try { values = await parseFinancialStatement(file.path, type as FinancialStatementType, file.mimetype); }
      catch { values = {}; }
      const recognized = Object.values(values).some(value => value != null);
      if (!recognized && type === 'balance') {
        values = { ...values, activo_corriente: null, activo_no_corriente: null, pasivo_corriente: null, pasivo_no_corriente: null };
      }
      values = { ...values, ...Object.fromEntries(Object.entries(manualValues).filter(([, value]) => value != null && Number.isFinite(Number(value))).map(([key, value]) => [key, Number(value)])) };
      parsedValues = values;
    }
    const document = await documentModel.create(String(req.params.id), group, type, file, req.user!.codigo);
    if (parsedValues && (type === 'balance' || type === 'results')) await declarationModel.upsertFinancialSummary(String(req.params.id), type as FinancialStatementType, document.id, parsedValues);
    data.push(document);
  }
  return res.status(201).json({ ok: true, data });
};

export const updateDeliveryStatus = async (req: Request, res: Response) => {
  const status = String(req.body?.status || '');
  const data = await documentModel.updateDeliveryStatus(String(req.params.documentId), status, req.user!.codigo, req.user!.role);
  if (!data) return res.status(404).json({ ok: false, error: 'Documento o estado no encontrado' });
  return res.json({ ok: true, data });
};
