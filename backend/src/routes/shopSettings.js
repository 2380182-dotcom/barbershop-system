import { Router } from 'express';
import { pool } from '../db/pool.js';
import { logAudit } from '../lib/audit.js';
import { requireRole } from '../middleware/auth.js';
import { asyncHandler } from '../lib/asyncHandler.js';

const router = Router();

const EDITABLE_FIELDS = [
  'shop_name',
  'timezone',
  'opening_time',
  'closing_time',
  'weekly_off_day',
  'self_join_enabled',
  'appointment_lock_minutes',
  'miss_limit',
  'messaging_mode',
  'quiet_hours_start',
  'quiet_hours_end',
  'daily_message_cap',
  'cost_per_message',
  'public_booking_enabled',
];

router.get('/', requireRole('owner'), asyncHandler(async (req, res) => {
  const { rows } = await pool.query(`select * from shop_settings limit 1`);
  res.json({ shopSettings: rows[0] || null });
}));

router.put('/', requireRole('owner'), asyncHandler(async (req, res) => {
  const { rows: existingRows } = await pool.query(`select id from shop_settings limit 1`);
  if (!existingRows[0]) {
    return res.status(404).json({ error: 'Shop settings have not been seeded yet' });
  }

  const updates = [];
  const values = [];
  for (const field of EDITABLE_FIELDS) {
    if (field in req.body) {
      values.push(req.body[field]);
      updates.push(`${field} = $${values.length}`);
    }
  }
  if (updates.length === 0) {
    return res.status(400).json({ error: 'No editable fields provided' });
  }

  values.push(existingRows[0].id);
  const { rows } = await pool.query(
    `update shop_settings set ${updates.join(', ')}, updated_at = now() where id = $${values.length} returning *`,
    values
  );

  await logAudit({
    userId: req.session.user.id,
    action: 'update',
    entity: 'shop_settings',
    entityId: rows[0].id,
    detail: req.body,
  });

  res.json({ shopSettings: rows[0] });
}));

export default router;
