import crypto from 'node:crypto';
import { pool } from '../db/pool.js';
import { config } from '../config.js';

const TOKEN_LIFETIME_MINUTES = 5;
const ROTATE_AFTER_MINUTES = 2;

/**
 * The QR code on the wall screen is only worth showing if it's fresh — a
 * photo of it from home should stop working quickly. Rather than a
 * separate cron pushing new tokens on a timer, this rotates lazily: the
 * current token is reused until it's more than 2 minutes old, then a new
 * 5-minute token is issued. Read on every /api/display poll (every 3s),
 * so in practice the visible code changes every ~2 minutes as specified.
 */
export async function getCurrentQrToken(now = new Date()) {
  const { rows } = await pool.query(
    `select * from qr_tokens where expires_at > $1 order by issued_at desc limit 1`,
    [now.toISOString()]
  );
  const latest = rows[0];
  const rotateThreshold = new Date(now.getTime() - ROTATE_AFTER_MINUTES * 60000);

  if (latest && new Date(latest.issued_at) > rotateThreshold) {
    return latest;
  }

  const token = crypto.randomBytes(24).toString('base64url');
  const expiresAt = new Date(now.getTime() + TOKEN_LIFETIME_MINUTES * 60000);
  // issued_at is bound to the same `now` as expires_at, not the column's
  // own now() default — otherwise a caller passing a non-real `now` (tests,
  // or any future simulated-clock use) gets a row whose issued_at/expires_at
  // pair no longer agrees with the real clock, which is exactly the
  // real-vs-simulated-time mismatch bug already found once in this project.
  const { rows: inserted } = await pool.query(
    `insert into qr_tokens (token, issued_at, expires_at) values ($1, $2, $3) returning *`,
    [token, now.toISOString(), expiresAt.toISOString()]
  );
  return inserted[0];
}

export function buildJoinUrl(token) {
  // Explicit index.html: Vite dev serves the admin SPA's own index.html for
  // any trailing-slash path it doesn't otherwise resolve (needed so the
  // admin app's client-side routes survive a reload) — that fallback runs
  // ahead of the public/ directory's own index resolution, so /join/ alone
  // doesn't reach this static page. /join/index.html always does.
  return `${config.publicBaseUrl}/join/index.html?t=${encodeURIComponent(token)}`;
}

export async function isValidQrToken(token, now = new Date()) {
  if (!token) return false;
  const { rows } = await pool.query(
    `select 1 from qr_tokens where token = $1 and expires_at > $2`,
    [token, now.toISOString()]
  );
  return rows.length > 0;
}

/** Daily cron: expired tokens serve no purpose once past expiry. */
export async function deleteExpiredQrTokens(now = new Date()) {
  const { rowCount } = await pool.query(`delete from qr_tokens where expires_at <= $1`, [now.toISOString()]);
  return rowCount;
}
