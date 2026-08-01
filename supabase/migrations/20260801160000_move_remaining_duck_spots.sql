-- Moves the rest of the duck spots onto the water (see 20260801150000 for
-- Jujo, which came first). Sanjo, Shijo and Gojo were already on the river and
-- are deliberately untouched.
--
-- ⚠ GEOFENCE IMPACT. A duck spot's coordinates are also the centre that
-- `scan_duck_spot` measures against, within ~120 m. How far each moves:
--
--     Delta            41 m   within range
--     Nijo            115 m   within range (only just)
--     Marutamachi     208 m   OUT OF RANGE
--     Shichijo        224 m   OUT OF RANGE
--     Kitayama        249 m   OUT OF RANGE
--     Jujo            253 m   OUT OF RANGE  (applied in 20260801150000)
--     Demachiyanagi   349 m   OUT OF RANGE
--
-- For the five out-of-range spots, a person standing where the QR currently is
-- can no longer collect that stamp. Either the printed QR moves to the new
-- coordinate, or the 120 m radius in `scan_duck_spot` widens. Nothing here
-- changes the radius — that would weaken the anti-cheat for all ten spots to
-- solve a placement problem at five.

update duck_spots as d set lat = v.lat, lng = v.lng
from (values
  ('d1000000-0000-0000-0000-000000000001'::uuid, 35.029694, 135.771750), -- Kamogawa Delta
  ('d1000000-0000-0000-0000-000000000002'::uuid, 35.026361, 135.771556), -- Demachiyanagi
  ('d1000000-0000-0000-0000-000000000003'::uuid, 35.043139, 135.763278), -- Kitayama
  ('d1000000-0000-0000-0000-000000000004'::uuid, 35.019361, 135.771556), -- Marutamachi
  ('d1000000-0000-0000-0000-000000000005'::uuid, 35.013444, 135.771639), -- Nijo
  ('d1000000-0000-0000-0000-000000000009'::uuid, 34.989750, 135.767222)  -- Shichijo
) as v(id, lat, lng)
where d.id = v.id;

-- Keep every linked place on top of its duck spot.
update places p
set lat = d.lat, lng = d.lng
from duck_spots d
where p.duck_spot_id = d.id;
