import { pool } from '../db/pool.js';
import { businessDate, daysBetween } from './businessDate.js';

const RECENT_VISIT_SKIP_DAYS = 7;

/**
 * For each customer, the visit that would drive a reminder is their most
 * recent visit that has a style card (a card-less visit tells us nothing
 * about grow-out time, so it can never trigger one). This is due today
 * when business_date + grow_out_days lands exactly on today.
 */
async function findCandidates(today) {
  const { rows } = await pool.query(
    `with latest_carded_visit as (
       select distinct on (v.customer_id)
         v.id as visit_id, v.customer_id, v.business_date, sc.grow_out_days
       from visits v
       join style_cards sc on sc.visit_id = v.id
       order by v.customer_id, v.created_at desc
     )
     select visit_id, customer_id, business_date, grow_out_days
     from latest_carded_visit
     where (business_date + (grow_out_days || ' days')::interval)::date = $1::date`,
    [today]
  );
  return rows;
}

async function hasUpcomingAppointment(customerId) {
  const { rows } = await pool.query(
    `select id from appointments where customer_id = $1 and status = 'booked' and starts_at > now() limit 1`,
    [customerId]
  );
  return rows.length > 0;
}

async function mostRecentVisitDate(customerId) {
  const { rows } = await pool.query(
    `select business_date from visits where customer_id = $1 order by created_at desc limit 1`,
    [customerId]
  );
  return rows[0]?.business_date ?? null;
}

/**
 * Runs once a day. Idempotent by construction: messages_one_reminder_per_visit
 * is a unique index on (visit_id) scoped to this template, in ANY status —
 * so even a crash mid-run, or running this twice, can never double-queue for
 * the same visit. A unique-violation here is expected and simply skipped.
 */
export async function runReminderJob(now = new Date()) {
  const today = businessDate(now);
  const candidates = await findCandidates(today);

  let queued = 0;
  let skipped = 0;

  for (const candidate of candidates) {
    const { rows: customerRows } = await pool.query(`select * from customers where id = $1`, [candidate.customer_id]);
    const customer = customerRows[0];
    if (!customer || customer.blocked || !customer.consent_messages || customer.opted_out_at) {
      skipped += 1;
      continue;
    }

    if (await hasUpcomingAppointment(candidate.customer_id)) {
      skipped += 1;
      continue;
    }

    const lastVisitDate = await mostRecentVisitDate(candidate.customer_id);
    if (lastVisitDate && daysBetween(lastVisitDate, today) < RECENT_VISIT_SKIP_DAYS) {
      skipped += 1;
      continue;
    }

    try {
      await pool.query(
        `insert into messages (customer_id, visit_id, template_name, body_preview, status)
         values ($1, $2, 'rebooking_reminder', $3, 'queued')`,
        [candidate.customer_id, candidate.visit_id, `It's been ${candidate.grow_out_days} days — time for your next cut?`]
      );
      queued += 1;
    } catch (err) {
      if (err.code === '23505') {
        // Already queued/sent for this visit — exactly what the unique
        // index exists to guarantee. Not an error, just a no-op.
        skipped += 1;
        continue;
      }
      throw err;
    }
  }

  return { date: today, candidateCount: candidates.length, queued, skipped };
}
