import type { Request, Response } from 'express';
import * as periodModel from '../models/period.model.js';
import { pool } from '../config/database.js';

export const listPeriods = async (req: Request, res: Response) => res.json({ ok: true, data: await periodModel.ensureAndFindAll(req.user!.codigo, req.user!.role, typeof req.query.year === 'string' ? req.query.year : undefined, typeof req.query.clientId === 'string' ? req.query.clientId : undefined) });

export const listPeriodYears = async (req: Request, res: Response) => res.json({ ok: true, data: await periodModel.findYears(req.user!.codigo, req.user!.role, typeof req.query.clientId === 'string' ? req.query.clientId : undefined) });

export const createPeriodYear = async (req: Request, res: Response) => {
  const year = Number(req.body?.year);
  if (!Number.isInteger(year) || year < 2000) return res.status(400).json({ ok: false, error: 'Año fiscal inválido' });
  const clientId = typeof req.body?.clientId === 'string' ? req.body.clientId : '';
  if (!clientId) return res.status(400).json({ ok: false, error: 'El cliente es obligatorio para aperturar el año' });
  const clientScope = req.user!.role === 'ADMIN' ? '' : ' AND COD_USUEMP = ?';
  const clientParams = req.user!.role === 'ADMIN' ? [clientId] : [clientId, req.user!.codigo];
  const [clients]: any = await pool.execute(`SELECT id FROM clientes WHERE id = ?${clientScope} AND disabled_at IS NULL LIMIT 1`, clientParams);
  if (!clients.length) return res.status(404).json({ ok: false, error: 'Cliente no encontrado' });
  const [latestRows]: any = await pool.execute('SELECT MAX(fiscal_year) AS latestYear FROM accounting_periods WHERE client_id = ?', [clientId]);
  const latestYear = latestRows[0]?.latestYear == null ? null : Number(latestRows[0].latestYear);
  if (latestYear !== null && year !== latestYear + 1) return res.status(400).json({ ok: false, error: `Solo puedes aperturar el año siguiente: ${latestYear + 1}` });
  const [existingPeriods]: any = await pool.execute('SELECT id FROM accounting_periods WHERE client_id = ? AND fiscal_year = ? LIMIT 1', [clientId, year]);
  if (existingPeriods.length) return res.status(409).json({ ok: false, error: 'El año fiscal ya está aperturado y no se puede modificar' });
  await periodModel.createForClient(clientId, year, typeof req.body?.frequency === 'string' ? req.body.frequency : undefined);
  return res.status(201).json({ ok: true, data: await periodModel.ensureAndFindAll(req.user!.codigo, req.user!.role, String(year), clientId) });
};

export const updatePeriod = async (req: Request, res: Response) => {
  const period = await periodModel.update(String(req.params.id), String(req.body?.status || ''), req.user!.codigo, req.user!.role);
  if (!period) return res.status(409).json({ ok: false, error: 'El periodo no existe, el estado es inválido o faltan documentos obligatorios' });
  return res.json({ ok: true, data: period });
};

export const sharePeriod = async (req: Request, res: Response) => {
  const data = await periodModel.share(String(req.params.id), req.user!.codigo, req.user!.role);
  if (!data) return res.status(404).json({ ok: false, error: 'Periodo no encontrado' });
  return res.json({ ok: true, data });
};
