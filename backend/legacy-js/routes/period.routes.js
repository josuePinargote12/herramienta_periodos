// Rutas HTTP de períodos contables.
import { Router } from 'express';
import { listPeriods, updatePeriod } from '../controllers/period.controller.js';

const router = Router();
// GET /api/periods lista períodos y acepta filtros.
router.get('/', listPeriods);
// PATCH /api/periods/:id modifica un período.
router.patch('/:id', updatePeriod);
export default router;
