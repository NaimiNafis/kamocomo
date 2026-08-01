-- Round-3 model change: one marker type on the map.
--
-- Before this, the map carried two marker sets — 16 activity `places` drawn as
-- exclamation marks, plus 10 `duck_spots` drawn as ducks. 26 markers over a
-- narrow strip of river, which read as clutter and made taps ambiguous.
--
-- After: a place IS a duck spot. Each of the 10 duck spots gets exactly one
-- place, so the map shows 10 duck markers and each one opens a combined board
-- (the duck in the middle, that spot's main activities orbiting it).
--
-- Deliberately NOT done as a merge of the two tables. `activities.place_id`
-- carries a foreign key and a NOT VALID check constraint, and `duck_posts`,
-- `stamps` and the printed QR tokens all hang off `duck_spots` — repointing
-- either side would ripple through the stamp rally, which is physically
-- deployed. Linking instead keeps every existing row and every printed QR
-- code valid.
--
-- The previous 16 places are deactivated, not deleted: their activities stay
-- readable in the archive, which is the whole point of the archive.

-- =========================================================================
-- places.duck_spot_id — which duck this place is. UNIQUE so the mapping stays
-- 1:1 and the insert below can be re-run safely.
-- =========================================================================
alter table places add column duck_spot_id uuid unique references duck_spots (id);

-- =========================================================================
-- Retire the previous marker set (the 16 from 20260727120000 and the 8 from
-- 20260723120000). Their activities remain non-hidden and non-archived, so
-- they still show in the archive grid and their history stays browsable.
-- =========================================================================
update places set active = false where duck_spot_id is null;

-- =========================================================================
-- One place per active duck spot, co-located with it and inheriting its name.
--
-- Selected FROM duck_spots rather than hardcoded, because duck_spots ships in
-- seed.sql (not a migration) and its ids are only fixed if that seed ran. This
-- adapts to whatever spots actually exist, and ON CONFLICT makes it idempotent.
-- =========================================================================
insert into places (name_en, name_ja, lat, lng, duck_spot_id, active)
select d.name_en, d.name_ja, d.lat, d.lng, d.id, true
from duck_spots d
where d.active = true
on conflict (duck_spot_id) do update set
  active = true,
  lat = excluded.lat,
  lng = excluded.lng;

create index idx_places_duck_spot on places (duck_spot_id) where active;
