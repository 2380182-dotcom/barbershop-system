import { pool } from '../db/pool.js';
import { businessDate, timeOfDay, instantAt } from './businessDate.js';
import { resolveAttendance, weekdayOf } from './attendance.js';
import { findOrCreateCustomerByPhone } from './customers.js';
import { insertArrivalAtFrontOfLine } from './queue.js';

export class AppointmentValidationError extends Error {}
export class AppointmentConflictError extends Error {}
export class AppointmentNotFoundError extends Error {}

const UNIQUE_VIOLATION = '23505';
const SLOT_STEP_MINUTES = 15;

async function getShopSettings() {
  const { rows } = await pool.query(`select * from shop_settings limit 1`);
  return rows[0];
}

async function getService(id) {
  const { rows } = await pool.query(`select * from services where id = $1`, [id]);
  return rows[0];
}

async function getBarber(id) {
  const { rows } = await pool.query(`select * from barbers where id = $1`, [id]);
  return rows[0];
}

function isClosedThatDay(settings, dateStr) {
  return settings.weekly_off_day !== null && settings.weekly_off_day === weekdayOf(dateStr);
}

function isWithinBusinessHours(startsAt, endsAt, settings) {
  const opening = settings.opening_time.slice(0, 5);
  const closing = settings.closing_time.slice(0, 5);
  return timeOfDay(startsAt) >= opening && timeOfDay(endsAt) <= closing;
}

async function findOverlap(barberId, startsAt, endsAt, excludeAppointmentId = null) {
  const { rows } = await pool.query(
    `select id from appointments
     where barber_id = $1 and status in ('booked', 'arrived')
       and starts_at < $2 and ends_at > $3
       and ($4::uuid is null or id != $4)`,
    [barberId, endsAt.toISOString(), startsAt.toISOString(), excludeAppointmentId]
  );
  return rows.length > 0;
}

async function queueMessage(customerId, templateName, bodyPreview) {
  await pool.query(
    `insert into messages (customer_id, template_name, body_preview, status) values ($1, $2, $3, 'queued')`,
    [customerId, templateName, bodyPreview]
  );
}

/**
 * Booking validation, in the order the brief specifies: barber availability,
 * business hours, weekly off day, then overlap — the unique index catches
 * exact-time collisions, but a 45-minute cut starting at 10:00 also has to
 * block one starting at 10:30, which the index alone can't see.
 */
export async function createAppointment({ phone, name, barberId, serviceId, startsAt }) {
  const startsAtDate = new Date(startsAt);
  if (Number.isNaN(startsAtDate.getTime())) {
    throw new AppointmentValidationError('Invalid starts_at');
  }

  const [service, barber] = await Promise.all([getService(serviceId), getBarber(barberId)]);
  if (!service) throw new AppointmentValidationError('Service not found');
  if (!barber) throw new AppointmentValidationError('Barber not found');

  const dateStr = businessDate(startsAtDate);
  const endsAtDate = new Date(startsAtDate.getTime() + service.duration_minutes * 60000);
  const settings = await getShopSettings();

  const attendance = await resolveAttendance(barberId, dateStr);
  if (attendance.status !== 'present') {
    throw new AppointmentValidationError(`${barber.display_name} is not available on that day`);
  }
  if (!isWithinBusinessHours(startsAtDate, endsAtDate, settings)) {
    throw new AppointmentValidationError('That time is outside shop hours');
  }
  if (isClosedThatDay(settings, dateStr)) {
    throw new AppointmentValidationError('The shop is closed that day');
  }
  if (await findOverlap(barberId, startsAtDate, endsAtDate)) {
    throw new AppointmentConflictError('That time overlaps an existing appointment');
  }

  const customer = await findOrCreateCustomerByPhone(phone, name);

  let appointment;
  try {
    const { rows } = await pool.query(
      `insert into appointments (customer_id, barber_id, service_id, business_date, starts_at, ends_at)
       values ($1, $2, $3, $4, $5, $6) returning *`,
      [customer.id, barberId, serviceId, dateStr, startsAtDate.toISOString(), endsAtDate.toISOString()]
    );
    appointment = rows[0];
  } catch (err) {
    if (err.code === UNIQUE_VIOLATION) {
      throw new AppointmentConflictError('That time overlaps an existing appointment');
    }
    throw err;
  }

  await queueMessage(
    customer.id,
    'appointment_confirmed',
    `Appointment with ${barber.display_name} at ${timeOfDay(startsAtDate)} on ${dateStr}`
  );

  return { appointment, customer };
}

/**
 * Bookable start times for a barber/day/service: opening to closing,
 * stepped every 15 minutes, minus anything overlapping an existing
 * appointment, minus anything already in the past. This is the endpoint
 * the Phase 6 public booking page reuses, so it has to be self-contained —
 * no assumptions about who's calling it.
 */
