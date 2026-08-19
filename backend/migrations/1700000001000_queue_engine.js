export const shorthands = undefined;

export const up = (pgm) => {
  pgm.sql(`
    -- Explicit ordering key. Lets us move a customer down the queue
    -- without touching joined_at, which stays as a true record of arrival.
    alter table queue_entries
      add column sort_key double precision;

    update queue_entries set sort_key = extract(epoch from joined_at);

    alter table queue_entries
      alter column sort_key set not null;

    create index queue_entries_business_date_barber_id_sort_key_idx
      on queue_entries (business_date, barber_id, sort_key);

    -- A barber can only be cutting one person at a time.
    create unique index queue_one_serving_per_barber
      on queue_entries (barber_id)
      where status = 'serving';
  `);
};

export const down = (pgm) => {
  pgm.sql(`
    drop index if exists queue_one_serving_per_barber;
    drop index if exists queue_entries_business_date_barber_id_sort_key_idx;
    alter table queue_entries drop column if exists sort_key;
  `);
};
