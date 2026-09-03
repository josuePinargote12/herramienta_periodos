// Carga variables de entorno y configura la aplicación Express principal.
import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { testDatabaseConnection } from './config/database.js';
import ssoRoutes from './routes/sso.routes.js';
import authRoutes from './routes/auth.routes.js';
import clientRoutes from './routes/client.routes.js';
import periodRoutes from './routes/period.routes.js';
import { requireAuth } from './middleware/auth.middleware.js';
import { cleanupSsoData } from './models/sso.model.js';
import { requireCsrf } from './middleware/csrf.middleware.js';
import dashboardRoutes from './routes/dashboard.routes.js';
// Rutas del cierre anual del Impuesto a la Renta.
import annualTaxRoutes from './routes/annualTax.routes.js';
import auditRoutes from './routes/audit.routes.js';
import portfolioRoutes from './routes/portfolio.routes.js';
import { downloadCombinedPdf } from './controllers/combinedShare.controller.js';

// Instancia de Express que recibe y dirige las peticiones HTTP.
const app = express();
// Oculta la tecnología utilizada y añade cabeceras HTTP de seguridad.
app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false }));
// Permite obtener la IP real cuando el backend está detrás de nginx.
// Ngrok agrega X-Forwarded-For incluso durante las pruebas locales.
app.set('trust proxy', 1);
// CORS permite al frontend autorizado comunicarse con este backend y enviar cookies.
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173', credentials: true }));
// Permite interpretar cuerpos JSON enviados por el frontend.
app.use(express.json());
// Expone las cookies como req.cookies sin hacerlas accesibles al frontend.
app.use(cookieParser());
// Permite recibir el ticket en el cuerpo de un formulario POST.
app.use(express.urlencoded({ extended: false, limit: '1kb' }));
app.use('/api', requireCsrf);
// Limita intentos contra los endpoints SSO.
app.use('/api/sso/consume', rateLimit({ windowMs: 60_000, max: 20, standardHeaders: true, legacyHeaders: false }));
// Endpoint simple para comprobar que el servidor está activo.
app.get('/', (_req: Request, res: Response) => res.json({ ok: true, service: 'contamatic-api', message: 'Backend activo' }));
app.get('/api/health', (_req: Request, res: Response) => res.json({ ok: true, service: 'contamatic-api' }));
// Endpoint de diagnóstico que prueba una conexión real a la base de datos.
app.get('/api/health/database', async (_req: Request, res: Response) => {
  try {
    await testDatabaseConnection();
    res.json({ ok: true, database: 'connected' });
  } catch (error) {
    console.error('[database] connection failed:', error);
    res.status(503).json({ ok: false, database: 'disconnected', error: 'Servicio temporalmente no disponible' });
  }
});
app.get('/api/public/share-pdf', downloadCombinedPdf);
// Monta las rutas SSO bajo el prefijo /api/sso.
app.use('/api/sso', ssoRoutes);
// Monta el login bajo el prefijo /api/auth.
app.use('/api/auth', authRoutes);
// Rutas privadas: requieren Authorization: Bearer <accessToken>.
app.use('/api/clients', requireAuth, clientRoutes);
app.use('/api/periods', requireAuth, periodRoutes);
app.use('/api/dashboard', requireAuth, dashboardRoutes);
app.use('/api/audit', requireAuth, auditRoutes);
app.use('/api', requireAuth, portfolioRoutes);
// Rutas privadas del impuesto anual: el router contiene /clients/... y /annual-tax/....
app.use('/api', requireAuth, annualTaxRoutes);

// Registra el detalle internamente, pero devuelve un mensaje genérico al cliente.
app.use((error: unknown, _req: Request, res: Response, _next: unknown) => {
  console.error('[api] unhandled error:', error);
  res.status(500).json({ ok: false, error: 'Ocurrió un error interno' });
});

// Usa el puerto configurado o 3000 como valor predeterminado.
const port = Number(process.env.PORT || 3000);
// En producción escucha solo en loopback; nginx será el punto público HTTPS.
const host = process.env.HOST || (process.env.NODE_ENV === 'production' ? '127.0.0.1' : '0.0.0.0');
// Limpia datos temporales al iniciar y después cada hora.
const runSsoCleanup = async () => {
  try {
    const result = await cleanupSsoData();
    if (result.preauthDeleted || result.ticketsDeleted) console.log('[sso-cleanup]', result);
  } catch (error) {
    console.error('[sso-cleanup] failed:', error);
  }
};
void runSsoCleanup();
const cleanupTimer = setInterval(() => void runSsoCleanup(), 60 * 60 * 1000);
cleanupTimer.unref();
// Inicia el servidor y muestra su dirección local.
app.listen(port, host, () => console.log(`ContaMatic API running at http://${host}:${port}`));
