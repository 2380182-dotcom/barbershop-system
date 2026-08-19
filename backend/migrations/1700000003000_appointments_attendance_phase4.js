export const shorthands = undefined;

export const up = (pgm) => {
  pgm.sql(`
    -- Reason text when the owner cancels or reschedules because a barber is away.
    alter table appointments add column status_note text;

    -- Fast lookup of a barber's day.
    create index appointments_barber_id_business_date_status_idx
      on appointments (barber_id, business_date, status);
  `);
};

export const down = (pgm) => {
  pgm.sql(`
    drop index if exists appointments_barber_id_business_date_status_idx;
    alter table appointments drop column if exists status_note;
  `);
};
