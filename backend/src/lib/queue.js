import { pool } from '../db/pool.js';
import { businessDate, timeOfDay } from './businessDate.js';
import { findOrCreateCustomerByPhone } from './customers.js';
import { getBarberAvailability } from './availability.js';

const TOKEN_INSERT_RETRIES = 3;
const UNIQUE_VIOLATION = '23505';

function round5(minutes) {
  return Math.round(minutes / 5) * 5;
}

/**
 * Minutes of service remaining for an entry currently being served.
 * Floored at 0 — a barber running over time never shows a negative wait.
 */
function remainingMinutes(durationMinutes, calledAt, now) {
  const elapsedMinutes = (now.getTime() - new Date(calledAt).getTime()) / 60000;
  return Math.max(0, durationMinutes - elapsedMinutes);
}

async function getShopSettings(client) {
  const { rows } = await client.query(`select * from shop_settings limit 1`);
  return rows[0];
}

async function getActiveBarbers(client) {
  const { rows } = await client.query(
    `select * from barbers where active = true order by sort_order, created_at`
  );
  return rows;
}

async function getTodayEntries(client, date) {
  const { rows } = await client.query(
    `select qe.*, s.duration_minutes, s.name as service_name,
            c.name as customer_name, c.phone as customer_phone
     from queue_entries qe
     join services s on s.id = qe.service_id
     join customers c on c.id = qe.customer_id
     where qe.business_date = $1
     order by qe.sort_key asc, qe.joined_at asc`,
    [date]
  );
  return rows;
}

/**
 * Wait estimates in minutes for each named barber's line and for the shared
 * line, per rule 3.3. Takes the already-fetched entries + barbers so callers
 * that need both the queue view and the waits don't hit the database twice.
 * availableBarberIds scopes the shared-line denominator to barbers who can
 * actually take a walk-in right now (present, not on break, not locked by
 * an appointment) — an absent barber shouldn't shrink everyone else's wait.
 */
function computeWaits(entries, barbers, now, availableBarberIds) {
  const servingEntries = entries.filter((e) => e.status === 'serving');
  const activeBarberCount = barbers.filter((b) => availableBarberIds.has(b.id)).length || 1;

  const barberWaits = {};
  for (const barber of barbers) {
    const waitingSum = entries
      .filter((e) => e.barber_id === barber.id && e.status === 'waiting')
      .reduce((sum, e) => sum + e.duration_minutes, 0);

    const serving = servingEntries.find((e) => e.barber_id === barber.id);
    const servingRemaining = serving
      ? remainingMinutes(serving.duration_minutes, serving.called_at, now)
      : 0;

    barberWaits[barber.id] = round5(waitingSum + servingRemaining);
  }

  const sharedWaitingSum = entries
    .filter((e) => e.barber_id === null && e.status === 'waiting')
    .reduce((sum, e) => sum + e.duration_minutes, 0);

  const avgServingRemaining =
    servingEntries.length > 0
      ? servingEntries.reduce((sum, e) => sum + remainingMinutes(e.duration_minutes, e.called_at, now), 0) /
        servingEntries.length
      : 0;

  const sharedWait = round5(sharedWaitingSum / activeBarberCount + avgServingRemaining);

  return { barberWaits, sharedWait };
}

/**
 * Allocates the next token number for the day and inserts the entry.
 * Two barbers pressing "add" at the same instant both compute the same
 * next token and race for the unique (business_date, token_number)
 * constraint; the loser retries.
 *
 * Each attempt is its own auto-committed statement against the pool
 * (not wrapped in an explicit transaction) — a unique-violation aborts
 * whatever transaction it runs in, and Postgres refuses any further
 * command on an aborted transaction, which would break the retry itself.
 */
async function insertQueueEntryWithRetry({ customerId, barberId, serviceId, date, source }) {
  for (let attempt = 0; attempt < TOKEN_INSERT_RETRIES; attempt++) {
    try {
      const { rows } = await pool.query(
        `insert into queue_entries
           (customer_id, barber_id, service_id, business_date, token_number, source, sort_key)
         select $1, $2, $3, $4,
                coalesce(max(token_number), 0) + 1,
                $5,
                extract(epoch from now())
         from queue_entries
         where business_date = $4
         returning *`,
        [customerId, barberId, serviceId, date, source]
      );
      return rows[0];
    } catch (err) {
      if (err.code === UNIQUE_VIOLATION && attempt < TOKEN_INSERT_RETRIES - 1) {
        continue;
      }
      throw err;
    }
  }
  throw new Error('Could not allocate a token number after retries');
}

/**
 * An arriving appointment holder still gets a normal token (for the wall
 * display and records) but skips to the front of that barber's line —
 * sort_key one below whatever is currently the lowest waiting entry there,
 * so he's served before any walk-in already in line.
 */
