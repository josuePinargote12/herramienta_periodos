import type { Request, Response } from 'express';
import * as auditModel from '../models/audit.model.js';

// Devuelve únicamente los eventos que el rol autenticado puede consultar.
export async function listAudit(req: Request, res: Response) {
  const data = await auditModel.findAll(req.user!.codigo, req.user!.role);
  return res.json({ ok: true, data });
}
