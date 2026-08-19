import { Router } from 'express';
import { requireRole } from '../middleware/auth.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { logAudit } from '../lib/audit.js';
import { businessDate } from '../lib/businessDate.js';
import {
  getAttendanceForDate,
  markAttendance,
  markLeave,
  markBreak,
  getBarberIdForUser,
  getMonthlyAttendanceSummary,
} from '../lib/attendance.js';

const router = Router();

router.use(requireRole('owner', 'barber'));

router.get('/', asyncHandler(async (req, res) => {
  const date = req.query.date || businessDate();
  const attendance = await getAttendanceForDate(date);
  res.json({ date, attendance });
}));

// A barber may mark only himself present/absent. The owner may mark anyone.
router.post('/', asyncHandler(async (req, res) => {
  const { barber_id: barberId, status } = req.body || {};
  if (!barberId || !['present', 'absent'].includes(status)) {
    return res.status(400).json({ error: 'barber_id and status (present|absent) are required' });
  }

  if (req.session.user.role === 'barber') {
    const ownBarberId = await getBarberIdForUser(req.session.user.id);
    if (ownBarberId !== barberId) {
      await logAudit({
        userId: req.session.user.id,
        action: 'role_restricted_rejection',
        entity: 'barber_attendance',
        detail: { attemptedBarberId: barberId },
      });
      return res.status(403).json({ error: 'A barber may only mark his own attendance' });
    }
  }

  const dateStr = businessDate();
  const { attendance, flaggedAppointments } = await markAttendance({
    barberId,
    businessDate: dateStr,
    status,
    markedBy: req.session.user.id,
  });

  await logAudit({
    userId: req.session.user.id,
    action: 'mark_attendance',
    entity: 'barber_attendance',
    entityId: attendance.id,
    detail: { barberId, status, flaggedCount: flaggedAppointments.length },
  });

  res.json({ attendance, flaggedAppointments });
}));

router.post('/leave', requireRole('owner'), asyncHandler(async (req, res) => {
  const { barber_id: barberId, start_date: startDate, end_date: endDate } = req.body || {};
  if (!barberId || !startDate || !endDate) {
    return res.status(400).json({ error: 'barber_id, start_date, and end_date are required' });
  }

  const { dates, flaggedAppointments } = await markLeave({
    barberId,
    startDate,
    endDate,
    markedBy: req.session.user.id,
  });

  await logAudit({
    userId: req.session.user.id,
    action: 'mark_leave',
    entity: 'barber_attendance',
    detail: { barberId, startDate, endDate, flaggedCount: flaggedAppointments.length },
  });

  res.json({ dates, flaggedAppointments });
}));

// A barber may mark only his own break. The owner may mark anyone's.
router.post('/break', asyncHandler(async (req, res) => {
  const { barber_id: barberId, on_break_until: onBreakUntil } = req.body || {};
  if (!barberId) {
    return res.status(400).json({ error: 'barber_id is required' });
  }

  if (req.session.user.role === 'barber') {
    const ownBarberId = await getBarberIdForUser(req.session.user.id);
    if (ownBarberId !== barberId) {
      await logAudit({
        userId: req.session.user.id,
        action: 'role_restricted_rejection',
        entity: 'barber_attendance',
        detail: { attemptedBarberId: barberId },
      });
      return res.status(403).json({ error: 'A barber may only mark his own break' });
    }
  }

  const attendance = await markBreak({ barberId, onBreakUntil: onBreakUntil || null, markedBy: req.session.user.id });

  await logAudit({
    userId: req.session.user.id,
    action: 'mark_break',
    entity: 'barber_attendance',
    entityId: attendance.id,
    detail: { barberId, onBreakUntil },
  });

  res.json({ attendance });
}));

// Scheduling information only — not payroll. Owner-only, matches the
// "Owner attendance and leave" screen (section 4.3).
router.get('/summary', requireRole('owner'), asyncHandler(async (req, res) => {
  const month = req.query.month || businessDate().slice(0, 7);
  const summary = await getMonthlyAttendanceSummary(month);
  res.json({ month, summary });
}));

export default router;
