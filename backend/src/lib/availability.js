import { pool } from '../db/pool.js';
import { resolveAttendance } from './attendance.js';

async function getLockMinutes() {
  const { rows } = await pool.query(`select appointment_lock_minutes from shop_settings limit 1`);
  return rows[0]?.appointment_lock_minutes ?? 15;
}

/**
 * The soonest booked appointment for this barber/day that has entered its
 * lock window (appointment_lock_minutes before starts_at) and hasn't been
 * resolved yet. The lock persists past starts_at too — a barber running a
 * late appointment is still locked until it's arrived/done/cancelled/no_show.
 */
async function getBlockingAppointment(barberId, businessDateStr, now, lockMinutes) {
  const { rows } = await pool.query(
    `select * from appointments
     where barber_id = $1 and business_date = $2 and status = 'booked'
     order by starts_at asc`,
    [barberId, businessDateStr]
  );
  const lockMs = lockMinutes * 60 * 1000;
  for (const appt of rows) {
    if (now.getTime() >= new Date(appt.starts_at).getTime() - lockMs) {
      return appt;
    }
  }
  return null;
}

async function getNextAppointmentWithinHour(barberId, businessDateStr, now) {
  const { rows } = await pool.query(
    `select * from appointments
     where barber_id = $1 and business_date = $2 and status = 'booked'
     order by starts_at asc`,
    [barberId, businessDateStr]
  );
  const hourMs = 60 * 60 * 1000;
  for (const appt of rows) {
    const startsAtMs = new Date(appt.starts_at).getTime();
    if (startsAtMs >= now.getTime() && startsAtMs <= now.getTime() + hourMs) {
      return appt;
    }
  }
  return null;
}

/**
 * The single combined answer to "can this barber take a walk-in right
 * now" — folds together attendance, break, and the appointment lock so
 * every caller (queue engine, roster, tablet indicators) reads the same
 * decision instead of re-deriving it.
 */
export async function getBarberAvailability(barberId, businessDateStr, now = new Date()) {
  const attendance = await resolveAttendance(barberId, businessDateStr);
  const isOnBreak = Boolean(
    attendance.status === 'present' && attendance.onBreakUntil && new Date(attendance.onBreakUntil) > now
  );

  let lockedAppointment = null;
  let nextAppointmentAt = null;
  if (attendance.status === 'present' && !isOnBreak) {
    const lockMinutes = await getLockMinutes();
    lockedAppointment = await getBlockingAppointment(barberId, businessDateStr, now, lockMinutes);
    const nextAppt = await getNextAppointmentWithinHour(barberId, businessDateStr, now);
    nextAppointmentAt = nextAppt?.starts_at ?? null;
  }

  const availableForWalkIns = attendance.status === 'present' && !isOnBreak && !lockedAppointment;

  return {
    attendanceStatus: attendance.status,
    onBreakUntil: isOnBreak ? attendance.onBreakUntil : null,
    lockedAppointment,
    nextAppointmentAt,
    availableForWalkIns,
  };
}
