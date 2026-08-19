import { pool } from '../db/pool.js';
import { businessDate } from './businessDate.js';

/**
 * Weekday (0=Sunday..6=Saturday) for a shop-calendar date string, computed
 * from the Y-M-D components directly — never by constructing a Date from
 * the string and reading it back through a timezone, which is exactly the
 * kind of reinterpretation bug the project's timezone rule exists to avoid.
 */
export function weekdayOf(businessDateStr) {
  const [y, m, d] = businessDateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/**
 * The one place that decides whether a barber is present, absent, or on
 * leave for a given day. Rule: an explicit barber_attendance row wins;
 * otherwise his normal working_days decide. Absence is a change, not the
 * default — nothing else in the codebase may make this call.
 */
export async function resolveAttendance(barberId, businessDateStr, client = pool) {
  const { rows } = await client.query(
    `select * from barber_attendance where barber_id = $1 and business_date = $2`,
    [barberId, businessDateStr]
  );
  if (rows[0]) {
    const row = rows[0];
    return { status: row.status, onBreakUntil: row.on_break_until, source: 'attendance_row', markedBy: row.marked_by };
  }

  const { rows: barberRows } = await client.query(`select working_days from barbers where id = $1`, [barberId]);
  const workingDays = barberRows[0]?.working_days ?? [];
  const status = workingDays.includes(weekdayOf(businessDateStr)) ? 'present' : 'absent';
  return { status, onBreakUntil: null, source: 'working_days_default', markedBy: null };
}

/**
 * Any appointment this barber still holds for the day he's being marked
 * away for must never just silently vanish — flag it so the owner's
 * needs-reschedule list picks it up, whether he acts on it now or later.
 */
async function flagAppointmentsNeedingReschedule(client, barberId, businessDateStr) {
  const { rows } = await client.query(
    `update appointments set status = 'needs_reschedule'
     where barber_id = $1 and business_date = $2 and status in ('booked', 'arrived')
     returning *`,
    [barberId, businessDateStr]
  );
  return rows;
}

function enumerateDates(startStr, endStr) {
  const [sy, sm, sd] = startStr.split('-').map(Number);
  const [ey, em, ed] = endStr.split('-').map(Number);
  let cursor = Date.UTC(sy, sm - 1, sd);
  const end = Date.UTC(ey, em - 1, ed);
  const dates = [];
  while (cursor <= end) {
    dates.push(new Date(cursor).toISOString().slice(0, 10));
    cursor += 24 * 60 * 60 * 1000;
  }
  return dates;
}

/** Mark present or absent for a single day (today, from the tablet). */
export async function markAttendance({ barberId, businessDate: dateStr, status, markedBy }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `insert into barber_attendance (barber_id, business_date, status, marked_by, on_break_until)
       values ($1, $2, $3, $4, null)
       on conflict (barber_id, business_date) do update set
         status = excluded.status, marked_by = excluded.marked_by, on_break_until = null, marked_at = now()
       returning *`,
      [barberId, dateStr, status, markedBy]
    );

    let flaggedAppointments = [];
    if (status === 'absent') {
      flaggedAppointments = await flagAppointmentsNeedingReschedule(client, barberId, dateStr);
    }

    await client.query('COMMIT');
    return { attendance: rows[0], flaggedAppointments };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** Owner-only: leave for a date range, possibly in the future. */
export async function markLeave({ barberId, startDate, endDate, markedBy }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const dates = enumerateDates(startDate, endDate);
    const flaggedAppointments = [];
    for (const dateStr of dates) {
      await client.query(
        `insert into barber_attendance (barber_id, business_date, status, marked_by, on_break_until)
         values ($1, $2, 'leave', $3, null)
         on conflict (barber_id, business_date) do update set
           status = 'leave', marked_by = $3, on_break_until = null, marked_at = now()`,
        [barberId, dateStr, markedBy]
      );
      flaggedAppointments.push(...(await flagAppointmentsNeedingReschedule(client, barberId, dateStr)));
    }
    await client.query('COMMIT');
    return { dates, flaggedAppointments };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** Break must start from present — going on break doesn't change that. */
export async function markBreak({ barberId, onBreakUntil, markedBy }) {
  const dateStr = businessDate();
  const { rows } = await pool.query(
    `insert into barber_attendance (barber_id, business_date, status, marked_by, on_break_until)
     values ($1, $2, 'present', $3, $4)
     on conflict (barber_id, business_date) do update set
       status = 'present', marked_by = $3, on_break_until = $4, marked_at = now()
     returning *`,
    [barberId, dateStr, markedBy, onBreakUntil]
  );
  return rows[0];
}

export async function getAttendanceForDate(dateStr) {
  const { rows: barbers } = await pool.query(
    `select * from barbers where active = true order by sort_order, created_at`
  );
  const results = [];
  for (const barber of barbers) {
    const resolved = await resolveAttendance(barber.id, dateStr);
    results.push({ barberId: barber.id, displayName: barber.display_name, ...resolved });
  }
  return results;
}

/**
 * Scheduling information only — how many days a barber was present,
 * absent, or on leave this month. Not payroll, and must never be
 * presented as such.
 */
export async function getMonthlyAttendanceSummary(monthStr) {
  const [y, m] = monthStr.split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const { rows: barbers } = await pool.query(
    `select * from barbers where active = true order by sort_order, created_at`
  );

  const summary = [];
  for (const barber of barbers) {
    const counts = { present: 0, absent: 0, leave: 0 };
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${monthStr}-${String(day).padStart(2, '0')}`;
      const resolved = await resolveAttendance(barber.id, dateStr);
      counts[resolved.status] += 1;
    }
    summary.push({ barberId: barber.id, displayName: barber.display_name, ...counts });
  }
  return summary;
}

export async function getBarberIdForUser(userId) {
  const { rows } = await pool.query(`select id from barbers where user_id = $1`, [userId]);
  return rows[0]?.id ?? null;
}
