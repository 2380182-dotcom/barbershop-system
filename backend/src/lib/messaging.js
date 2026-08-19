import { pool } from '../db/pool.js';
import { businessDate, timeOfDay, instantAt, addDays } from './businessDate.js';
import { getProvider } from './providers/index.js';

// Everything else is marketing. Transactional templates skip quiet hours,
// the daily cap, and the opt-out gate — a customer whose appointment just
// changed needs to know regardless.
const TRANSACTIONAL_TEMPLATES = new Set(['appointment_confirmed', 'appointment_moved', 'appointment_cancelled']);

function isMarketing(templateName) {
  return !TRANSACTIONAL_TEMPLATES.has(templateName);
}

function toMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function isWithinQuietHours(now, settings) {
  const start = toMinutes(settings.quiet_hours_start.slice(0, 5));
  const end = toMinutes(settings.quiet_hours_end.slice(0, 5));
  if (start === end) return false;
  const cur = toMinutes(timeOfDay(now));
  return start < end ? cur >= start && cur < end : cur >= start || cur < end;
}

/** The instant quiet hours next lift — handles the midnight-wrapping window. */
function nextOpeningInstant(now, settings) {
  const start = toMinutes(settings.quiet_hours_start.slice(0, 5));
  const end = settings.quiet_hours_end.slice(0, 5);
  const endMinutes = toMinutes(end);
  const today = businessDate(now);

  if (start < endMinutes) {
    return instantAt(today, end);
  }
  const curMinutes = toMinutes(timeOfDay(now));
  return curMinutes >= start ? instantAt(addDays(today, 1), end) : instantAt(today, end);
}

async function getShopSettings(client = pool) {
  const { rows } = await client.query(`select * from shop_settings limit 1`);
  return rows[0];
}

async function countMarketingSentToday(now, client = pool) {
  const today = businessDate(now);
  const start = instantAt(today, '00:00');
  const end = instantAt(addDays(today, 1), '00:00');
  const { rows } = await client.query(
    `select count(*) from messages
     where status = 'sent' and sent_at >= $1 and sent_at < $2
       and template_name not in ('appointment_confirmed', 'appointment_moved', 'appointment_cancelled')`,
    [start.toISOString(), end.toISOString()]
  );
  return parseInt(rows[0].count, 10);
}

/**
 * The single gate-check function. Called both when the reminder engine
 * considers whether to queue a reminder at all, and — separately, and just
 * as fully — by the sender right before every send, because a customer can
 * opt out, get blocked, or the clock can cross into quiet hours in between.
 */
export async function checkGates(message, customer, settings, now) {
  if (customer.blocked) return { ok: false, reason: 'blocked' };
  if (!customer.consent_messages) return { ok: false, reason: 'no_consent' };

  const marketing = isMarketing(message.template_name);

  if (marketing && customer.opted_out_at) {
    return { ok: false, reason: 'opted_out' };
  }

  if (marketing) {
    if (isWithinQuietHours(now, settings)) {
      return { ok: false, reason: 'quiet_hours', rescheduleTo: nextOpeningInstant(now, settings) };
    }
    const sentToday = await countMarketingSentToday(now);
    if (sentToday >= settings.daily_message_cap) {
      return { ok: false, reason: 'daily_cap', rescheduleTo: instantAt(addDays(businessDate(now), 1), '00:00') };
    }
  }

  return { ok: true };
}

