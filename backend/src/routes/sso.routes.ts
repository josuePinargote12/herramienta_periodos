// Las rutas son los puntos de entrada HTTP del flujo de autenticación SSO.
import { Router } from 'express';
import { consumeSsoTicket } from '../controllers/sso.controller.js';

const router = Router();
// Endpoint nuevo de la Fase 2: recibe el ticket mediante POST.
router.post('/consume', consumeSsoTicket);
// GET no consume tickets; solo devuelve una respuesta controlada si alguien abre la ruta directamente.
router.get('/consume', consumeSsoTicket);
export default router;
