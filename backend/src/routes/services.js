import { Router } from 'express';
import { pool } from '../db/pool.js';
import { logAudit } from '../lib/audit.js';
import { requireRole } from '../middleware/auth.js';

const router = Router();

router.use(requireRole('owner'));

router.get('/', async (req, res) => {
  const { rows } = await pool.query(`select * from services order by sort_order, created_at`);
  res.json({ services: rows });
});

router.post('/', async (req, res) => {
  const { name, durationMinutes, price, growOutDays, sortOrder } = req.body || {};
  if (!name || !durationMinutes) {
    return res.status(400).json({ error: 'name and durationMinutes are required' });
  }
  if (durationMinutes <= 0) {
    return res.status(400).json({ error: 'durationMinutes must be greater than 0' });
  }

  const { rows } = await pool.query(
    `insert into services (name, duration_minutes, price, grow_out_days, sort_order)
     values ($1, $2, $3, $4, $5) returning *`,
    [name, durationMinutes, price ?? 0, growOutDays ?? 21, sortOrder ?? 0]
  );

  await logAudit({
    userId: req.session.user.id,
    action: 'create',
    entity: 'service',
    entityId: rows[0].id,
    detail: { name },
  });

  res.status(201).json({ service: rows[0] });
});

router.put('/:id', async (req, res) => {
  const { name, durationMinutes, price, growOutDays, sortOrder, active } = req.body || {};
  const fields = [];
  const values = [];

  const set = (column, value) => {
    values.push(value);
    fields.push(`${column} = $${values.length}`);
  };

  if (name !== undefined) set('name', name);
  if (durationMinutes !== undefined) set('duration_minutes', durationMinutes);
  if (price !== undefined) set('price', price);
  if (growOutDays !== undefined) set('grow_out_days', growOutDays);
  if (sortOrder !== undefined) set('sort_order', sortOrder);
  if (active !== undefined) set('active', active);

  if (fields.length === 0) {
    return res.status(400).json({ error: 'No editable fields provided' });
  }

  values.push(req.params.id);
  const { rows } = await pool.query(
    `update services set ${fields.join(', ')} where id = $${values.length} returning *`,
    values
  );
  if (!rows[0]) {
    return res.status(404).json({ error: 'Service not found' });
  }

  await logAudit({
    userId: req.session.user.id,
    action: 'update',
    entity: 'service',
    entityId: rows[0].id,
    detail: req.body,
  });

  res.json({ service: rows[0] });
});

router.delete('/:id', async (req, res) => {
  const { rows } = await pool.query(
    `update services set active = false where id = $1 returning *`,
    [req.params.id]
  );
  if (!rows[0]) {
    return res.status(404).json({ error: 'Service not found' });
  }

  await logAudit({
    userId: req.session.user.id,
    action: 'deactivate',
    entity: 'service',
    entityId: rows[0].id,
  });

  res.json({ service: rows[0] });
});

export default router;