export async function insertArrivalAtFrontOfLine({ customerId, barberId, serviceId, date }) {
  for (let attempt = 0; attempt < TOKEN_INSERT_RETRIES; attempt++) {
    try {
      const { rows } = await pool.query(
        `insert into queue_entries
           (customer_id, barber_id, service_id, business_date, token_number, source, sort_key)
         select $1, $2, $3, $4,
                coalesce(max(qe.token_number), 0) + 1,
                'tablet',
                coalesce(
                  (select min(sort_key) from queue_entries
                   where business_date = $4 and barber_id = $2 and status = 'waiting'),
                  extract(epoch from now())
                ) - 1
         from queue_entries qe
         where qe.business_date = $4
         returning *`,
        [customerId, barberId, serviceId, date]
      );
      return rows[0];
    } catch (err) {
      if (err.code === UNIQUE_VIOLATION && attempt < TOKEN_INSERT_RETRIES - 1) {
        continue;
      }
      throw err;
    }
  }
  throw new Error('Could not allocate a token number after retries');
}

export class QueueConflictError extends Error {}
export class QueueNotFoundError extends Error {}
export class QueueBarberUnavailableError extends Error {}

export async function addToQueue({ phone, name, serviceId, barberId, source = 'tablet' }) {
  const date = businessDate();

  if (barberId) {
    const { rows: barberRows } = await pool.query(`select display_name from barbers where id = $1`, [barberId]);
    const barber = barberRows[0];
    if (!barber) {
      throw new QueueNotFoundError('Barber not found');
    }
    const availability = await getBarberAvailability(barberId, date);
    if (!availability.availableForWalkIns) {
      if (availability.lockedAppointment) {
        throw new QueueBarberUnavailableError(
          `${barber.display_name} has an appointment at ${timeOfDay(new Date(availability.lockedAppointment.starts_at))}`
        );
      }
      if (availability.onBreakUntil) {
        throw new QueueBarberUnavailableError(`${barber.display_name} is on break`);
      }
      throw new QueueBarberUnavailableError(`${barber.display_name} is not available today`);
    }
  }

  const customer = await findOrCreateCustomerByPhone(phone, name);
  const entry = await insertQueueEntryWithRetry({
    customerId: customer.id,
    barberId: barberId || null,
    serviceId,
    date,
    source,
  });
  return { entry, customer };
}

/**
 * Picks the next customer for this barber: the lower-sort_key head of his
 * own line vs the shared line's head (rule 3.1), locking whichever row
 * wins so two barbers racing for the same shared-line customer can't both
 * get it.
 */
export async function callNext(barberId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const date = businessDate();

    const { rows: alreadyServing } = await client.query(
      `select id from queue_entries where barber_id = $1 and status = 'serving'`,
      [barberId]
    );
    if (alreadyServing.length > 0) {
      await client.query('ROLLBACK');
      throw new QueueConflictError('Barber is already serving someone');
    }

    // FOR UPDATE can't be combined with UNION, so lock each line's head
    // separately, then pick the winner by sort_key in application code.
    const { rows: ownRows } = await client.query(
      `select * from queue_entries
       where business_date = $1 and status = 'waiting' and barber_id = $2
       order by sort_key asc, joined_at asc limit 1 for update skip locked`,
      [date, barberId]
    );
    const { rows: sharedRows } = await client.query(
      `select * from queue_entries
       where business_date = $1 and status = 'waiting' and barber_id is null
       order by sort_key asc, joined_at asc limit 1 for update skip locked`,
      [date]
    );

    const candidates = [...ownRows, ...sharedRows];
    if (candidates.length === 0) {
      await client.query('ROLLBACK');
      throw new QueueNotFoundError('No one is waiting');
    }

    candidates.sort((a, b) => a.sort_key - b.sort_key || new Date(a.joined_at) - new Date(b.joined_at));
    const chosen = candidates[0];
    try {
      const { rows } = await client.query(
        `update queue_entries set status = 'serving', called_at = now(), barber_id = $2
         where id = $1 returning *`,
        [chosen.id, barberId]
      );
      await client.query('COMMIT');
      return rows[0];
    } catch (err) {
      await client.query('ROLLBACK');
      if (err.code === UNIQUE_VIOLATION) {
        throw new QueueConflictError('Barber is already serving someone');
      }
      throw err;
    }
  } finally {
    client.release();
  }
}

/**
 * Finishing a haircut both closes the queue entry and creates its visit
 * record, in one transaction — a visit must exist even if the barber
 * never gets around to the style card, and killing the process mid-request
 * must never leave one half written without the other.
 */
