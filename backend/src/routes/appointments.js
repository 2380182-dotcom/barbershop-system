import { Router } from 'express';
import { requireRole } from '../middleware/auth.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { logAudit } from '../lib/audit.js';
import { businessDate } from '../lib/businessDate.js';
import {
  createAppointment,
  getBookableSlots,
  getAppointmentsForDate,
  getNeedsRescheduleAppointments,
  markArrived,
  markNoShow,
  cancelAppointment,
  moveAppointmentToBarber,
  AppointmentValidationError,
  AppointmentConflictError,
  AppointmentNotFoundError,
} from '../lib/appointments.js';

const router = Router();

router.use(requireRole('owner', 'barber'));

function handleAppointmentError(err, res) {
  if (err instanceof AppointmentValidationError) {
    return res.status(400).json({ error: err.message });
  }
  if (err instanceof AppointmentConflictError) {
    return res.status(409).json({ error: err.message });
  }
  if (err instanceof AppointmentNotFoundError) {
    return res.status(404).json({ error: err.message });
  }
  throw err;
}

router.get('/slots', asyncHandler(async (req, res) => {
  const { barber_id: barberId, date, service_id: serviceId } = req.query;
  if (!barberId || !date || !serviceId) {
    return res.status(400).json({ error: 'barber_id, date, and service_id are required' });
  }
  try {
    const slots = await getBookableSlots({ barberId, date, serviceId });
    res.json({ slots });
  } catch (err) {
    handleAppointmentError(err, res);
  }
}));

router.get('/needs-reschedule', requireRole('owner'), asyncHandler(async (req, res) => {
  const appointments = await getNeedsRescheduleAppointments();
  res.json({ appointments });
}));

router.get('/', asyncHandler(async (req, res) => {
  const date = req.query.date || businessDate();
  const appointments = await getAppointmentsForDate(date);

  const byBarber = new Map();
  for (const appt of appointments) {
    if (!byBarber.has(appt.barber_id)) {
      byBarber.set(appt.barber_id, { barberId: appt.barber_id, displayName: appt.barber_name, appointments: [] });
    }
    byBarber.get(appt.barber_id).appointments.push(appt);
  }

  res.json({ date, barbers: Array.from(byBarber.values()) });
}));

router.post('/', asyncHandler(async (req, res) => {
  const { phone, name, barber_id: barberId, service_id: serviceId, starts_at: startsAt } = req.body || {};
  if (!phone || !barberId || !serviceId || !startsAt) {
    return res.status(400).json({ error: 'phone, barber_id, service_id, and starts_at are required' });
  }

  try {
    const { appointment, customer } = await createAppointment({ phone, name, barberId, serviceId, startsAt });
    await logAudit({
      userId: req.session.user.id,
      action: 'create',
      entity: 'appointment',
      entityId: appointment.id,
      detail: { barberId, startsAt },
    });
    res.status(201).json({ appointment, customer });
  } catch (err) {
    handleAppointmentError(err, res);
  }
}));

router.post('/:id/arrive', asyncHandler(async (req, res) => {
  try {
    const { appointment, entry } = await markArrived(req.params.id);
    await logAudit({
      userId: req.session.user.id,
      action: 'arrive',
      entity: 'appointment',
      entityId: appointment.id,
      detail: { queueEntryId: entry.id },
    });
    res.json({ appointment, entry });
  } catch (err) {
    handleAppointmentError(err, res);
  }
}));

router.post('/:id/no-show', asyncHandler(async (req, res) => {
  try {
    const appointment = await markNoShow(req.params.id);
    await logAudit({ userId: req.session.user.id, action: 'no_show', entity: 'appointment', entityId: appointment.id });
    res.json({ appointment });
  } catch (err) {
    handleAppointmentError(err, res);
  }
}));

router.post('/:id/cancel', asyncHandler(async (req, res) => {
  try {
    const appointment = await cancelAppointment(req.params.id, req.body?.reason);
    await logAudit({ userId: req.session.user.id, action: 'cancel', entity: 'appointment', entityId: appointment.id });
    res.json({ appointment });
  } catch (err) {
    handleAppointmentError(err, res);
  }
}));

router.patch('/:id/move', requireRole('owner'), asyncHandler(async (req, res) => {
  const { barber_id: newBarberId } = req.body || {};
  if (!newBarberId) {
    return res.status(400).json({ error: 'barber_id is required' });
  }
  try {
    const appointment = await moveAppointmentToBarber(req.params.id, newBarberId);
    await logAudit({
      userId: req.session.user.id,
      action: 'move',
      entity: 'appointment',
      entityId: appointment.id,
      detail: { newBarberId },
    });
    res.json({ appointment });
  } catch (err) {
    handleAppointmentError(err, res);
  }
}));

export default router;
