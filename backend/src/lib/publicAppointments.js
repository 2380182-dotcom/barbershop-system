import crypto from 'node:crypto';
import { pool } from '../db/pool.js';
import { findCustomerByPhone } from './customers.js';
import {
  createAppointment,
  getBookableSlots,
  cancelAppointment,
  AppointmentValidationError,
  AppointmentConflictError,
} from './appointments.js';

export class PublicBookingDisabledError extends Error {}
export class PublicBookingError extends Error {}
export class PublicNotFoundError extends Error {}

const GENERIC_BOOKING_FAILURE = 'Unable to book right now — please call the shop.';

async function getShopSettings() {
  const { rows } = await pool.query(`select * from shop_settings limit 1`);
  return rows[0];
}

function shapePublicAppointment(row) {
  return {
    publicToken: row.public_token,
    barberName: row.barber_name,
    serviceName: row.service_name,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    status: row.status,
  };
}

async function fetchByToken(publicToken) {
  const { rows } = await pool.query(
    `select a.*, b.display_name as barber_name, s.name as service_name
     from appointments a
     join barbers b on b.id = a.barber_id
     join services s on s.id = a.service_id
     where a.public_token = $1`,
    [publicToken]
  );
  return rows[0] || null;
}

export async function getPublicSlots({ barberId, date, serviceId }) {
  const settings = await getShopSettings();
  if (!settings.public_booking_enabled) {
    throw new PublicBookingDisabledError('Online booking is currently turned off.');
  }
  try {
    return await getBookableSlots({ barberId, date, serviceId });
  } catch (err) {
    if (err instanceof AppointmentValidationError) {
      throw new PublicBookingError(err.message);
    }
    throw err;
  }
}

export async function bookPublicly({ phone, name, barberId, serviceId, startsAt, consentMessages }) {
  const settings = await getShopSettings();
  if (!settings.public_booking_enabled) {
    throw new PublicBookingDisabledError('Online booking is currently turned off.');
  }

  const customer = await findCustomerByPhone(phone);
  if (customer?.blocked) {
    throw new PublicBookingError(GENERIC_BOOKING_FAILURE);
  }

  if (consentMessages) {
    await pool.query(
      `insert into customers (phone, consent_messages, consent_messages_at)
       values ($1, true, now())
       on conflict (phone) do update set
         consent_messages = true,
         consent_messages_at = case when customers.consent_messages then customers.consent_messages_at else now() end`,
      [phone]
    );
  }

  let appointment;
  try {
    const result = await createAppointment({ phone, name, barberId, serviceId, startsAt });
    appointment = result.appointment;
  } catch (err) {
    if (err instanceof AppointmentValidationError) {
      throw new PublicBookingError(err.message);
    }
    if (err instanceof AppointmentConflictError) {
      throw err;
    }
    throw err;
  }

  const publicToken = crypto.randomUUID();
  await pool.query(`update appointments set public_token = $2 where id = $1`, [appointment.id, publicToken]);
  const full = await fetchByToken(publicToken);
  return shapePublicAppointment(full);
}

export async function getPublicAppointment(publicToken) {
  const row = await fetchByToken(publicToken);
  if (!row) {
    throw new PublicNotFoundError('Not found');
  }
  return shapePublicAppointment(row);
}

export async function cancelPublicAppointment(publicToken) {
  const row = await fetchByToken(publicToken);
  if (!row) {
    throw new PublicNotFoundError('Not found');
  }
  const cancelled = await cancelAppointment(row.id, 'Cancelled by customer');
  return { publicToken, status: cancelled.status };
}
