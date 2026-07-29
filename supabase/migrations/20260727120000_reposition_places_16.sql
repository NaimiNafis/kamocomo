-- Reposition the activity places to the 16 coordinates the user specified,
-- which trace the Kamogawa's shape: the eastern Takano branch (高野川) coming
-- down to the Delta, the Delta confluence itself, the western Kamo branch
-- (賀茂川) going back up, and the southern main stretch past the bridges.
--
-- The previous places are deactivated (their old demo content stays in the
-- archive) and the 16 below become the active marker set -- each is one map
-- marker and gets its own /toukou?place=<id> board automatically.
--
-- Names are best-guess placeholders from the geography; rename freely.
update places set active = false;

insert into places (id, name_en, name_ja, lat, lng) values
  ('c1000000-0000-0000-0000-000000000001', 'Takano River N',   '高野川 北',   35.048381, 135.785238),
  ('c1000000-0000-0000-0000-000000000002', 'Takano River',     '高野川',      35.045061, 135.781440),
  ('c1000000-0000-0000-0000-000000000003', 'Takano River S',   '高野川 南',   35.040212, 135.777738),
  ('c1000000-0000-0000-0000-000000000004', 'Demachiyanagi E',  '出町柳 東',   35.036058, 135.775477),
  ('c1000000-0000-0000-0000-000000000005', 'Kamogawa Delta',   '鴨川デルタ',  35.031443, 135.772671),
  ('c1000000-0000-0000-0000-000000000006', 'Delta West',       'デルタ 西',   35.031443, 135.770417),
  ('c1000000-0000-0000-0000-000000000007', 'Demachiyanagi W',  '出町柳 西',   35.035668, 135.767987),
  ('c1000000-0000-0000-0000-000000000008', 'Kamo River S',     '賀茂川 南',   35.040283, 135.765281),
  ('c1000000-0000-0000-0000-000000000009', 'Kamo River',       '賀茂川',      35.044305, 135.762643),
  ('c1000000-0000-0000-0000-000000000010', 'Kamo River N',     '賀茂川 北',   35.047785, 135.760139),
  ('c1000000-0000-0000-0000-000000000011', 'Marutamachi',      '丸太町',      35.022069, 135.771467),
  ('c1000000-0000-0000-0000-000000000012', 'Nijo',             '二条',        35.017374, 135.771542),
  ('c1000000-0000-0000-0000-000000000013', 'Oike',             '御池',        35.013018, 135.771704),
  ('c1000000-0000-0000-0000-000000000014', 'Sanjo',            '三条',        35.009325, 135.771837),
  ('c1000000-0000-0000-0000-000000000015', 'Shijo',            '四条',        35.004573, 135.771736),
  ('c1000000-0000-0000-0000-000000000016', 'Gojo',             '五条',        34.996621, 135.768450)
on conflict (id) do nothing;
