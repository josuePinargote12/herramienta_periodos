// Define los endpoints relacionados con autenticación.
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { assignableUsersController, currentPermissionsController, currentUserController, loginController, logoutController, refreshController } from '../controllers/auth.controller.js';
import { getAuthContext } from '../controllers/sso.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/permission.middleware.js';
import { issueCsrfToken } from '../middleware/csrf.middleware.js';

const router = Router();
router.get('/csrf', issueCsrfToken);
// Limita el login normal. El primer acceso SSO tiene su propio contador de
// tres intentos en preauth_sessions y no debe consumir este límite por IP.
const loginLimiter = rateLimit({
  windowMs: 15 * 60_000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip: req => Boolean(req.cookies?.preauth || req.cookies?.['__Host-preauth'])
});
// POST /api/auth/login recibe usuario y contraseña.
router.post('/login', loginLimiter, loginController);
// POST /api/auth/refresh renueva el accessToken usando un refreshToken vigente.
router.post('/refresh', refreshController);
// POST /api/auth/logout limpia la cookie temporal preauth si existe.
router.post('/logout', logoutController);
// GET /api/auth/context consulta el estado temporal creado por el handoff SSO.
router.get('/context', getAuthContext);
// GET /api/auth/me valida el JWT y expone los datos seguros en req.user.
router.get('/me', requireAuth, currentUserController);
// GET /api/auth/permissions devuelve el catálogo vigente del rol autenticado.
router.get('/permissions', requireAuth, currentPermissionsController);
router.get('/assignable-users', requireAuth, requireRole('ADMIN'), assignableUsersController);
export default router;
