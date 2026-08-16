import express from 'express';
import cors from 'cors';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import { config } from './config.js';
import { pool } from './db/pool.js';
import authRoutes from './routes/auth.js';
import shopSettingsRoutes from './routes/shopSettings.js';
import barbersRoutes from './routes/barbers.js';
import servicesRoutes from './routes/services.js';

const PgSession = connectPgSimple(session);

export function createApp() {
  const app = express();

  app.use(cors({ origin: config.corsOrigin, credentials: true }));
  app.use(express.json());

  app.use(
    session({
      store: new PgSession({ pool, tableName: 'session', createTableIfMissing: true }),
      name: 'barber.sid',
      secret: config.sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: config.nodeEnv === 'production',
        maxAge: 1000 * 60 * 60 * 12, // 12 hours
      },
    })
  );

  app.get('/api/health', (req, res) => res.json({ ok: true }));

  app.use('/api/auth', authRoutes);
  app.use('/api/shop-settings', shopSettingsRoutes);
  app.use('/api/barbers', barbersRoutes);
  app.use('/api/services', servicesRoutes);

  app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
