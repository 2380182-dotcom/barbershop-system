import { pool } from '../db/pool.js';

export class StyleCardNotFoundError extends Error {}
export class PhotoConsentError extends Error {}

export async function getPresets() {
  const { rows } = await pool.query(
    `select field, label, sort_order from style_presets where active = true order by field, sort_order`
  );
  const grouped = { sides: [], top: [], beard: [] };
  for (const row of rows) {
    grouped[row.field].push({ label: row.label });
  }
  return grouped;
}

/**
 * One card per visit. grow_out_days is snapshotted from the service at
 * save time (defaulting to the service's current value if the barber
 * didn't change the stepper) so a later edit to the service never
 * rewrites history — Postgres's ON CONFLICT makes a second save for the
 * same visit an update, not a duplicate row.
 */
export async function saveStyleCard({ visitId, sides, top, beard, notes, growOutDays }) {
  const { rows: visitRows } = await pool.query(
    `select v.id, v.customer_id, s.grow_out_days as service_grow_out_days
     from visits v join services s on s.id = v.service_id
     where v.id = $1`,
    [visitId]
  );
  const visit = visitRows[0];
  if (!visit) {
    throw new StyleCardNotFoundError('Visit not found');
  }

  const finalGrowOutDays = growOutDays ?? visit.service_grow_out_days;

  const { rows } = await pool.query(
    `insert into style_cards (visit_id, customer_id, sides, top, beard, notes, grow_out_days)
     values ($1, $2, $3, $4, $5, $6, $7)
     on conflict (visit_id) do update set
       sides = excluded.sides,
       top = excluded.top,
       beard = excluded.beard,
       notes = excluded.notes,
       grow_out_days = excluded.grow_out_days
     returning *`,
    [visitId, visit.customer_id, sides ?? null, top ?? null, beard ?? null, notes ?? null, finalGrowOutDays]
  );
  return rows[0];
}

export async function getRecentStyleCards(customerId, limit = 5) {
  const { rows } = await pool.query(
    `select sc.*, b.display_name as barber_name, v.business_date
     from style_cards sc
     join visits v on v.id = sc.visit_id
     join barbers b on b.id = v.barber_id
     where sc.customer_id = $1
     order by sc.created_at desc
     limit $2`,
    [customerId, limit]
  );
  return rows;
}

export async function getStyleCardWithCustomer(styleCardId) {
  const { rows } = await pool.query(
    `select sc.*, c.consent_photos
     from style_cards sc
     join customers c on c.id = sc.customer_id
     where sc.id = $1`,
    [styleCardId]
  );
  return rows[0] || null;
}

export async function attachPhoto(styleCardId, filename) {
  const { rows } = await pool.query(
    `update style_cards set photo_path = $2 where id = $1 returning *`,
    [styleCardId, filename]
  );
  return rows[0];
}
