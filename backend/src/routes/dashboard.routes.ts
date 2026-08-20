// Endpoints de resúmenes y seguimiento de clientes.
import { Router } from 'express';
import { getClientDashboard } from '../controllers/dashboard.controller.js';
import { requirePermission } from '../middleware/permission.middleware.js';

const router = Router();
// Solo los roles con dashboard.read pueden consultar el avance del cliente.
router.get('/client/:clientId', requirePermission('dashboard.read'), getClientDashboard);
export default router;
