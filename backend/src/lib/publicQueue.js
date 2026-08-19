import crypto from 'node:crypto';
import { pool } from '../db/pool.js';
import { businessDate } from './businessDate.js';
import { findCustomerByPhone } from './customers.js';
import { addToQueue, QueueBarberUnavailableError } from './queue.js';
import { isValidQrToken } from './qrTokens.js';

export class PublicQrError extends Error {}
export class PublicJoinError extends Error {}
export class PublicNotFoundError extends Error {}
export class PublicDisabledError extends Error {}

const GENERIC_JOIN_FAILURE = 'Unable to join right now — please see the counter.';

async function getShopSettings() {
  const { rows } = await pool.query(`select * from shop_settings limit 1`);
  return rows[0];
}

/**
 * Position and wait for one specific entry — how many people (and how much
 * service time) are genuinely ahead of him right now, not the generic
 * "if someone joined this instant" number getWaitEstimates() gives.
 */
async function computePositionAndWait(entry) {
  if (entry.status === 'serving') {
    return { position: 0, estimatedWaitMinutes: 0 };
  }
  if (entry.status !== 'waiting') {
    return { position: null, estimatedWaitMinutes: null };
  }

  const lineFilter = entry.barber_id ? 'qe.barber_id = $3' : 'qe.barber_id is null';
  const params = entry.barber_id
    ? [entry.business_date, entry.sort_key, entry.barber_id]
    : [entry.business_date, entry.sort_key];

  const { rows } = await pool.query(
    `select count(*)::int as ahead_count, coalesce(sum(s.duration_minutes), 0)::int as minutes_ahead
     from queue_entries qe
     join services s on s.id = qe.service_id
     where qe.business_date = $1 and qe.status = 'waiting' and qe.sort_key < $2 and ${lineFilter}`,
    params
  );

  let remaining = 0;
  if (entry.barber_id) {
    const { rows: servingRows } = await pool.query(
      `select s.duration_minutes, qe.called_at from queue_entries qe
       join services s on s.id = qe.service_id
       where qe.barber_id = $1 and qe.status = 'serving'`,
      [entry.barber_id]
    );
    if (servingRows[0]) {
      const elapsed = (Date.now() - new Date(servingRows[0].called_at).getTime()) / 60000;
      remaining = Math.max(0, servingRows[0].duration_minutes - elapsed);
    }
  }

  const position = rows[0].ahead_count + 1;
  const estimatedWaitMinutes = Math.round((rows[0].minutes_ahead + remaining) / 5) * 5;
  return { position, estimatedWaitMinutes };
}

async function shapePublicEntry(entry) {
  const { position, estimatedWaitMinutes } = await computePositionAndWait(entry);
  return {
    publicToken: entry.public_token,
    tokenNumber: entry.token_number,
    status: entry.status,
    position,
    estimatedWaitMinutes,
  };
}

export async function joinQueuePublicly({ qrToken, phone, name, serviceId, barberId, consentMessages }) {
  const settings = await getShopSettings();
  if (!settings.self_join_enabled) {
    throw new PublicDisabledError('Self check-in is currently turned off.');
  }
  if (!(await isValidQrToken(qrToken))) {
    throw new PublicQrError('This code has expired. Please scan the current QR code on the shop screen.');
  }

  const date = businessDate();
  const customer = await findCustomerByPhone(phone);

  if (customer) {
    const { rows: activeRows } = await pool.query(
      `select * from queue_entries where customer_id = $1 and business_date = $2 and status in ('waiting', 'serving') limit 1`,
      [customer.id, date]
    );
    if (activeRows[0]) {
      return shapePublicEntry(activeRows[0]);
    }
    if (customer.blocked) {
      throw new PublicJoinError(GENERIC_JOIN_FAILURE);
    }
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

  let entry;
  try {
    const result = await addToQueue({ phone, name, serviceId, barberId, source: 'qr' });
    entry = result.entry;
  } catch (err) {
    if (err instanceof QueueBarberUnavailableError) {
      throw new PublicJoinError(err.message);
    }
    throw err;
  }

  const publicToken = crypto.randomUUID();
  const { rows } = await pool.query(
    `update queue_entries set public_token = $2 where id = $1 returning *`,
    [entry.id, publicToken]
  );
  return shapePublicEntry(rows[0]);
}

export async function getPublicQueueEntry(publicToken) {
  const { rows } = await pool.query(`select * from queue_entries where public_token = $1`, [publicToken]);
  if (!rows[0]) {
    throw new PublicNotFoundError('Not found');
  }
  return shapePublicEntry(rows[0]);
}

export async function cancelPublicQueueEntry(publicToken) {
  const { rows } = await pool.query(
    `update queue_entries set status = 'cancelled'
     where public_token = $1 and status in ('waiting', 'serving') returning *`,
    [publicToken]
  );
  if (!rows[0]) {
    throw new PublicNotFoundError('Not found, or already finished');
  }
  return { publicToken, status: rows[0].status };
}
