-- Virtual Kamogawa — demo seed data (architecture doc §8 decision #2).
-- Activity-type colors are the §4.1 hue tokens (indigo/river/moss/sand/sunset)
-- -- kamo-stone and kamo-ink are reserved for backgrounds/text, not markers.

insert into activity_types (name_en, name_ja, color) values
  ('Writing', '執筆', '#2e3a59'),
  ('Reading', '読書', '#6e8ca0'),
  ('Walking', '散歩', '#7c8c5a'),
  ('Music', '音楽', '#e0885e'),
  ('Yoga', 'ヨガ', '#d8c7a8');

-- Events: one currently active (spans "now"), one past, one upcoming —
-- computed relative to now() so the seed stays valid whenever it's run.
insert into events (name, starts_at, ends_at, active) values
  ('Kamogawa Gathering — This Week', now() - interval '2 hours', now() + interval '2 hours', true),
  ('Kamogawa Gathering — Last Week', now() - interval '7 days 3 hours', now() - interval '7 days', false),
  ('Kamogawa Gathering — Next Week', now() + interval '7 days', now() + interval '7 days 3 hours', false);

-- Duck spots: 10 points along the Kamogawa, Delta down through the popular
-- Sanjo-Shijo stretch, each with a random opaque qr_token (Appendix A.2b).
insert into duck_spots (name_en, name_ja, lat, lng, qr_token, active) values
  ('Kamogawa Delta', '鴨川デルタ', 35.0300, 135.7720, encode(gen_random_bytes(8), 'hex'), true),
  ('Demachiyanagi Bridge', '出町柳橋', 35.0295, 135.7715, encode(gen_random_bytes(8), 'hex'), true),
  ('Kitayama', '北山', 35.0430, 135.7660, encode(gen_random_bytes(8), 'hex'), true),
  ('Marutamachi Bridge', '丸太町橋', 35.0180, 135.7700, encode(gen_random_bytes(8), 'hex'), true),
  ('Nijo Bridge', '二条大橋', 35.0130, 135.7705, encode(gen_random_bytes(8), 'hex'), true),
  ('Sanjo Bridge', '三条大橋', 35.0100, 135.7715, encode(gen_random_bytes(8), 'hex'), true),
  ('Shijo Bridge', '四条大橋', 35.0035, 135.7715, encode(gen_random_bytes(8), 'hex'), true),
  ('Gojo Bridge', '五条大橋', 34.9975, 135.7690, encode(gen_random_bytes(8), 'hex'), true),
  ('Shichijo', '七条', 34.9880, 135.7660, encode(gen_random_bytes(8), 'hex'), true),
  ('Jujo', '十条', 34.9750, 135.7630, encode(gen_random_bytes(8), 'hex'), true);
