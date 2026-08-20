// Controladores HTTP de clientes: reciben solicitudes y delegan los datos al modelo.
import * as clientModel from '../models/client.model.js';

// Devuelve todos los clientes existentes.
export const listClients = (_req, res) => res.json({ ok: true, data: clientModel.findAll() });
export const getClient = (req, res) => {
  // Busca un cliente usando el id que viene en la URL.
  const client = clientModel.findById(req.params.id);
  if (!client) return res.status(404).json({ ok: false, error: 'Cliente no encontrado' });
  res.json({ ok: true, data: client });
};
export const createClient = (req, res) => {
  // Verifica los campos mínimos antes de crear el cliente.
  if (!req.body.name || !req.body.ruc) return res.status(400).json({ ok: false, error: 'name y ruc son obligatorios' });
  res.status(201).json({ ok: true, data: clientModel.create(req.body) });
};
