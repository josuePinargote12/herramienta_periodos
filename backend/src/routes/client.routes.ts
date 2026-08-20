// Rutas de clientes: define las URLs de la API y las conecta con controllers.
import { Router } from 'express';
import { getIncomeTax, saveIncomeTax } from '../controllers/incomeTax.controller.js';
import { createClient, deleteClient, getClient, listClients, listDisabledClients, restoreClient, updateClient } from '../controllers/client.controller.js';
import { requirePermission } from '../middleware/permission.middleware.js';

const router = Router(); // El prefijo /api/clients se agrega al montar este router en server.ts.
// Cada ruta consulta el permiso específico antes de ejecutar el controller.

router.get('/', requirePermission('client.read'), listClients);
router.get('/disabled', requirePermission('client.read'), listDisabledClients);
// GET consulta el impuesto; PUT lo guarda y puede abrir los períodos del año.
router.get('/:id/income-tax/:year', requirePermission('income_tax.configure'), getIncomeTax);
router.put('/:id/income-tax/:year', requirePermission('income_tax.configure'), saveIncomeTax);
router.get('/:id', requirePermission('client.read'), getClient);
router.post('/', requirePermission('client.create'), createClient);
router.put('/:id', requirePermission('client.update'), updateClient);
router.delete('/:id', requirePermission('client.disable'), deleteClient);
router.patch('/:id/restore', requirePermission('client.update'), restoreClient);

export default router;
