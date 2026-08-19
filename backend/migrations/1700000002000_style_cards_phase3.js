export const shorthands = undefined;

export const up = (pgm) => {
  pgm.sql(`
    -- The tap options a barber picks from. The owner can edit these later.
    create table style_presets (
      id         uuid primary key default gen_random_uuid(),
      field      text not null check (field in ('sides','top','beard')),
      label      text not null,
      sort_order int not null default 0,
      active     boolean not null default true,
      created_at timestamptz not null default now()
    );
    create index on style_presets (field, sort_order);

    insert into style_presets (field, label, sort_order) values
      ('sides', '#0 skin fade', 0),
      ('sides', '#1 low fade', 1),
      ('sides', '#2 mid fade', 2),
      ('sides', '#3 high fade', 3),
      ('sides', '#4 taper', 4),
      ('sides', 'Scissor only', 5),
      ('top', '2 cm', 0),
      ('top', '3 cm', 1),
      ('top', '4 cm', 2),
      ('top', '5 cm', 3),
      ('top', 'Textured', 4),
      ('top', 'Side part', 5),
      ('top', 'Slick back', 6),
      ('beard', 'Clean shave', 0),
      ('beard', '3 mm', 1),
      ('beard', '6 mm', 2),
      ('beard', '9 mm', 3),
      ('beard', 'Line up only', 4),
      ('beard', 'Full trim', 5);

    -- "A second save for the same visit_id updates the existing one" needs
    -- this to make the save an upsert (ON CONFLICT (visit_id)).
    alter table style_cards
      add constraint style_cards_visit_id_key unique (visit_id);
  `);
};

export const down = (pgm) => {
  pgm.sql(`
    alter table style_cards drop constraint if exists style_cards_visit_id_key;
    drop table if exists style_presets;
  `);
};
