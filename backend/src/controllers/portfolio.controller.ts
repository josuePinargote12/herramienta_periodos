import type { Request, Response } from 'express';
import fs from 'node:fs';
import * as documentModel from '../models/document.model.js';
import * as portfolioModel from '../models/portfolio.model.js';
import { parsePortfolioWorkbook } from '../services/portfolioExcel.service.js';
import { parsePortfolioPdf } from '../services/portfolioPdf.service.js';

function file(req: Request) { return (req.file as Express.Multer.File | undefined); }

function parsePortfolioDocument(uploaded: Express.Multer.File) {
  return /\.pdf$/i.test(uploaded.originalname) || uploaded.mimetype === 'application/pdf'
    ? parsePortfolioPdf(uploaded.path)
    : parsePortfolioWorkbook(uploaded.path);
}

export async function previewPortfolio(req: Request, res: Response) {
  const uploaded = file(req);
  if (!uploaded) return res.status(400).json({ ok: false, error: 'Debes adjuntar un archivo Excel o PDF' });
  try {
    let manualValues: Record<string, unknown> = {};
    try { manualValues = JSON.parse(String(req.body?.manualValues || '{}')); } catch { manualValues = {}; }
    let parsed;
    try {
      parsed = await parsePortfolioDocument(uploaded);
    } catch (error) {
      const totalAmount = Number(manualValues.totalAmount);
      const pendingAmount = Number(manualValues.pendingAmount);
      if (!Number.isFinite(totalAmount) || totalAmount < 0 || !Number.isFinite(pendingAmount) || pendingAmount < 0) throw error;
      parsed = {
        rows: [{ sourceRowNumber: 0, transactionDate: null, thirdPartyIdentification: null, thirdPartyName: 'Carga manual', documentType: null, documentNumber: null, description: 'Valor ingresado manualmente', subtotal: totalAmount, taxAmount: 0, retentionAmount: 0, totalAmount, paidAmount: Math.max(totalAmount - pendingAmount, 0), pendingAmount, paymentStatus: pendingAmount <= 0 ? 'paid' : 'pending', validationStatus: 'valid', validationMessage: null, rawData: { manual: true } }],
        errors: [],
        totals: { subtotal: totalAmount, taxAmount: 0, retentionAmount: 0, totalAmount, pendingAmount }
      };
    }
    return res.json({ ok: true, data: { sheetName: parsed.sheetName, headerRow: parsed.headerRow, columns: parsed.columns, totalRows: parsed.rows.length, errors: parsed.errors, totals: parsed.totals } });
  } finally { if (fs.existsSync(uploaded.path)) fs.unlinkSync(uploaded.path); }
}

export async function importPortfolio(req: Request, res: Response) {
  const uploaded = file(req);
  const periodId = String(req.params.id);
  const accountType = String(req.body?.accountType || '').toUpperCase();
  if (!uploaded) return res.status(400).json({ ok: false, error: 'Debes adjuntar un archivo Excel o PDF' });
  if (!['CXC', 'CXP'].includes(accountType)) return res.status(400).json({ ok: false, error: 'El tipo debe ser CXC o CXP' });
  let documentStored = false;
  try {
    if (!await documentModel.ownsPeriod(periodId, req.user!.codigo, req.user!.role)) return res.status(404).json({ ok: false, error: 'Periodo no encontrado' });
    const parsed = await parsePortfolioDocument(uploaded);
    const document = await documentModel.create(periodId, 'Portfolio', accountType, uploaded, req.user!.codigo);
    documentStored = true;
    const loadId = await portfolioModel.createLoad(periodId, String(document.id), accountType as 'CXC' | 'CXP');
    const result = await portfolioModel.saveRows(loadId, parsed.rows, req.user!.codigo);
    return res.status(201).json({ ok: true, data: { loadId, documentId: document.id, ...result, warnings: parsed.errors.slice(0, 50) } });
  } finally { if (!documentStored && fs.existsSync(uploaded.path)) fs.unlinkSync(uploaded.path); }
}

export async function listPortfolio(req: Request, res: Response) {
  if (!await documentModel.ownsPeriod(String(req.params.id), req.user!.codigo, req.user!.role)) return res.status(404).json({ ok: false, error: 'Periodo no encontrado' });
  return res.json({ ok: true, data: await portfolioModel.findByPeriod(String(req.params.id)) });
}

export async function portfolioSummary(req: Request, res: Response) {
  return res.json({ ok: true, data: await portfolioModel.summaryByClientYear(String(req.params.clientId), String(req.params.fiscalYear)) });
}