export async function markDone(entryId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: entryRows } = await client.query(
      `update queue_entries set status = 'done', finished_at = now()
       where id = $1 and status = 'serving' returning *`,
      [entryId]
    );
    const entry = entryRows[0];
    if (!entry) {
      await client.query('ROLLBACK');
      throw new QueueConflictError('Entry is not currently being served');
    }

    const { rows: serviceRows } = await client.query(`select price from services where id = $1`, [entry.service_id]);
    const priceCharged = serviceRows[0]?.price ?? 0;

    const { rows: visitRows } = await client.query(
      `insert into visits (customer_id, barber_id, service_id, queue_entry_id, business_date, price_charged)
       values ($1, $2, $3, $4, $5, $6) returning *`,
      [entry.customer_id, entry.barber_id, entry.service_id, entry.id, entry.business_date, priceCharged]
    );

    const { rows: customerRows } = await client.query(
      `select id, name, consent_photos from customers where id = $1`,
      [entry.customer_id]
    );

    await client.query('COMMIT');
    return { entry, visit: visitRows[0], customer: customerRows[0] };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Rule 3.5: increment miss_count; if over the shop's miss_limit, remove
 * him. Otherwise put him back two places behind where he'd naturally land
 * next, by sort_key midpoint, without touching joined_at.
 */
export async function markMiss(entryId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: entryRows } = await client.query(
      `select * from queue_entries where id = $1 for update`,
      [entryId]
    );
    const entry = entryRows[0];
    if (!entry) {
      await client.query('ROLLBACK');
      throw new QueueNotFoundError('Queue entry not found');
    }

    const settings = await getShopSettings(client);
    const missLimit = settings?.miss_limit ?? 2;
    const newMissCount = entry.miss_count + 1;

    if (newMissCount >= missLimit) {
      const { rows } = await client.query(
        `update queue_entries set miss_count = $2, status = 'missed' where id = $1 returning *`,
        [entryId, newMissCount]
      );
      await client.query('COMMIT');
      return rows[0];
    }

    const lineFilter = entry.barber_id === null ? 'barber_id is null' : 'barber_id = $3';
    const params = entry.barber_id === null
      ? [entry.business_date, entryId]
      : [entry.business_date, entryId, entry.barber_id];

    const { rows: behind } = await client.query(
      `select id, sort_key from queue_entries
       where business_date = $1 and status = 'waiting' and id != $2 and ${lineFilter}
       order by sort_key asc, joined_at asc`,
      params
    );

    let newSortKey;
    if (behind.length >= 3) {
      newSortKey = (behind[1].sort_key + behind[2].sort_key) / 2;
    } else {
      const maxSortKey = behind.reduce((max, e) => Math.max(max, e.sort_key), entry.sort_key);
      newSortKey = maxSortKey + 1;
    }

    const { rows } = await client.query(
      `update queue_entries set miss_count = $2, status = 'waiting', sort_key = $3
       where id = $1 returning *`,
      [entryId, newMissCount, newSortKey]
    );
    await client.query('COMMIT');
    return rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function cancelEntry(entryId) {
  const { rows } = await pool.query(
    `update queue_entries set status = 'cancelled'
     where id = $1 and status in ('waiting', 'serving') returning *`,
    [entryId]
  );
  if (!rows[0]) {
    throw new QueueConflictError('Entry cannot be cancelled from its current status');
  }
  return rows[0];
}

/**
 * Manual override: reassign to a different barber (or the shared line),
 * or nudge one place up/down against the adjacent entry in the same line.
 * Only meaningful for entries still waiting.
 */
export async function moveEntry(entryId, { barberId, direction }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: entryRows } = await client.query(
      `select * from queue_entries where id = $1 for update`,
      [entryId]
    );
    const entry = entryRows[0];
    if (!entry) {
      await client.query('ROLLBACK');
      throw new QueueNotFoundError('Queue entry not found');
    }
    if (entry.status !== 'waiting') {
      await client.query('ROLLBACK');
      throw new QueueConflictError('Only a waiting entry can be moved');
    }

    if (barberId !== undefined) {
      const { rows } = await client.query(
        `update queue_entries set barber_id = $2 where id = $1 returning *`,
        [entryId, barberId]
      );
      await client.query('COMMIT');
      return rows[0];
    }

    if (direction === 'up' || direction === 'down') {
      const lineFilter = entry.barber_id === null ? 'barber_id is null' : 'barber_id = $3';
      const params = entry.barber_id === null
        ? [entry.business_date, entry.sort_key]
        : [entry.business_date, entry.sort_key, entry.barber_id];

      const comparator = direction === 'up' ? '<' : '>';
      const order = direction === 'up' ? 'desc' : 'asc';

      const { rows: neighborRows } = await client.query(
        `select * from queue_entries
         where business_date = $1 and status = 'waiting' and sort_key ${comparator} $2 and ${lineFilter}
         order by sort_key ${order} limit 1 for update`,
        params
      );
      const neighbor = neighborRows[0];
      if (!neighbor) {
        await client.query('ROLLBACK');
        return entry;
      }

      await client.query(`update queue_entries set sort_key = $2 where id = $1`, [entry.id, neighbor.sort_key]);
      await client.query(`update queue_entries set sort_key = $2 where id = $1`, [neighbor.id, entry.sort_key]);

      const { rows } = await client.query(`select * from queue_entries where id = $1`, [entryId]);
      await client.query('COMMIT');
      return rows[0];
    }

    await client.query('ROLLBACK');
    throw new QueueConflictError('Provide either barberId or direction');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Public-safe wait numbers — no customer data, just per-barber and shared
 * wait estimates. Reuses the same computeWaits() formula as getQueueView()
 * (the internal, full-detail view) so the two never disagree; a small
 * amount of orchestration (fetching entries/barbers/availability) is
 * duplicated here on purpose rather than sharing a fetch with getQueueView,
 * since that's on a 3s-polled hot path and this isn't.
 */
