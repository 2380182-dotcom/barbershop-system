import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireRole } from '../middleware/auth.js';
import { findCustomerByPhone, deleteCustomer, CustomerNotFoundError, CustomerConfirmationError } from '../lib/customers.js';
import { getRecentStyleCards } from '../lib/styleCards.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { logAudit } from '../lib/audit.js';

const router = Router();

router.use(requireRole('owner', 'barber'));

// Read-only preview for the tablet's add-customer flow: show name, last
// visit date, and last cut for a phone number before joining the queue.
// Does not create.
router.get('/lookup', asyncHandler(async (req, res) => {
  const { phone } = req.query;
  if (!phone) {
    return res.status(400).json({ error: 'phone is required' });
  }

  const customer = await findCustomerByPhone(phone);
  if (!customer) {
    return res.json({ customer: null, lastVisit: null, lastCard: null });
  }

  const { rows } = await pool.query(
    `select business_date from visits where customer_id = $1 order by created_at desc limit 1`,
    [customer.id]
  );
  const [lastCard] = await getRecentStyleCards(customer.id, 1);

  res.json({
    customer: { id: customer.id, name: customer.name, phone: customer.phone, consentPhotos: customer.consent_photos },
    lastVisit: rows[0]?.business_date ?? null,
    lastCard: lastCard || null,
  });
}));

router.get('/:id/style-cards', asyncHandler(async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 5, 50);
  const cards = await getRecentStyleCards(req.params.id, limit);
  res.json({ styleCards: cards });
}));

// Irreversible — owner only, and requires the customer's own phone number
// typed back as confirmation (checked here, not just trusted from the UI).
router.delete('/:id', requireRole('owner'), asyncHandler(async (req, res) => {
  const { confirmPhone } = req.body || {};
  if (!confirmPhone) {
    return res.status(400).json({ error: 'confirmPhone is required' });
  }

  try {
    const { phone } = await deleteCustomer(req.params.id, confirmPhone);
    await logAudit({
      userId: req.session.user.id,
      action: 'delete',
      entity: 'customer',
      entityId: req.params.id,
      detail: { phone },
    });
    res.json({ ok: true });
  } catch (err) {
    if (err instanceof CustomerConfirmationError) {
      return res.status(400).json({ error: err.message });
    }
    if (err instanceof CustomerNotFoundError) {
      return res.status(404).json({ error: err.message });
    }
    throw err;
  }
}));

export default router;
