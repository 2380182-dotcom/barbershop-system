export const shorthands = undefined;

export const up = (pgm) => {
  pgm.sql(`
    -- Short-lived tokens shown as the QR on the wall screen.
    create table qr_tokens (
      id         uuid primary key default gen_random_uuid(),
      token      text not null unique,
      issued_at  timestamptz not null default now(),
      expires_at timestamptz not null
    );
    create index qr_tokens_expires_at_idx on qr_tokens (expires_at);

    -- How a customer proves he is the person who joined, without a password.
    alter table queue_entries add column public_token text unique;
    alter table appointments add column public_token text unique;

    -- Face scan consent is separate from photo consent.
    alter table face_scans add column ratios jsonb;
    alter table face_scans add column suggested_styles jsonb;

    -- Its own toggle, independent of self_join_enabled for the queue.
    alter table shop_settings add column public_booking_enabled boolean not null default true;
  `);
};

export const down = (pgm) => {
  pgm.sql(`
    alter table shop_settings drop column if exists public_booking_enabled;

    alter table face_scans drop column if exists suggested_styles;
    alter table face_scans drop column if exists ratios;

    alter table appointments drop column if exists public_token;
    alter table queue_entries drop column if exists public_token;

    drop table if exists qr_tokens;
  `);
};
