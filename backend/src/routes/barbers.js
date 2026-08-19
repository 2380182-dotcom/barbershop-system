import { Router } from 'express';
import bcrypt from 'bcrypt';
import { pool } from '../db/pool.js';
import { logAudit } from '../lib/audit.js';
import { requireRole } from '../middleware/auth.js';
import { asyncHandler } from '../lib/asyncHandler.js';

const router = Router();
const BCRYPT_COST = 12;

router.use(requireRole('owner'));

router.get('/', asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `select b.*, u.username, u.role as user_role
     from barbers b
     left join users u on u.id = b.user_id
     order by b.sort_order, b.created_at`
  );
  res.json({ barbers: rows });
}));

router.post('/', asyncHandler(async (req, res) => {
  const { displayName, workingDays, sortOrder, username, password } = req.body || {};
  if (!displayName) {
    return res.status(400).json({ error: 'displayName is required' });
  }
  if ((username && !password) || (password && !username)) {
    return res.status(400).json({ error: 'username and password must be provided together' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let userId = null;
    if (username && password) {
      const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
      const { rows: userRows } = await client.query(
        `insert into users (name, username, password_hash, role) values ($1, $2, $3, 'barber') returning id`,
        [displayName, username, passwordHash]
      );
      userId = userRows[0].id;
    }

    const { rows } = await client.query(
      `insert into barbers (user_id, display_name, working_days, sort_order)
       values ($1, $2, $3, $4) returning *`,
      [userId, displayName, workingDays || [0, 1, 2, 3, 4, 5, 6], sortOrder ?? 0]
    );

    await client.query('COMMIT');

    await logAudit({
      userId: req.session.user.id,
      action: 'create',
      entity: 'barber',
      entityId: rows[0].id,
      detail: { displayName, hasLogin: Boolean(userId) },
    });

    res.status(201).json({ barber: rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Username already taken' });
    }
    throw err;
  } finally {
    client.release();
  }
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const { displayName, workingDays, sortOrder, active } = req.body || {};
  const fields = [];
  const values = [];

  const set = (column, value) => {
    values.push(value);
    fields.push(`${column} = $${values.length}`);
  };

  if (displayName !== undefined) set('display_name', displayName);
  if (workingDays !== undefined) set('working_days', workingDays);
  if (sortOrder !== undefined) set('sort_order', sortOrder);
  if (active !== undefined) set('active', active);

  if (fields.length === 0) {
    return res.status(400).json({ error: 'No editable fields provided' });
  }

  values.push(req.params.id);
  const { rows } = await pool.query(
    `update barbers set ${fields.join(', ')} where id = $${values.length} returning *`,
    values
  );
  if (!rows[0]) {
    return res.status(404).json({ error: 'Barber not found' });
  }

  await logAudit({
    userId: req.session.user.id,
    action: 'update',
    entity: 'barber',
    entityId: rows[0].id,
    detail: req.body,
  });

  res.json({ barber: rows[0] });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `update barbers set active = false where id = $1 returning *`,
    [req.params.id]
  );
  if (!rows[0]) {
    return res.status(404).json({ error: 'Barber not found' });
  }

  await logAudit({
    userId: req.session.user.id,
    action: 'deactivate',
    entity: 'barber',
    entityId: rows[0].id,
  });

  res.json({ barber: rows[0] });
}));

export default router;
