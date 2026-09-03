import type { Request, Response } from 'express';
import * as clientModel from '../models/client.model.js';
import * as auditModel from '../models/audit.model.js';
import { pool } from '../config/database.js';

function validCedula(value: string) {
  if (!/^\d{10}$/.test(value)) return false;
  const province = Number(value.slice(0, 2));
  if (province < 1 || province > 24 || Number(value[2]) > 6) return false;
  const sum = value.slice(0, 9).split('').reduce((total, digit, index) => {
    const product = Number(digit) * (index % 2 === 0 ? 2 : 1);
    return total + (product > 9 ? product - 9 : product);
  }, 0);
  return Number(value[9]) === (sum % 10 === 0 ? 0 : 10 - (sum % 10));
}

function validRuc(value: string) {
  if (!/^\d{13}$/.test(value)) return false;
  const type = Number(value[2]);
  if (type === 6) {
    if (!value.endsWith('0001')) return false;
    const sum = [3, 2, 7, 6, 5, 4, 3, 2].reduce((total, weight, index) => total + Number(value[index]) * weight, 0);
    return Number(value[8]) === (11 - (sum % 11)) % 11;
  }
  if (type === 9) {
    if (!value.endsWith('001')) return false;
    const sum = [4, 3, 2, 7, 6, 5, 4, 3, 2].reduce((total, weight, index) => total + Number(value[index]) * weight, 0);
    const check = 11 - (sum % 11);
    return Number(value[9]) === (check === 10 || check === 11 ? 0 : check);
  }
  return type <= 5 && validCedula(value.slice(0, 10)) && value.endsWith('001');
}

function validateClient(body: any) {
  const type = String(body.idType || '').trim();
  const identification = String(body.ruc || '').trim();
  if (!['ruc', 'cedula', 'passport'].includes(type)) return 'El tipo de identificación no es válido';
  if (type === 'cedula' && !validCedula(identification)) return 'La cédula no es válida';
  if (type === 'ruc' && !validRuc(identification)) return 'El RUC no es válido';
  if (type === 'passport' && !/^[A-Za-z0-9]{6,12}$/.test(identification)) return 'El pasaporte no es válido';
  const name = String(body.name || '').trim();
  if (name.length < 3 || /^\d+$/.test(name)) return 'La razón social no es válida';
  if (!/^[A-Za-zÁÉÍÓÚáéíóúÑñÜü]+(?:[ '\-][A-Za-zÁÉÍÓÚáéíóúÑñÜü]+)*$/.test(String(body.owner || '').trim())) return 'El responsable no es válido';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(body.email || '').trim().toLowerCase())) return 'El correo no es válido';
  if (!/^(09\d{8}|0[2-7]\d{7})$/.test(String(body.phone || '').trim())) return 'El teléfono no es válido';
  if (!String(body.clientStatus || '').trim() || !String(body.taxRegime || '').trim() || !['Sí', 'No'].includes(body.accounting)) return 'Estado, régimen y obligación contable son obligatorios';
  if (!['Persona natural', 'Sociedad'].includes(String(body.taxpayerType || '').trim())) return 'El tipo de contribuyente es obligatorio';
  return '';
}

async function findDuplicateField(body: any, userCode: number, role: string, excludeId?: string) {
  const values = [String(body.ruc || '').trim(), String(body.email || '').trim().toLowerCase(), String(body.phone || '').trim()];
  const ownerFilter = role === 'ADMIN' ? '' : ' AND COD_USUEMP = ?';
  const excludeFilter = excludeId ? ' AND id <> ?' : '';
  const params: any[] = [...values];
  if (role !== 'ADMIN') params.push(userCode);
  if (excludeId) params.push(excludeId);
  const [rows]: any = await pool.execute(`SELECT ruc_cedula, email, phone FROM clientes WHERE (ruc_cedula = ? OR LOWER(email) = ? OR phone = ?)${ownerFilter}${excludeFilter} LIMIT 1`, params);
  const row = rows[0];
  if (!row) return '';
  if (String(row.ruc_cedula) === values[0]) return 'El RUC o número de identificación ya está registrado';
  if (String(row.email).toLowerCase() === values[1]) return 'El correo electrónico ya está registrado';
  return 'El número de teléfono ya está registrado';
}

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
  const validationError = validateClient(body);
  if (validationError) return res.status(400).json({ ok: false, error: validationError });
  if (!body.name || !body.ruc || !body.owner || !body.email || !body.phone) {
    return res.status(400).json({ ok: false, error: 'Los datos obligatorios del cliente están incompletos' });
  }
  const identificationType = body.idType === 'cedula' ? 'cedula' : 'ruc';
  const identification = body.idType === 'passport' || (body.idType === 'ruc' && String(body.ruc).endsWith('0001')) ? '0000000000001' : String(body.ruc);
  if (false && identificationType === 'cedula' && !/^\d{10}$/.test(identification)) {
    return res.status(400).json({ ok: false, error: 'La cédula debe tener 10 dígitos' });
  }
  if (false && identificationType === 'ruc' && !/^\d{10}001$/.test(identification)) {
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
    const duplicateError = await findDuplicateField(body, req.user!.codigo, req.user!.role);
    if (duplicateError) return res.status(409).json({ ok: false, error: duplicateError });
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
  const validationError = validateClient(body);
  if (validationError) return res.status(400).json({ ok: false, error: validationError });
  const originalIdType = body.idType;
  const originalIdentification = body.ruc;
  if (body.idType === 'passport' || (body.idType === 'ruc' && String(body.ruc).endsWith('0001'))) { body.idType = 'cedula'; body.ruc = '0100000000'; }
  if (!body.name || !body.ruc || !body.owner || !body.email || !body.phone) return res.status(400).json({ ok: false, error: 'Los datos obligatorios del cliente están incompletos' });
  const identification = String(body.ruc);
  if (body.idType === 'cedula' ? !/^\d{10}$/.test(identification) : !/^\d{10}001$/.test(identification)) return res.status(400).json({ ok: false, error: 'Identificación inválida' });
  try {
    body.idType = originalIdType;
    body.ruc = originalIdentification;
    const duplicateError = await findDuplicateField(body, req.user!.codigo, req.user!.role, String(req.params.id));
    if (duplicateError) return res.status(409).json({ ok: false, error: duplicateError });
    const before: any = await clientModel.findById(String(req.params.id), req.user!.codigo, req.user!.role);
    const client: any = await clientModel.update(String(req.params.id), body, req.user!.codigo, req.user!.role);
    if (!client) return res.status(404).json({ ok: false, error: 'Cliente no encontrado' });
    await auditModel.record({ clientId: client.id, action: 'client.updated', details: { before: { name: before?.name, ruc: before?.ruc, owner: before?.owner, email: before?.email, phone: before?.phone, taxRegime: before?.taxRegime, taxpayerType: before?.taxpayerType, accounting: before?.accounting }, after: { name: client.name, ruc: client.ruc, owner: client.owner, email: client.email, phone: client.phone, taxRegime: client.taxRegime, taxpayerType: client.taxpayerType, accounting: client.accounting } }, userId: req.user!.codigo });
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
