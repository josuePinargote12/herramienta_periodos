// Controladores HTTP de períodos contables.
import * as periodModel from '../models/period.model.js';

// Lista períodos aplicando los filtros recibidos en la consulta.
export const listPeriods = (req, res) => res.json({ ok: true, data: periodModel.findAll(req.query) });
export const updatePeriod = (req, res) => {
  // Actualiza el período indicado por el parámetro id.
  const period = periodModel.update(req.params.id, req.body);
  if (!period) return res.status(404).json({ ok: false, error: 'Periodo no encontrado' });
  res.json({ ok: true, data: period });
};
