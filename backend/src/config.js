import 'dotenv/config';
import path from 'node:path';

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config = {
  port: parseInt(process.env.PORT || '4000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: required('DATABASE_URL'),
  sessionSecret: required('SESSION_SECRET'),
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  // Repo-root uploads/ by default (already gitignored) — outside any
  // static-served directory. Photos are only ever streamed back through
  // the authenticated /api/style-cards/:id/photo route, never a static path.
  uploadsDir: process.env.UPLOADS_DIR
    ? path.resolve(process.env.UPLOADS_DIR)
    : path.resolve(import.meta.dirname, '../../uploads'),
  // Where the QR code on the wall screen points. In dev this is the Vite
  // dev server (which serves the static /join and /scan pages); in
  // production it should be the shop's real public domain.
  publicBaseUrl: process.env.PUBLIC_BASE_URL || 'http://localhost:5173',
};
