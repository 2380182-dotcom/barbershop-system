export const shorthands = undefined;

export const up = (pgm) => {
  pgm.sql(`
    create extension if not exists pgcrypto;

    -- Shop configuration. Exactly one row.
    create table shop_settings (
      id                    uuid primary key default gen_random_uuid(),
      shop_name             text not null,
      timezone              text not null default 'Asia/Karachi',
      opening_time          time not null default '10:00',
      closing_time          time not null default '22:00',
      weekly_off_day        int,                       -- 0=Sunday .. 6=Saturday, null = open every day
      self_join_enabled     boolean not null default true,
      appointment_lock_minutes int not null default 15,
      miss_limit            int not null default 2,
      created_at            timestamptz not null default now(),
      updated_at            timestamptz not null default now()
    );

    -- People who can log in: the owner, and barbers who use the tablet.
    create table users (
      id            uuid primary key default gen_random_uuid(),
      name          text not null,
      username      text not null unique,
      password_hash text not null,
      role          text not null check (role in ('owner','barber')),
      active        boolean not null default true,
      last_login_at timestamptz,
      created_at    timestamptz not null default now()
    );

    -- A barber is a chair in the shop. May or may not have a login.
    create table barbers (
      id            uuid primary key default gen_random_uuid(),
      user_id       uuid references users(id) on delete set null,
      display_name  text not null,
      working_days  int[] not null default '{0,1,2,3,4,5,6}',  -- his normal days
      sort_order    int not null default 0,
      active        boolean not null default true,
      created_at    timestamptz not null default now()
    );

    -- What the shop sells. Duration drives the wait time estimate.
    create table services (
      id               uuid primary key default gen_random_uuid(),
      name             text not null,
      duration_minutes int not null check (duration_minutes > 0),
      price            numeric(10,2) not null default 0,
      grow_out_days    int not null default 21,   -- when to send the rebooking reminder
      sort_order       int not null default 0,
      active           boolean not null default true,
      created_at       timestamptz not null default now()
    );

    -- The phone number is the customer account. No email, no password.
    create table customers (
      id                uuid primary key default gen_random_uuid(),
      phone             text not null unique,
      name              text,
      consent_messages  boolean not null default false,
      consent_messages_at timestamptz,
      consent_photos    boolean not null default false,
      blocked           boolean not null default false,
      notes             text,
      created_at        timestamptz not null default now(),
      updated_at        timestamptz not null default now()
    );

    -- Who is in the shop today. One row per barber per day.
    create table barber_attendance (
      id            uuid primary key default gen_random_uuid(),
      barber_id     uuid not null references barbers(id) on delete cascade,
      business_date date not null,
      status        text not null check (status in ('present','absent','leave')),
      on_break_until timestamptz,
      marked_by     uuid references users(id),
      marked_at     timestamptz not null default now(),
      unique (barber_id, business_date)
    );

    -- The walk-in queue.
    create table queue_entries (
      id            uuid primary key default gen_random_uuid(),
      customer_id   uuid not null references customers(id),
      barber_id     uuid references barbers(id),      -- null = "any barber" line
      service_id    uuid not null references services(id),
      business_date date not null,
      token_number  int not null,
      status        text not null default 'waiting'
                    check (status in ('waiting','serving','done','missed','cancelled')),
      source        text not null default 'tablet' check (source in ('tablet','qr')),
      miss_count    int not null default 0,
      joined_at     timestamptz not null default now(),
      called_at     timestamptz,
      finished_at   timestamptz,
      unique (business_date, token_number)
    );
    create index on queue_entries (business_date, status);

    -- One completed haircut.
    create table visits (
      id             uuid primary key default gen_random_uuid(),
      customer_id    uuid not null references customers(id),
      barber_id      uuid not null references barbers(id),
      service_id     uuid not null references services(id),
      queue_entry_id uuid references queue_entries(id),
      business_date  date not null,
      price_charged  numeric(10,2) not null default 0,
      created_at     timestamptz not null default now()
    );
    create index on visits (customer_id, created_at desc);

    -- What was actually done. This is the product.
    create table style_cards (
      id            uuid primary key default gen_random_uuid(),
      visit_id      uuid not null references visits(id) on delete cascade,
      customer_id   uuid not null references customers(id),
      sides         text,      -- e.g. "#2 guard, mid fade"
      top           text,      -- e.g. "4 cm, textured, left part"
      beard         text,      -- e.g. "6 mm, sharp line"
      notes         text,
      photo_path    text,      -- only if customers.consent_photos is true
      grow_out_days int not null default 21,
      created_at    timestamptz not null default now()
    );
    create index on style_cards (customer_id, created_at desc);

    -- Booked slots. The unique constraint is what stops double booking.
    create table appointments (
      id            uuid primary key default gen_random_uuid(),
      customer_id   uuid not null references customers(id),
      barber_id     uuid not null references barbers(id),
      service_id    uuid not null references services(id),
      business_date date not null,
      starts_at     timestamptz not null,
      ends_at       timestamptz not null,
      status        text not null default 'booked'
                    check (status in ('booked','arrived','done','cancelled','no_show','needs_reschedule')),
      created_at    timestamptz not null default now(),
      unique (barber_id, starts_at)
    );

    -- Every WhatsApp message we send.
    create table messages (
      id             uuid primary key default gen_random_uuid(),
      customer_id    uuid not null references customers(id),
      template_name  text not null,
      body_preview   text,
      status         text not null default 'queued'
                     check (status in ('queued','sent','delivered','failed')),
      provider_id    text,
      cost           numeric(10,4),
      sent_at        timestamptz,
      created_at     timestamptz not null default now()
    );
    create index on messages (customer_id, created_at desc);

    -- Face scan results. Table exists now, feature comes in phase 6.
    create table face_scans (
      id              uuid primary key default gen_random_uuid(),
      customer_id     uuid references customers(id),
      detected_shape  text,
      corrected_shape text,
      photo_path      text,
      created_at      timestamptz not null default now()
    );

    -- Who changed what.
    create table audit_logs (
      id          uuid primary key default gen_random_uuid(),
      user_id     uuid references users(id),
      action      text not null,
      entity      text not null,
      entity_id   uuid,
      detail      jsonb,
      created_at  timestamptz not null default now()
    );
    create index on audit_logs (created_at desc);
  `);
};

export const down = (pgm) => {
  pgm.sql(`
    drop table if exists
      audit_logs,
      face_scans,
      messages,
      appointments,
      style_cards,
      visits,
      queue_entries,
      barber_attendance,
      customers,
      services,
      barbers,
      users,
      shop_settings
    cascade;
  `);
};
