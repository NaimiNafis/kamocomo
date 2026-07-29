-- Virtual Kamogawa — demo seed data (architecture doc §8 decision #2).
-- Fixed ids + ON CONFLICT throughout so this is safe to re-run any time
-- (earlier runs without fixed ids produced duplicate rows -- if you seeded
-- before this version, de-dupe activity_types/events/duck_spots first).
--
-- Activity-type colors are the §4.1 hue tokens (indigo/river/moss/sand/sunset)
-- -- kamo-stone and kamo-ink are reserved for backgrounds/text, not markers.

insert into activity_types (id, name_en, name_ja, color) values
  ('a1000000-0000-0000-0000-000000000001', 'Writing', '執筆', '#2e3a59'),
  ('a1000000-0000-0000-0000-000000000002', 'Reading', '読書', '#6e8ca0'),
  ('a1000000-0000-0000-0000-000000000003', 'Walking', '散歩', '#7c8c5a'),
  ('a1000000-0000-0000-0000-000000000004', 'Music', '音楽', '#e0885e'),
  ('a1000000-0000-0000-0000-000000000005', 'Yoga', 'ヨガ', '#d8c7a8')
on conflict (id) do nothing;

-- Events: one currently active (spans "now"), one past, one upcoming --
-- times recomputed relative to now() on every run so the "active" one
-- stays valid whenever this is re-seeded.
-- The active window is deliberately wide (started a day ago, runs three more
-- days) so the demo's "main creation" path keeps working for days after a
-- seed, not just the couple of hours a narrow window would allow -- the
-- event gate checks the time window, not the `active` flag, so a stale
-- narrow window would silently start rejecting main inserts.
insert into events (id, name, starts_at, ends_at, active) values
  ('e1000000-0000-0000-0000-000000000001', 'Kamogawa Gathering — This Week', now() - interval '1 day', now() + interval '3 days', true),
  ('e1000000-0000-0000-0000-000000000002', 'Kamogawa Gathering — Last Week', now() - interval '9 days', now() - interval '7 days', false),
  ('e1000000-0000-0000-0000-000000000003', 'Kamogawa Gathering — Next Week', now() + interval '7 days', now() + interval '9 days', false)
on conflict (id) do update set
  starts_at = excluded.starts_at,
  ends_at = excluded.ends_at,
  active = excluded.active;

-- Duck spots: 10 points along the Kamogawa, Delta down through the popular
-- Sanjo-Shijo stretch. qr_token only generated on first insert (Appendix
-- A.2b) -- re-running must not hand out a fresh token for an already-seeded
-- spot, since real printed QR codes would encode the original token.
insert into duck_spots (id, name_en, name_ja, lat, lng, qr_token, active) values
  ('d1000000-0000-0000-0000-000000000001', 'Kamogawa Delta', '鴨川デルタ', 35.0300, 135.7720, encode(gen_random_bytes(8), 'hex'), true),
  ('d1000000-0000-0000-0000-000000000002', 'Demachiyanagi Bridge', '出町柳橋', 35.0295, 135.7715, encode(gen_random_bytes(8), 'hex'), true),
  ('d1000000-0000-0000-0000-000000000003', 'Kitayama', '北山', 35.0430, 135.7660, encode(gen_random_bytes(8), 'hex'), true),
  ('d1000000-0000-0000-0000-000000000004', 'Marutamachi Bridge', '丸太町橋', 35.0180, 135.7700, encode(gen_random_bytes(8), 'hex'), true),
  ('d1000000-0000-0000-0000-000000000005', 'Nijo Bridge', '二条大橋', 35.0130, 135.7705, encode(gen_random_bytes(8), 'hex'), true),
  ('d1000000-0000-0000-0000-000000000006', 'Sanjo Bridge', '三条大橋', 35.0100, 135.7715, encode(gen_random_bytes(8), 'hex'), true),
  ('d1000000-0000-0000-0000-000000000007', 'Shijo Bridge', '四条大橋', 35.0035, 135.7715, encode(gen_random_bytes(8), 'hex'), true),
  ('d1000000-0000-0000-0000-000000000008', 'Gojo Bridge', '五条大橋', 34.9975, 135.7690, encode(gen_random_bytes(8), 'hex'), true),
  ('d1000000-0000-0000-0000-000000000009', 'Shichijo', '七条', 34.9880, 135.7660, encode(gen_random_bytes(8), 'hex'), true),
  ('d1000000-0000-0000-0000-000000000010', 'Jujo', '十条', 34.9750, 135.7630, encode(gen_random_bytes(8), 'hex'), true)
on conflict (id) do nothing;

-- The ~8 activity "places" (each map marker is a place, not a single main)
-- are seeded inside their migration (20260723120000_places_daily_events...),
-- not here -- clients can't insert into places (read-only RLS), so the
-- canonical set ships with the schema so the app works right after db push.

-- Demo main activities are seeded separately via scripts/seed-demo-places.mjs
-- (place-attached mains + subs) / scripts/seed-demo-activities.mjs, which sign
-- in real anonymous users through the same signInAnonymously() flow the app
-- itself uses -- not direct SQL -- so every author_id is a genuine auth.users
-- row rather than a hand-inserted one.
