// Controller del cierre anual: recibe parámetros HTTP y devuelve respuestas JSON.
// La lógica de cálculo y las consultas están separadas en annualTax.service.ts.
import type { Request, Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import * as annualTaxService from '../services/annualTax.service.js';
import * as documentModel from '../models/document.model.js';

function fiscalYearFromRequest(req: Request) {
  const year = String(req.params.fiscalYear || '');
  if (!/^\d{4}$/.test(year) || Number(year) < 2000) {
    throw new Error('Año fiscal inválido');
  }
  return year;
}

// GET /clients/:clientId/annual-tax/:fiscalYear
// Devuelve configuración, declaración anual y base acumulada en vivo.
export async function getAnnualTax(req: Request, res: Response) {
  try {
    const month = req.query.month ? Number(req.query.month) : undefined;
    const data = await annualTaxService.getAnnualSummary(
      String(req.params.clientId),
      fiscalYearFromRequest(req),
      req.user!.codigo,
      month,
      month !== undefined && Number.isInteger(month) && month >= 1 && month <= 12
    );
    return res.json({ ok: true, data });
  } catch (error: any) {
    return res.status(error?.message === 'Cliente no encontrado' ? 404 : 400)
      .json({ ok: false, error: error?.message || 'No se pudo consultar el impuesto anual' });
  }
}

// POST /clients/:clientId/annual-tax/:fiscalYear/accumulate
// Guarda el IVA, retenciones y total acumulado del Módulo 5.
export async function accumulateAnnualTax(req: Request, res: Response) {
  try {
    const month = req.body?.month ? Number(req.body.month) : undefined;
    const data = await annualTaxService.accumulateAnnualBase(
      String(req.params.clientId),
      fiscalYearFromRequest(req),
      req.user!.codigo,
      month
    );
    return res.json({ ok: true, data });
  } catch (error: any) {
    return res.status(error?.message === 'Cliente no encontrado' ? 404 : 400)
      .json({ ok: false, error: error?.message || 'No se pudo calcular el acumulado anual' });
  }
}

// POST /clients/:clientId/annual-tax/:fiscalYear/close
// Congela el acumulado y cambia la declaración a calculada.
export async function closeAnnualTax(req: Request, res: Response) {
  try {
    const data = await annualTaxService.closeAnnualDeclaration(
      String(req.params.clientId),
      fiscalYearFromRequest(req),
      req.user!.codigo,
      req.file as Express.Multer.File | undefined
    );
    return res.json({ ok: true, data });
  } catch (error: any) {
    return res.status(error?.message === 'Cliente no encontrado' ? 404 : 400)
      .json({ ok: false, error: error?.message || 'No se pudo cerrar el año fiscal' });
  }
}

// POST /annual-tax/:id/present
// El route que maneje el archivo debe guardar primero el documento y enviar su id.
export async function presentAnnualTax(req: Request, res: Response) {
  try {
    await annualTaxService.presentAnnualDeclaration(String(req.params.id), req.file as Express.Multer.File | undefined, req.user!.codigo);
    return res.json({ ok: true, message: 'Declaración anual presentada correctamente' });
  } catch (error: any) {
    return res.status(400).json({ ok: false, error: error?.message || 'No se pudo presentar la declaración anual' });
  }
}

export async function downloadAnnualForm101(req: Request, res: Response) {
  try {
    const declaration: any = await annualTaxService.getAnnualDeclarationById(String(req.params.id), req.user!.codigo);
    if (!declaration?.annualDocumentId) return res.status(404).json({ ok: false, error: 'El Formulario 101 aún no ha sido presentado' });
    const file: any = await documentModel.findFile(String(declaration.annualDocumentId), req.user!.codigo, req.user!.role);
    const absolutePath = file ? path.resolve(file.filePath) : '';
    if (!file || !fs.existsSync(absolutePath)) return res.status(404).json({ ok: false, error: 'Archivo no encontrado' });
    return res.download(absolutePath, file.originalName, { headers: { 'Content-Type': file.mimeType || 'application/pdf' } });
  } catch (error: any) {
    return res.status(400).json({ ok: false, error: error?.message || 'No se pudo descargar el Formulario 101' });
  }
}

// POST /annual-tax/:id/pay
// Registra el pago y solo permite la transición presentada → pagada.
export async function payAnnualTax(req: Request, res: Response) {
  try {
    const paidAmount = Number(req.body?.paidAmount);
    const paymentDate = String(req.body?.paymentDate || '');
    await annualTaxService.payAnnualDeclaration(
      String(req.params.id),
      paidAmount,
      paymentDate,
      req.user!.codigo
    );
    return res.json({ ok: true, message: 'Pago registrado correctamente' });
  } catch (error: any) {
    return res.status(400).json({ ok: false, error: error?.message || 'No se pudo registrar el pago' });
  }
}
