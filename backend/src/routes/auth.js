import { Router } from 'express';
import bcrypt from 'bcrypt';
import rateLimit from 'express-rate-limit';
import { pool } from '../db/pool.js';
import { logAudit } from '../lib/audit.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Try again later.' },
});

router.post('/login', loginLimiter, async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  const { rows } = await pool.query(
    `select id, name, username, password_hash, role, active from users where username = $1`,
    [username]
  );
  const user = rows[0];

  if (!user || !user.active) {
    await logAudit({ action: 'login_failed', entity: 'user', detail: { username } });
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  const passwordMatches = await bcrypt.compare(password, user.password_hash);
  if (!passwordMatches) {
    await logAudit({ userId: user.id, action: 'login_failed', entity: 'user', entityId: user.id, detail: { username } });
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  req.session.user = { id: user.id, name: user.name, username: user.username, role: user.role };

  await pool.query(`update users set last_login_at = now() where id = $1`, [user.id]);
  await logAudit({ userId: user.id, action: 'login_success', entity: 'user', entityId: user.id });

  res.json({ user: req.session.user });
});

router.post('/logout', requireAuth, async (req, res) => {
  const userId = req.session.user.id;
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to log out' });
    }
    res.clearCookie('barber.sid');
    logAudit({ userId, action: 'logout', entity: 'user', entityId: userId }).catch(() => {});
    res.json({ ok: true });
  });
});

router.get('/me', (req, res) => {
  res.json({ user: req.session.user || null });
});

export default router;
