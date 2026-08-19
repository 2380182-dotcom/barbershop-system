import { Router } from 'express';
import { requireRole } from '../middleware/auth.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { logAudit } from '../lib/audit.js';
import { optOutCustomer, getCostPreview } from '../lib/messaging.js';

const router = Router();

// Public: this is what the inbound WhatsApp webhook calls when a customer
// replies STOP — it has no session, so it can't sit behind requireRole.
// The owner triggers the same effect manually from the customer's record
// through the same endpoint, using their own session (harmless either way:
// opting out only ever narrows what gets sent to that phone number).
router.post('/opt-out', asyncHandler(async (req, res) => {
  const { phone } = req.body || {};
  if (!phone) {
    return res.status(400).json({ error: 'phone is required' });
  }

  const customer = await optOutCustomer(phone);
  if (!customer) {
    return res.status(404).json({ error: 'Customer not found' });
  }

  await logAudit({
    userId: req.session.user?.id,
    action: 'opt_out',
    entity: 'customer',
    entityId: customer.id,
  });

  res.json({ customer });
}));

router.get('/cost-preview', requireRole('owner'), asyncHandler(async (req, res) => {
  const { template, from, to } = req.query;
  const preview = await getCostPreview({ template, from, to });
  res.json(preview);
}));

export default router;
