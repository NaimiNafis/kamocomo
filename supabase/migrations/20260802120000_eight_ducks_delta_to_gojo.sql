-- Eight ducks, all between the Delta and Gojo.
--
-- That stretch is what people mean by the Kamogawa: north of the Delta it's the
-- Takano and Kamo branches, and south of Gojo it stops being the part anyone
-- walks. The rally was spread over ten spots reaching well outside it.
--
-- The QR tokens are deliberately untouched. A code encodes
-- /duck/scan?spot=<qr_token>, and the token lives on the row -- so moving or
-- renaming a spot leaves every printed code valid. Only the PNG *filenames*
-- (derived from name_en) go stale; re-running scripts/generate-qr.ts produces
-- correctly-named files containing the identical codes.
--
-- Rows 0001-0008 were already Delta, Demachiyanagi, Kitayama, Marutamachi,
-- Nijo, Sanjo, Shijo, Gojo, and seven of those are already on the water from
-- the earlier coordinate pass. So this only has to move one spot and retire two.

-- =========================================================================
-- Kitayama sat north of the Delta. It becomes Kojin Bridge, which fills the
-- widest remaining gap in the stretch -- ~780 m between Demachiyanagi and
-- Marutamachi, twice any other.
--
-- Its position is the midpoint of those two neighbours rather than a guess at
-- where the bridge is: both sit on lng 135.771556 and the river runs straight
-- between them, so a point on that line is on the water. Worth eyeballing on
-- the map anyway -- that's how the last set of coordinates turned out to be on
-- roads.
-- =========================================================================
update duck_spots set
  name_en = 'Kojin Bridge',
  name_ja = '荒神橋',
  lat = 35.022861,
  lng = 135.771556
where id = 'd1000000-0000-0000-0000-000000000003';

-- =========================================================================
-- Shichijo and Jujo are both south of Gojo. Deactivated rather than deleted:
-- their rows keep their tokens, so bringing either back later is one UPDATE
-- and needs no new QR code.
-- =========================================================================
update duck_spots set active = false
where id in (
  'd1000000-0000-0000-0000-000000000009', -- Shichijo
  'd1000000-0000-0000-0000-000000000010'  -- Jujo
);

-- Places mirror their duck spot, so name and position have to follow or the map
-- marker and the collection entry disagree about what a duck is called.
update places p set
  name_en = d.name_en,
  name_ja = d.name_ja,
  lat = d.lat,
  lng = d.lng,
  active = d.active
from duck_spots d
where p.duck_spot_id = d.id;

-- =========================================================================
-- The certificate was hardcoded at ten stamps, which with eight spots would
-- have made it unreachable -- a silently broken reward rather than a visible
-- error.
--
-- Rewritten to require every ACTIVE spot, so the count is never hardcoded
-- again and changing the rally's size can't break it. Stamps on retired spots
-- deliberately don't count: someone who collected Jujo before it was retired
-- shouldn't be a stamp closer to a certificate covering a different set.
--
-- Replaced rather than edited in place because the old name said "at_ten",
-- which would have become a lie.
-- =========================================================================
drop trigger trg_issue_certificate on stamps;
drop function issue_certificate_at_ten_stamps();

create function issue_certificate_when_complete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_required integer;
  v_earned integer;
begin
  select count(*) into v_required from duck_spots where active;

  select count(*) into v_earned
  from stamps s
  join duck_spots d on d.id = s.duck_spot_id
  where s.user_id = new.user_id and d.active;

  if v_required > 0 and v_earned >= v_required then
    insert into certificates (user_id)
    values (new.user_id)
    on conflict (user_id) do nothing;
  end if;

  return new;
end;
$$;

create trigger trg_issue_certificate
after insert on stamps
for each row
execute function issue_certificate_when_complete();
