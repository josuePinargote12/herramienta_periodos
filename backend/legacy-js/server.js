// Versión JavaScript del servidor para rutas antiguas de clientes y períodos.
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import clientRoutes from './routes/client.routes.js';
import periodRoutes from './routes/period.routes.js';

// Crea la aplicación Express.
const app = express();
// Permite peticiones del frontend configurado.
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173' }));
// Interpreta cuerpos JSON.
app.use(express.json());
// Endpoint de comprobación del servidor.
app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'contamatic-api' }));
// Registra las rutas de clientes y períodos.
app.use('/api/clients', clientRoutes);
app.use('/api/periods', periodRoutes);
app.use((err, _req, res, _next) => res.status(500).json({ ok: false, error: err.message }));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`ContaMatic API running at http://localhost:${port}`));
