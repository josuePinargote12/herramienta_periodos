import type { Request, Response } from 'express';
import * as clientModel from '../models/client.model.js';
import * as auditModel from '../models/audit.model.js';
import { pool } from '../config/database.js';

export const listClients = async (req: Request, res: Response) => {
  return res.json({ ok: true, data: await clientModel.findAll(req.user!.codigo, req.user!.role) });
};

export const listDisabledClients = async (req: Request, res: Response) => res.json({ ok: true, data: await clientModel.findDisabled(req.user!.codigo, req.user!.role) });

export const restoreClient = async (req: Request, res: Response) => {
  const restored = await clientModel.restore(String(req.params.id), req.user!.codigo, req.user!.role);
  if (!restored) return res.status(404).json({ ok: false, error: 'Cliente deshabilitado no encontrado' });
  await auditModel.record({ clientId: String(req.params.id), action: 'client.restored', userId: req.user!.codigo });
  return res.json({ ok: true });
};

export const getClient = async (req: Request, res: Response) => {
  const client = await clientModel.findById(String(req.params.id), req.user!.codigo, req.user!.role);
  if (!client) return res.status(404).json({ ok: false, error: 'Cliente no encontrado' });
  return res.json({ ok: true, data: client });
};

export const createClient = async (req: Request, res: Response) => {
  const body = req.body || {};
  if (!body.name || !body.ruc || !body.owner || !body.email || !body.phone) {
    return res.status(400).json({ ok: false, error: 'Los datos obligatorios del cliente están incompletos' });
  }
  const identificationType = body.idType === 'cedula' ? 'cedula' : 'ruc';
  const identification = String(body.ruc);
  if (identificationType === 'cedula' && !/^\d{10}$/.test(identification)) {
    return res.status(400).json({ ok: false, error: 'La cédula debe tener 10 dígitos' });
  }
  if (identificationType === 'ruc' && !/^\d{10}001$/.test(identification)) {
    return res.status(400).json({ ok: false, error: 'El RUC debe tener 13 dígitos y terminar en 001' });
  }
  try {
    const assignedUserCode = Number(body.assignedUserCode);
    if (req.user!.role === 'ADMIN' && (!Number.isInteger(assignedUserCode) || assignedUserCode <= 0)) {
      return res.status(400).json({ ok: false, error: 'Debes seleccionar un contador para el cliente' });
    }
    if (req.user!.role === 'ADMIN') {
      const [assignees]: any = await pool.execute(`SELECT COD_USUEMP FROM usuarios WHERE COD_USUEMP = ? AND ELIMINADO = 0 AND UPPER(ROL_USUEMP) IN ('IMPRENTA', 'GERENTE', 'VENDEDOR') LIMIT 1`, [assignedUserCode]);
      if (!assignees.length) return res.status(400).json({ ok: false, error: 'El contador seleccionado no es válido' });
    }
    const client: any = await clientModel.create(body, req.user!.codigo, req.user!.role, assignedUserCode);
    await auditModel.record({ clientId: client?.id, action: 'client.created', details: { name: client?.name, ruc: client?.ruc }, userId: req.user!.codigo });
    return res.status(201).json({ ok: true, data: client });
  } catch (error: any) {
    if (error?.code === 'ER_DUP_ENTRY') return res.status(409).json({ ok: false, error: 'El RUC ya está registrado' });
    throw error;
  }
};

export const updateClient = async (req: Request, res: Response) => {
  const body = req.body || {};
  if (!body.name || !body.ruc || !body.owner || !body.email || !body.phone) return res.status(400).json({ ok: false, error: 'Los datos obligatorios del cliente están incompletos' });
  const identification = String(body.ruc);
  if (body.idType === 'cedula' ? !/^\d{10}$/.test(identification) : !/^\d{10}001$/.test(identification)) return res.status(400).json({ ok: false, error: 'Identificación inválida' });
  try {
    const before: any = await clientModel.findById(String(req.params.id), req.user!.codigo, req.user!.role);
    const client: any = await clientModel.update(String(req.params.id), body, req.user!.codigo, req.user!.role);
    if (!client) return res.status(404).json({ ok: false, error: 'Cliente no encontrado' });
    await auditModel.record({ clientId: client.id, action: 'client.updated', details: { before: { name: before?.name, ruc: before?.ruc, owner: before?.owner, email: before?.email, phone: before?.phone, taxRegime: before?.taxRegime, accounting: before?.accounting }, after: { name: client.name, ruc: client.ruc, owner: client.owner, email: client.email, phone: client.phone, taxRegime: client.taxRegime, accounting: client.accounting } }, userId: req.user!.codigo });
    return res.json({ ok: true, data: client });
  } catch (error: any) {
    if (error?.code === 'ER_DUP_ENTRY') return res.status(409).json({ ok: false, error: 'El RUC ya está registrado' });
    throw error;
  }
};

export const deleteClient = async (req: Request, res: Response) => {
  try {
    const before: any = await clientModel.findById(String(req.params.id), req.user!.codigo, req.user!.role);
    const deleted = await clientModel.remove(String(req.params.id), req.user!.codigo, req.user!.role);
    if (!deleted) return res.status(404).json({ ok: false, error: 'Cliente no encontrado' });
    await auditModel.record({ clientId: String(req.params.id), action: 'client.disabled', details: { name: before?.name, ruc: before?.ruc }, userId: req.user!.codigo });
    return res.json({ ok: true });
  } catch (error) { throw error; }
};
