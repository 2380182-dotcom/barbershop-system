export const shorthands = undefined;

export const up = (pgm) => {
  pgm.sql(`
    -- Tie a reminder to the visit it came from, so it can never be sent twice.
    alter table messages add column visit_id uuid references visits(id) on delete set null;
    alter table messages add column scheduled_for timestamptz;
    alter table messages add column attempts int not null default 0;
    alter table messages add column last_error text;
    alter table messages add column claimed_at timestamptz;

    -- 'sending' (claimed by a worker) and 'cancelled' (opt-out, or a gate that
    -- will never pass) are needed by the sender worker and opt-out flow.
    alter table messages drop constraint messages_status_check;
    alter table messages add constraint messages_status_check
      check (status in ('queued', 'sending', 'sent', 'delivered', 'failed', 'cancelled'));

    -- One rebooking reminder per visit. Ever.
    create unique index messages_one_reminder_per_visit
      on messages (visit_id)
      where template_name = 'rebooking_reminder';

    create index messages_status_scheduled_for_idx on messages (status, scheduled_for);

    -- Opting out is permanent until the customer asks to come back.
    alter table customers add column opted_out_at timestamptz;

    -- Sending controls the owner can see and change.
    alter table shop_settings add column messaging_mode text not null default 'dry_run'
      check (messaging_mode in ('dry_run','live'));
    alter table shop_settings add column quiet_hours_start time not null default '21:00';
    alter table shop_settings add column quiet_hours_end time not null default '10:00';
    alter table shop_settings add column daily_message_cap int not null default 100;
    alter table shop_settings add column cost_per_message numeric(10,4) not null default 0;
  `);
};

export const down = (pgm) => {
  pgm.sql(`
    alter table shop_settings drop column if exists cost_per_message;
    alter table shop_settings drop column if exists daily_message_cap;
    alter table shop_settings drop column if exists quiet_hours_end;
    alter table shop_settings drop column if exists quiet_hours_start;
    alter table shop_settings drop column if exists messaging_mode;

    alter table customers drop column if exists opted_out_at;

    drop index if exists messages_status_scheduled_for_idx;
    drop index if exists messages_one_reminder_per_visit;

    alter table messages drop constraint if exists messages_status_check;
    alter table messages add constraint messages_status_check
      check (status in ('queued', 'sent', 'delivered', 'failed'));

    alter table messages drop column if exists claimed_at;
    alter table messages drop column if exists last_error;
    alter table messages drop column if exists attempts;
    alter table messages drop column if exists scheduled_for;
    alter table messages drop column if exists visit_id;
  `);
};
