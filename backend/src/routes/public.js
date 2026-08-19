import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { pool } from '../db/pool.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { businessDate } from '../lib/businessDate.js';
import { getWaitEstimates } from '../lib/queue.js';
import { resolveAttendance } from '../lib/attendance.js';
import {
  joinQueuePublicly,
  getPublicQueueEntry,
  cancelPublicQueueEntry,
  PublicQrError,
  PublicJoinError,
  PublicNotFoundError,
  PublicDisabledError,
} from '../lib/publicQueue.js';
import {
  getPublicSlots,
  bookPublicly,
  getPublicAppointment,
  cancelPublicAppointment,
  PublicBookingDisabledError,
  PublicBookingError,
} from '../lib/publicAppointments.js';
import { AppointmentConflictError, AppointmentValidationError } from '../lib/appointments.js';

const router = Router();

// Every route here is unauthenticated by design — reachable from the open
// internet. Never return a customer's name, visit history, or style card.
// Never let a response differ based on whether a phone number is already
// known versus brand new: both paths do the same shape of work and return
// the same shape of body. Status lookups are always by public_token, never
// by phone.

function keyByPhoneOrIp(req) {
  return (req.body && req.body.phone) || req.ip;
}

const joinIpLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts from this network. Please try again later.' },
});
const joinPhoneLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyByPhoneOrIp,
  message: { error: 'Too many attempts for this phone number. Please try again later.' },
});

const bookingIpLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts from this network. Please try again later.' },
});
const bookingPhoneLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  limit: 3,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyByPhoneOrIp,
  message: { error: 'Too many booking attempts for this phone number today. Please call the shop.' },
});

function handlePublicError(err, res) {
  if (err instanceof PublicQrError) return res.status(403).json({ error: err.message });
  if (err instanceof PublicDisabledError) return res.status(403).json({ error: err.message });
  if (err instanceof PublicBookingDisabledError) return res.status(403).json({ error: err.message });
  if (err instanceof PublicJoinError) return res.status(400).json({ error: err.message });
  if (err instanceof PublicBookingError) return res.status(400).json({ error: err.message });
  if (err instanceof PublicNotFoundError) return res.status(404).json({ error: err.message });
  if (err instanceof AppointmentConflictError) return res.status(409).json({ error: err.message });
  if (err instanceof AppointmentValidationError) return res.status(400).json({ error: err.message });
  throw err;
}

router.get('/shop', asyncHandler(async (req, res) => {
  const { rows: settingsRows } = await pool.query(`select * from shop_settings limit 1`);
  const settings = settingsRows[0];
  const { rows: services } = await pool.query(
    `select id, name, duration_minutes, price from services where active = true order by sort_order, created_at`
  );

  let barbers = [];
  let sharedWaitMinutes = null;
  if (settings.self_join_enabled) {
    const waits = await getWaitEstimates();
    barbers = waits.barbers
      .filter((b) => b.availableForWalkIns)
      .map((b) => ({ barberId: b.barberId, displayName: b.displayName, waitMinutes: b.waitMinutes }));
    sharedWaitMinutes = waits.sharedWaitMinutes;
  }

  res.json({
    shopName: settings.shop_name,
    openingTime: settings.opening_time,
    closingTime: settings.closing_time,
    weeklyOffDay: settings.weekly_off_day,
    services: services.map((s) => ({ id: s.id, name: s.name, durationMinutes: s.duration_minutes, price: s.price })),
    barbers,
    sharedWaitMinutes,
    selfJoinEnabled: settings.self_join_enabled,
    publicBookingEnabled: settings.public_booking_enabled,
  });
}));

// Barbers present on a given date — for the booking barber picker, scoped
// to that date rather than today (today's roster is a different question).
router.get('/barbers', asyncHandler(async (req, res) => {
  const date = req.query.date || businessDate();
  const { rows: allBarbers } = await pool.query(
    `select id, display_name from barbers where active = true order by sort_order, created_at`
  );
  const resolved = await Promise.all(allBarbers.map((b) => resolveAttendance(b.id, date)));
  const barbers = allBarbers
    .filter((b, i) => resolved[i].status === 'present')
    .map((b) => ({ id: b.id, displayName: b.display_name }));
  res.json({ date, barbers });
}));

router.post('/queue', joinIpLimiter, joinPhoneLimiter, asyncHandler(async (req, res) => {
  const { t: qrToken, phone, name, service_id: serviceId, barber_id: barberId, consent_messages: consentMessages } = req.body || {};
  if (!phone || !serviceId) {
    return res.status(400).json({ error: 'phone and service_id are required' });
  }
  try {
    const entry = await joinQueuePublicly({
      qrToken,
      phone,
      name,
      serviceId,
      barberId: barberId || null,
      consentMessages: Boolean(consentMessages),
    });
    res.status(201).json(entry);
  } catch (err) {
    handlePublicError(err, res);
  }
}));

router.get('/queue/:publicToken', asyncHandler(async (req, res) => {
  try {
    const entry = await getPublicQueueEntry(req.params.publicToken);
    res.json(entry);
  } catch (err) {
    handlePublicError(err, res);
  }
}));

router.delete('/queue/:publicToken', asyncHandler(async (req, res) => {
  try {
    const result = await cancelPublicQueueEntry(req.params.publicToken);
    res.json(result);
  } catch (err) {
    handlePublicError(err, res);
  }
}));

router.get('/slots', asyncHandler(async (req, res) => {
  const { barber_id: barberId, date, service_id: serviceId } = req.query;
  if (!barberId || !date || !serviceId) {
    return res.status(400).json({ error: 'barber_id, date, and service_id are required' });
  }
  try {
    const slots = await getPublicSlots({ barberId, date, serviceId });
    res.json({ slots });
  } catch (err) {
    handlePublicError(err, res);
  }
}));

router.post('/appointments', bookingIpLimiter, bookingPhoneLimiter, asyncHandler(async (req, res) => {
  const {
    phone,
    name,
    service_id: serviceId,
    barber_id: barberId,
    starts_at: startsAt,
    consent_messages: consentMessages,
  } = req.body || {};
  if (!phone || !serviceId || !barberId || !startsAt) {
    return res.status(400).json({ error: 'phone, service_id, barber_id, and starts_at are required' });
  }
  try {
    const appointment = await bookPublicly({
      phone,
      name,
      barberId,
      serviceId,
      startsAt,
      consentMessages: Boolean(consentMessages),
    });
    res.status(201).json(appointment);
  } catch (err) {
    handlePublicError(err, res);
  }
}));

router.get('/appointments/:publicToken', asyncHandler(async (req, res) => {
  try {
    const appointment = await getPublicAppointment(req.params.publicToken);
    res.json(appointment);
  } catch (err) {
    handlePublicError(err, res);
  }
}));

router.delete('/appointments/:publicToken', asyncHandler(async (req, res) => {
  try {
    const result = await cancelPublicAppointment(req.params.publicToken);
    res.json(result);
  } catch (err) {
    handlePublicError(err, res);
  }
}));

export default router;
