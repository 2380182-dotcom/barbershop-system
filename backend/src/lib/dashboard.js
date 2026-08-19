import { pool } from '../db/pool.js';
import { businessDate, instantAt } from './businessDate.js';

function firstOfMonth(dateStr) {
  const [y, m] = dateStr.split('-').map(Number);
  return `${y}-${String(m).padStart(2, '0')}-01`;
}

function firstOfNextMonth(dateStr) {
  const [y, m] = dateStr.split('-').map(Number);
  const nextMonth = m === 12 ? 1 : m + 1;
  const nextYear = m === 12 ? y + 1 : y;
  return `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;
}

async function getToday(date) {
  const [{ rows: byBarber }, { rows: waitingRows }, { rows: waitRows }, { rows: apptRows }] = await Promise.all([
    pool.query(
      `select b.id as barber_id, b.display_name, count(v.id)::int as count
       from barbers b
       left join visits v on v.barber_id = b.id and v.business_date = $1
       where b.active = true
       group by b.id, b.display_name, b.sort_order
       order by b.sort_order`,
      [date]
    ),
    pool.query(`select count(*)::int as count from queue_entries where business_date = $1 and status = 'waiting'`, [date]),
    pool.query(
      `select avg(extract(epoch from (called_at - joined_at)) / 60) as avg_minutes
       from queue_entries where business_date = $1 and called_at is not null`,
      [date]
    ),
    pool.query(
      `select status, count(*)::int as count from appointments
       where business_date = $1 and status in ('booked', 'arrived', 'no_show')
       group by status`,
      [date]
    ),
  ]);

  const customersServedTotal = byBarber.reduce((sum, b) => sum + b.count, 0);
  const appointments = { booked: 0, arrived: 0, noShow: 0 };
  for (const row of apptRows) {
    if (row.status === 'booked') appointments.booked = row.count;
    if (row.status === 'arrived') appointments.arrived = row.count;
    if (row.status === 'no_show') appointments.noShow = row.count;
  }

  return {
    customersServedByBarber: byBarber.map((b) => ({ barberId: b.barber_id, displayName: b.display_name, count: b.count })),
    customersServedTotal,
    currentlyWaiting: waitingRows[0].count,
    averageWaitMinutes: waitRows[0].avg_minutes !== null ? Math.round(Number(waitRows[0].avg_minutes)) : null,
    appointments,
  };
}

async function getMonth(date) {
  const monthStart = firstOfMonth(date);
  const monthEnd = firstOfNextMonth(date);

  const { rows: servedRows } = await pool.query(
    `select count(*)::int as count from visits where business_date >= $1 and business_date < $2`,
    [monthStart, monthEnd]
  );

  const { rows: newReturningRows } = await pool.query(
    `with month_customers as (
       select distinct customer_id from visits where business_date >= $1 and business_date < $2
     ),
     first_visit as (
       select customer_id, min(business_date) as first_date from visits group by customer_id
     )
     select
       count(*) filter (where fv.first_date >= $1 and fv.first_date < $2)::int as new_customers,
       count(*) filter (where fv.first_date < $1)::int as returning_customers
     from month_customers mc join first_visit fv on fv.customer_id = mc.customer_id`,
    [monthStart, monthEnd]
  );

  // A customer "repeats" this month if any of their visits this month came
  // within 30 days of their immediately preceding visit (any visit, not
  // just this month's) — i.e. this month is when they came back.
  const { rows: repeatRows } = await pool.query(
    `with visit_gaps as (
       select customer_id, business_date,
              business_date - lag(business_date) over (partition by customer_id order by business_date) as gap_days
       from visits
     ),
     active_this_month as (
       select distinct customer_id from visits where business_date >= $1 and business_date < $2
     ),
     repeats_this_month as (
       select distinct customer_id from visit_gaps
       where gap_days is not null and gap_days <= 30
         and business_date >= $1 and business_date < $2
     )
     select
       (select count(*) from active_this_month)::int as active_customers,
       (select count(*) from repeats_this_month)::int as repeat_customers`,
    [monthStart, monthEnd]
  );

  const { rows: busiestDayRows } = await pool.query(
    `select business_date, count(*)::int as count from visits
     where business_date >= $1 and business_date < $2
     group by business_date order by count desc, business_date asc limit 1`,
    [monthStart, monthEnd]
  );

  const { rows: busiestHourRows } = await pool.query(
    `select extract(hour from created_at at time zone 'Asia/Karachi')::int as hour, count(*)::int as count
     from visits
     where business_date >= $1 and business_date < $2
     group by hour order by count desc, hour asc limit 1`,
    [monthStart, monthEnd]
  );

  const monthStartInstant = instantAt(monthStart, '00:00');
  const monthEndInstant = instantAt(monthEnd, '00:00');
  const { rows: messageRows } = await pool.query(
    `select status, count(*)::int as count, coalesce(sum(cost), 0) as total_cost
     from messages
     where created_at >= $1 and created_at < $2
     group by status`,
    [monthStartInstant.toISOString(), monthEndInstant.toISOString()]
  );

  const messages = { sent: 0, delivered: 0, failed: 0, totalCost: 0 };
  for (const row of messageRows) {
    if (row.status === 'sent') messages.sent = row.count;
    if (row.status === 'delivered') messages.delivered = row.count;
    if (row.status === 'failed') messages.failed = row.count;
    if (row.status === 'sent' || row.status === 'delivered') {
      messages.totalCost += Number(row.total_cost);
    }
  }

  const activeCustomers = repeatRows[0].active_customers;
  const repeatCustomers = repeatRows[0].repeat_customers;

  return {
    monthStart,
    customersServed: servedRows[0].count,
    newCustomers: newReturningRows[0].new_customers,
    returningCustomers: newReturningRows[0].returning_customers,
    repeatRate: activeCustomers > 0 ? Math.round((repeatCustomers / activeCustomers) * 1000) / 10 : 0,
    repeatCustomers,
    activeCustomers,
    busiestDay: busiestDayRows[0]?.business_date ?? null,
    busiestHour: busiestHourRows[0]?.hour ?? null,
    messages,
  };
}

export async function getDashboard(date) {
  const day = date || businessDate();
  const [today, thisMonth] = await Promise.all([getToday(day), getMonth(day)]);
  return { date: day, today, thisMonth };
}
