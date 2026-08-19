import { Router } from 'express';
import { requireRole } from '../middleware/auth.js';
import { logAudit } from '../lib/audit.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import {
  addToQueue,
  callNext,
  markDone,
  markMiss,
  cancelEntry,
  moveEntry,
  getQueueView,
  QueueConflictError,
  QueueNotFoundError,
  QueueBarberUnavailableError,
} from '../lib/queue.js';

const router = Router();

router.use(requireRole('owner', 'barber'));

function handleQueueError(err, res) {
  if (err instanceof QueueConflictError) {
    return res.status(409).json({ error: err.message });
  }
  if (err instanceof QueueNotFoundError) {
    return res.status(404).json({ error: err.message });
  }
  if (err instanceof QueueBarberUnavailableError) {
    return res.status(400).json({ error: err.message });
  }
  throw err;
}

router.get('/', asyncHandler(async (req, res) => {
  const view = await getQueueView();
  res.json(view);
}));

router.post('/', asyncHandler(async (req, res) => {
  const { phone, name, serviceId, barberId } = req.body || {};
  if (!phone || !serviceId) {
    return res.status(400).json({ error: 'phone and serviceId are required' });
  }

  try {
    const { entry, customer } = await addToQueue({
      phone,
      name,
      serviceId,
      barberId: barberId ?? null,
      source: 'tablet',
    });

    await logAudit({
      userId: req.session.user.id,
      action: 'create',
      entity: 'queue_entry',
      entityId: entry.id,
      detail: { tokenNumber: entry.token_number, customerId: customer.id, barberId: entry.barber_id },
    });

    res.status(201).json({ entry, customer });
  } catch (err) {
    handleQueueError(err, res);
  }
}));

router.post('/call-next', asyncHandler(async (req, res) => {
  const { barberId } = req.body || {};
  if (!barberId) {
    return res.status(400).json({ error: 'barberId is required' });
  }

  try {
    const entry = await callNext(barberId);
    await logAudit({
      userId: req.session.user.id,
      action: 'call_next',
      entity: 'queue_entry',
      entityId: entry.id,
      detail: { barberId, tokenNumber: entry.token_number },
    });
    res.json({ entry });
  } catch (err) {
    handleQueueError(err, res);
  }
}));

router.post('/:id/done', asyncHandler(async (req, res) => {
  try {
    const { entry, visit, customer } = await markDone(req.params.id);
    await logAudit({
      userId: req.session.user.id,
      action: 'done',
      entity: 'queue_entry',
      entityId: entry.id,
      detail: { visitId: visit.id },
    });
    res.json({ entry, visit, customer });
  } catch (err) {
    handleQueueError(err, res);
  }
}));

router.post('/:id/miss', asyncHandler(async (req, res) => {
  try {
    const entry = await markMiss(req.params.id);
    await logAudit({
      userId: req.session.user.id,
      action: 'miss',
      entity: 'queue_entry',
      entityId: entry.id,
      detail: { missCount: entry.miss_count, status: entry.status },
    });
    res.json({ entry });
  } catch (err) {
    handleQueueError(err, res);
  }
}));

router.post('/:id/cancel', asyncHandler(async (req, res) => {
  try {
    const entry = await cancelEntry(req.params.id);
    await logAudit({ userId: req.session.user.id, action: 'cancel', entity: 'queue_entry', entityId: entry.id });
    res.json({ entry });
  } catch (err) {
    handleQueueError(err, res);
  }
}));

router.patch('/:id/move', asyncHandler(async (req, res) => {
  const { barberId, direction } = req.body || {};
  try {
    const entry = await moveEntry(req.params.id, { barberId, direction });
    await logAudit({
      userId: req.session.user.id,
      action: 'move',
      entity: 'queue_entry',
      entityId: entry.id,
      detail: { barberId, direction },
    });
    res.json({ entry });
  } catch (err) {
    handleQueueError(err, res);
  }
}));

export default router;
