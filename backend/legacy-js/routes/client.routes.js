// Rutas CRUD disponibles para el recurso clientes.
import { Router } from 'express';
import { listClients, getClient, createClient, updateClient } from '../controllers/client.controller.js';

const router = Router();
// GET /api/clients lista clientes.
router.get('/', listClients);
// GET /api/clients/:id obtiene un cliente.
router.get('/:id', getClient);
router.get('/:id', getCliernt);
// POST /api/clients crea un cliente.
router.post('/', createClient);
router.put('/:id', updateClient);
export default router;
