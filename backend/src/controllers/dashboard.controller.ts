// Controller del dashboard: recibe filtros HTTP y delega los cálculos al service.
import type { Request, Response } from 'express';
import * as dashboardService from '../services/dashboard.service.js';

export const getClientDashboard = async (req: Request, res: Response) => {
  const year = typeof req.query.year === 'string' ? req.query.year : String(new Date().getFullYear());
  if (!/^\d{4}$/.test(year)) return res.status(400).json({ ok: false, error: 'Año fiscal inválido' });
  const data = await dashboardService.getClientDashboard(String(req.params.clientId), year, req.user!.codigo, req.user!.role);
  if (!data) return res.status(404).json({ ok: false, error: 'Cliente no encontrado' });
  return res.json({ ok: true, data });
};
