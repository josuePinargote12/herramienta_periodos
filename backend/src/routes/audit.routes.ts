import { Router } from 'express';
import { listAudit } from '../controllers/audit.controller.js';
import { requirePermission } from '../middleware/permission.middleware.js';

const router = Router();

// Historial de solo lectura; el permiso se valida antes del controller.
router.get('/', requirePermission('audit.read'), listAudit);

export default router;