export async function getWaitEstimates() {
  const date = businessDate();
  const now = new Date();
  const [entries, barbers] = await Promise.all([getTodayEntries(pool, date), getActiveBarbers(pool)]);
  const availabilities = await Promise.all(barbers.map((b) => getBarberAvailability(b.id, date, now)));
  const availableBarberIds = new Set(
    barbers.filter((b, i) => availabilities[i].availableForWalkIns).map((b) => b.id)
  );
  const { barberWaits, sharedWait } = computeWaits(entries, barbers, now, availableBarberIds);

  return {
    barbers: barbers.map((barber, i) => ({
      barberId: barber.id,
      displayName: barber.display_name,
      waitMinutes: barberWaits[barber.id],
      availableForWalkIns: availabilities[i].availableForWalkIns,
    })),
    sharedWaitMinutes: sharedWait,
  };
}

function shapeEntry(e) {
  return {
    id: e.id,
    tokenNumber: e.token_number,
    status: e.status,
    barberId: e.barber_id,
    serviceId: e.service_id,
    serviceName: e.service_name,
    durationMinutes: e.duration_minutes,
    customerName: e.customer_name,
    customerPhone: e.customer_phone,
    missCount: e.miss_count,
    joinedAt: e.joined_at,
    calledAt: e.called_at,
    finishedAt: e.finished_at,
    sortKey: e.sort_key,
  };
}

export async function getQueueView() {
  const date = businessDate();
  const now = new Date();
  const [entries, barbers] = await Promise.all([getTodayEntries(pool, date), getActiveBarbers(pool)]);
  const availabilities = await Promise.all(barbers.map((b) => getBarberAvailability(b.id, date, now)));
  const availableBarberIds = new Set(
    barbers.filter((b, i) => availabilities[i].availableForWalkIns).map((b) => b.id)
  );
  const { barberWaits, sharedWait } = computeWaits(entries, barbers, now, availableBarberIds);

  const barberColumns = barbers.map((barber, i) => {
    const own = entries.filter((e) => e.barber_id === barber.id);
    const availability = availabilities[i];
    return {
      barberId: barber.id,
      displayName: barber.display_name,
      waitMinutes: barberWaits[barber.id],
      serving: shapeEntryOrNull(own.find((e) => e.status === 'serving')),
      waiting: own.filter((e) => e.status === 'waiting').map(shapeEntry),
      attendanceStatus: availability.attendanceStatus,
      onBreakUntil: availability.onBreakUntil,
      lockedAppointmentAt: availability.lockedAppointment?.starts_at ?? null,
      nextAppointmentAt: availability.nextAppointmentAt,
      availableForWalkIns: availability.availableForWalkIns,
    };
  });

  const shared = {
    waitMinutes: sharedWait,
    waiting: entries.filter((e) => e.barber_id === null && e.status === 'waiting').map(shapeEntry),
  };

  return { businessDate: date, barbers: barberColumns, shared };
}

function shapeEntryOrNull(e) {
  return e ? shapeEntry(e) : null;
}

export async function getDisplayView() {
  const date = businessDate();
  const [entries, barbers, settings] = await Promise.all([
    getTodayEntries(pool, date),
    getActiveBarbers(pool),
    getShopSettings(pool),
  ]);

  const chairs = barbers.map((barber) => {
    const serving = entries.find((e) => e.barber_id === barber.id && e.status === 'serving');
    return {
      barberId: barber.id,
      displayName: barber.display_name,
      servingToken: serving ? serving.token_number : null,
    };
  });

  const nextWaiting = entries
    .filter((e) => e.status === 'waiting')
    .sort((a, b) => a.sort_key - b.sort_key)
    .slice(0, 6)
    .map((e) => e.token_number);

  return {
    shopName: settings?.shop_name ?? null,
    chairs,
    nextWaiting,
  };
}
