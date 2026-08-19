import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireRole } from '../middleware/auth.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { businessDate } from '../lib/businessDate.js';
import { getBarberAvailability } from '../lib/availability.js';

const router = Router();

router.use(requireRole('owner', 'barber'));

// Minimal reference data the tablet needs to run the queue (barber names
// for "call next" buttons, service names/durations for the picker). This
// is deliberately separate from /api/barbers and /api/services, which stay
// owner-only per Phase 1's role rule.
//
// Barbers who are absent, on leave, on break, or locked by an imminent
// appointment are left out entirely — this is what keeps them out of the
// add-customer flow's barber picker.
router.get('/', asyncHandler(async (req, res) => {
  const [{ rows: allBarbers }, { rows: services }] = await Promise.all([
    pool.query(
      `select id, display_name, sort_order from barbers where active = true order by sort_order, created_at`
    ),
    pool.query(
      `select id, name, duration_minutes, price, grow_out_days, sort_order from services where active = true order by sort_order, created_at`
    ),
  ]);

  const date = businessDate();
  const availabilities = await Promise.all(allBarbers.map((b) => getBarberAvailability(b.id, date)));
  const barbers = allBarbers.filter((b, i) => availabilities[i].availableForWalkIns);

  res.json({ barbers, services });
}));

export default router;