/** Opting out is immediate and cancels queued marketing messages with it, atomically. */
export async function optOutCustomer(phone) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `update customers set opted_out_at = now() where phone = $1 returning *`,
      [phone]
    );
    const customer = rows[0];
    if (!customer) {
      await client.query('ROLLBACK');
      return null;
    }

    await client.query(
      `update messages set status = 'cancelled', claimed_at = null
       where customer_id = $1 and status = 'queued'
         and template_name not in ('appointment_confirmed', 'appointment_moved', 'appointment_cancelled')`,
      [customer.id]
    );

    await client.query('COMMIT');
    return customer;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function processMessage(message, settings, provider, now) {
  const { rows: customerRows } = await pool.query(`select * from customers where id = $1`, [message.customer_id]);
  const customer = customerRows[0];
  if (!customer) {
    await pool.query(
      `update messages set status = 'failed', last_error = 'customer not found', claimed_at = null where id = $1`,
      [message.id]
    );
    return { id: message.id, outcome: 'failed', reason: 'customer_not_found' };
  }

  const gate = await checkGates(message, customer, settings, now);
  if (!gate.ok) {
    if (gate.rescheduleTo) {
      await pool.query(
        `update messages set status = 'queued', claimed_at = null, scheduled_for = $2 where id = $1`,
        [message.id, gate.rescheduleTo.toISOString()]
      );
      return { id: message.id, outcome: 'rescheduled', reason: gate.reason, scheduledFor: gate.rescheduleTo };
    }
    await pool.query(`update messages set status = 'cancelled', claimed_at = null where id = $1`, [message.id]);
    return { id: message.id, outcome: 'cancelled', reason: gate.reason };
  }

  try {
    const result = await provider.sendMessage({
      to: customer.phone,
      templateName: message.template_name,
      params: { bodyPreview: message.body_preview },
    });
    const cost = result.cost ?? settings.cost_per_message;
    await pool.query(
      `update messages set status = 'sent', provider_id = $2, cost = $3, sent_at = $4::timestamptz, claimed_at = null
       where id = $1`,
      [message.id, result.providerId, cost, now.toISOString()]
    );
    return { id: message.id, outcome: 'sent' };
  } catch (err) {
    const attempts = message.attempts + 1;
    if (attempts >= 3) {
      await pool.query(
        `update messages set status = 'failed', attempts = $2, last_error = $3, claimed_at = null where id = $1`,
        [message.id, attempts, String(err.message || err)]
      );
      return { id: message.id, outcome: 'failed', attempts };
    }
    await pool.query(
      `update messages set status = 'queued', attempts = $2, last_error = $3, claimed_at = null where id = $1`,
      [message.id, attempts, String(err.message || err)]
    );
    return { id: message.id, outcome: 'retry', attempts };
  }
}

/**
 * One sender run: releases anything stuck in 'sending' for too long, claims
 * a batch with FOR UPDATE SKIP LOCKED (so two workers running at once never
 * grab the same row), then processes each claimed message through the gates
 * and the provider. Pass `provider` to override (used by tests); otherwise
 * it's chosen from shop_settings.messaging_mode.
 */
export async function runSenderOnce({ batchSize = 20, provider, now = new Date() } = {}) {
  const nowIso = now.toISOString();

  // Bound to the same `now` as everything else below, not SQL's own now() —
  // otherwise a caller overriding `now` (tests, or a scheduled_for that's
  // meant to be "in the future" relative to a simulated clock) would be
  // silently checked against the real wall clock instead.
  await pool.query(
    `update messages set status = 'queued', claimed_at = null
     where status = 'sending' and claimed_at < $1::timestamptz - interval '10 minutes'`,
    [nowIso]
  );

  const settings = await getShopSettings();
  const activeProvider = provider || getProvider(settings.messaging_mode);

  const client = await pool.connect();
  let claimed;
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `select * from messages
       where status = 'queued' and (scheduled_for is null or scheduled_for <= $1::timestamptz)
       order by created_at asc
       limit $2
       for update skip locked`,
      [nowIso, batchSize]
    );
    if (rows.length > 0) {
      await client.query(
        `update messages set status = 'sending', claimed_at = $2::timestamptz where id = any($1::uuid[])`,
        [rows.map((r) => r.id), nowIso]
      );
    }
    await client.query('COMMIT');
    claimed = rows;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  const results = [];
  for (const message of claimed) {
    results.push(await processMessage(message, settings, activeProvider, now));
  }
  return results;
}

export async function getCostPreview({ template, from, to }) {
  const settings = await getShopSettings();
  const conditions = [`status = 'queued'`];
  const params = [];

  if (template) {
    params.push(template);
    conditions.push(`template_name = $${params.length}`);
  }
  if (from) {
    params.push(instantAt(from, '00:00').toISOString());
    conditions.push(`created_at >= $${params.length}`);
  }
  if (to) {
    params.push(instantAt(addDays(to, 1), '00:00').toISOString());
    conditions.push(`created_at < $${params.length}`);
  }

  const { rows } = await pool.query(
    `select count(*) from messages where ${conditions.join(' and ')}`,
    params
  );
  const count = parseInt(rows[0].count, 10);
  return { count, costPerMessage: Number(settings.cost_per_message), estimatedCost: count * Number(settings.cost_per_message) };
}
