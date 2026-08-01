-- Collecting a duck becomes "photograph the object where it stands".
--
-- The rally was a stamp card filled by scanning a printed QR. The duck objects
-- along the river now carry their own detail, so the object itself is the thing
-- to find and the photo is the proof. A collection entry shows the photo YOU
-- took, dated -- not a shared icon.
--
-- One action, two outcomes, which is what keeps the communal feed intact:
-- the photo always posts, and the stamp is granted only if you were actually
-- within range. Sharing a duck photo from anywhere still works; only presence
-- fills your own collection.
--
-- Same anti-cheat bar as scan_duck_spot: the distance is recomputed here from
-- whatever the client submits, so a bypassed client still fails. A photo is
-- weaker evidence than a QR (it could be a photo of a photo) but the geofence
-- requirement is unchanged -- "was really there", as before.

create function collect_duck_by_photo(
  p_duck_spot_id uuid,
  p_photo_url text,
  p_lat double precision,
  p_lng double precision
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_spot duck_spots%rowtype;
  v_distance double precision;
  v_collected boolean := false;
  v_already boolean := false;
  v_count integer;
  v_cert boolean;
begin
  if v_uid is null then
    return jsonb_build_object('status', 'unauthenticated');
  end if;

  select * into v_spot from duck_spots where id = p_duck_spot_id and active = true;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  -- The photo posts regardless of where you are: it's a contribution to that
  -- duck's shared feed, which predates the collection mechanic.
  insert into duck_posts (author_id, photo_url, duck_spot_id, lat, lng)
  values (v_uid, p_photo_url, v_spot.id, coalesce(p_lat, v_spot.lat), coalesce(p_lng, v_spot.lng));

  -- No location, no stamp. A null fix must fail closed here -- substituting the
  -- spot's own coordinates (which the client used to do) would hand every
  -- entry to anyone with location switched off.
  if p_lat is null or p_lng is null then
    return jsonb_build_object('status', 'posted', 'collected', false, 'reason', 'no_location');
  end if;

  -- Haversine in metres, matching scan_duck_spot (no PostGIS dependency).
  v_distance := 6371000 * 2 * asin(sqrt(
    power(sin(radians(p_lat - v_spot.lat) / 2), 2) +
    cos(radians(v_spot.lat)) * cos(radians(p_lat)) *
    power(sin(radians(p_lng - v_spot.lng) / 2), 2)
  ));

  if v_distance <= 120 then
    select exists(select 1 from stamps where user_id = v_uid and duck_spot_id = v_spot.id)
      into v_already;
    insert into stamps (user_id, duck_spot_id)
      values (v_uid, v_spot.id)
      on conflict (user_id, duck_spot_id) do nothing;
    v_collected := true;
  end if;

  select count(*) into v_count from stamps where user_id = v_uid;
  select exists(select 1 from certificates where user_id = v_uid) into v_cert;

  return jsonb_build_object(
    'status', 'posted',
    'collected', v_collected,
    'already', v_already,
    'distance', round(v_distance)::int,
    'spot_name_en', v_spot.name_en,
    'spot_name_ja', v_spot.name_ja,
    'stamp_count', v_count,
    'certificate_earned', v_cert
  );
end;
$$;

grant execute on function collect_duck_by_photo(uuid, text, double precision, double precision) to authenticated;

-- Direct inserts come out: the RPC is now the only way a duck photo is created,
-- so a photo can't be filed against a duck without the geofence having had its
-- say about whether it also counts as collected.
drop policy "users can insert their own duck posts" on duck_posts;
