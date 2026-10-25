import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config } from './config.js';
import { pool } from './db.js';
import { HttpError } from './util.js';
import { LOCAL_DIR } from './storage.js';
import authRoutes from './routes/auth.js';
import uploadRoutes from './routes/uploads.js';
import videoRoutes from './routes/videos.js';
import userRoutes from './routes/users.js';
import moderationRoutes from './routes/moderation.js';
import legalRoutes from './routes/legal.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1); // running behind a load balancer / PaaS proxy
  app.disable('x-powered-by');

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({ origin: config.corsOrigins }));
  app.use(express.json({ limit: '100kb' }));

  app.use(rateLimit({ windowMs: 15 * 60_000, limit: 600, standardHeaders: true, legacyHeaders: false }));
  const authLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 30, standardHeaders: true, legacyHeaders: false });

  app.get('/', (_req, res) => {
    res.json({ service: 'Clipzy API', health: '/health' });
  });

  app.get('/health', async (_req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ ok: true });
    } catch {
      res.status(503).json({ ok: false });
    }
  });

  if (config.STORAGE_DRIVER === 'local') {
    app.use('/media', express.static(LOCAL_DIR, { maxAge: '1h' }));
  }

  app.use(legalRoutes);
  app.use('/auth', authLimiter, authRoutes);
  app.use('/uploads', uploadRoutes);
  app.use(videoRoutes);
  app.use(userRoutes);
  app.use(moderationRoutes);

  app.use((_req, _res, next) => next(new HttpError(404, 'Not found', 'not_found')));

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err.type === 'entity.parse.failed') err = new HttpError(400, 'Invalid JSON', 'bad_json');
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, code: err.code });
    console.error(err);
    res.status(500).json({ error: 'Internal server error', code: 'internal' });
  });

  return app;
}