export async function getBookableSlots({ barberId, date, serviceId }) {
  const [service, settings] = await Promise.all([getService(serviceId), getShopSettings()]);
  if (!service) throw new AppointmentValidationError('Service not found');
  if (isClosedThatDay(settings, date)) return [];

  const attendance = await resolveAttendance(barberId, date);
  if (attendance.status !== 'present') return [];

  const { rows: existing } = await pool.query(
    `select starts_at, ends_at from appointments
     where barber_id = $1 and business_date = $2 and status in ('booked', 'arrived')`,
    [barberId, date]
  );

  const [oh, om] = settings.opening_time.slice(0, 5).split(':').map(Number);
  const [ch, cm] = settings.closing_time.slice(0, 5).split(':').map(Number);
  const openMinutes = oh * 60 + om;
  const closeMinutes = ch * 60 + cm;
  const now = new Date();

  const slots = [];
  for (let m = openMinutes; m + service.duration_minutes <= closeMinutes; m += SLOT_STEP_MINUTES) {
    const hh = String(Math.floor(m / 60)).padStart(2, '0');
    const mm = String(m % 60).padStart(2, '0');
    const slotStart = instantAt(date, `${hh}:${mm}`);
    const slotEnd = new Date(slotStart.getTime() + service.duration_minutes * 60000);

    if (slotStart.getTime() < now.getTime()) continue;
    const overlaps = existing.some(
      (a) => new Date(a.starts_at) < slotEnd && new Date(a.ends_at) > slotStart
    );
    if (overlaps) continue;

    slots.push(slotStart.toISOString());
  }
  return slots;
}

export async function getAppointmentsForDate(date) {
  const { rows } = await pool.query(
    `select a.*, c.name as customer_name, c.phone as customer_phone,
            b.display_name as barber_name, s.name as service_name
     from appointments a
     join customers c on c.id = a.customer_id
     join barbers b on b.id = a.barber_id
     join services s on s.id = a.service_id
     where a.business_date = $1
     order by a.starts_at asc`,
    [date]
  );
  return rows;
}

export async function getNeedsRescheduleAppointments() {
  const { rows } = await pool.query(
    `select a.*, c.name as customer_name, c.phone as customer_phone,
            b.display_name as barber_name, s.name as service_name
     from appointments a
     join customers c on c.id = a.customer_id
     join barbers b on b.id = a.barber_id
     join services s on s.id = a.service_id
     where a.status = 'needs_reschedule'
     order by a.starts_at asc`
  );
  return rows;
}

/**
 * An appointment holder goes to the front of the barber's line, not the
 * back — the whole point of booking ahead. If the queue insert fails
 * after the status flip, roll the appointment back to booked rather than
 * leaving it "arrived" with no queue entry to show for it.
 */
export async function markArrived(appointmentId) {
  const { rows } = await pool.query(
    `update appointments set status = 'arrived' where id = $1 and status = 'booked' returning *`,
    [appointmentId]
  );
  const appointment = rows[0];
  if (!appointment) {
    throw new AppointmentConflictError('Appointment is not in booked status');
  }

  try {
    const entry = await insertArrivalAtFrontOfLine({
      customerId: appointment.customer_id,
      barberId: appointment.barber_id,
      serviceId: appointment.service_id,
      date: appointment.business_date,
    });
    return { appointment, entry };
  } catch (err) {
    await pool.query(`update appointments set status = 'booked' where id = $1`, [appointmentId]);
    throw err;
  }
}

export async function markNoShow(appointmentId) {
  const { rows } = await pool.query(
    `update appointments set status = 'no_show' where id = $1 and status in ('booked', 'arrived') returning *`,
    [appointmentId]
  );
  if (!rows[0]) {
    throw new AppointmentConflictError('Cannot mark no-show from the current status');
  }
  return rows[0];
}

export async function cancelAppointment(appointmentId, reason) {
  const { rows } = await pool.query(
    `update appointments set status = 'cancelled', status_note = $2
     where id = $1 and status in ('booked', 'arrived', 'needs_reschedule') returning *`,
    [appointmentId, reason || null]
  );
  const appointment = rows[0];
  if (!appointment) {
    throw new AppointmentConflictError('Cannot cancel from the current status');
  }
  await queueMessage(appointment.customer_id, 'appointment_cancelled', reason || null);
  return appointment;
}

/** Owner-only reschedule handling: move a flagged appointment to a barber who's free at that time. */
export async function moveAppointmentToBarber(appointmentId, newBarberId) {
  const { rows: apptRows } = await pool.query(`select * from appointments where id = $1`, [appointmentId]);
  const appointment = apptRows[0];
  if (!appointment) {
    throw new AppointmentNotFoundError('Appointment not found');
  }
  if (appointment.status !== 'needs_reschedule') {
    throw new AppointmentConflictError('Only a needs_reschedule appointment can be moved');
  }

  const attendance = await resolveAttendance(newBarberId, appointment.business_date);
  if (attendance.status !== 'present') {
    throw new AppointmentValidationError('That barber is not available that day');
  }
  if (await findOverlap(newBarberId, new Date(appointment.starts_at), new Date(appointment.ends_at), appointmentId)) {
    throw new AppointmentConflictError('That barber is not free at that time');
  }

  let updated;
  try {
    const { rows } = await pool.query(
      `update appointments set barber_id = $2, status = 'booked', status_note = null where id = $1 returning *`,
      [appointmentId, newBarberId]
    );
    updated = rows[0];
  } catch (err) {
    if (err.code === UNIQUE_VIOLATION) {
      throw new AppointmentConflictError('That barber is not free at that time');
    }
    throw err;
  }

  await queueMessage(appointment.customer_id, 'appointment_moved', null);
  return updated;
}
