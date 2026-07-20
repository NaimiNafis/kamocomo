-- Phase 8 (§5.7, Appendix A.2b): server-authoritative duck-spot stamp scans.
--
-- The whole anti-cheat rests on the geofence being enforced server-side. The
-- initial schema let users insert their own `stamps` rows directly, which
-- would let a hacked client grant itself every stamp without ever being at
-- the river. So: drop that direct-insert path and make a SECURITY DEFINER
-- RPC the *only* way to earn a stamp -- it re-looks-up the spot, recomputes
-- the distance from the reported location, and inserts only within 120 m.

-- =========================================================================
-- Remove the direct client insert path on stamps.
-- (SELECT of your own stamps stays; the certificate trigger from the initial
-- schema still fires on the RPC's insert.)
-- =========================================================================
drop policy "users can insert their own stamps" on stamps;

-- =========================================================================
-- scan_duck_spot: validate token + geofence, then award the stamp.
-- Returns a JSON result the client renders (§A.2b state machine):
--   unauthenticated | not_found | too_far | already | collected
-- plus the spot name, the user's stamp count, and whether the 10-stamp
-- certificate is now issued (by the existing AFTER INSERT trigger).
-- =========================================================================
create function scan_duck_spot(p_token text, p_lat double precision, p_lng double precision)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_spot duck_spots%rowtype;
  v_distance double precision;
  v_already boolean;
  v_count integer;
  v_cert boolean;
begin
  if v_uid is null then
    return jsonb_build_object('status', 'unauthenticated');
  end if;

  select * into v_spot from duck_spots where qr_token = p_token and active = true;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  -- Haversine distance in metres (no PostGIS/earthdistance dependency).
  v_distance := 6371000 * 2 * asin(sqrt(
    power(sin(radians(p_lat - v_spot.lat) / 2), 2) +
    cos(radians(v_spot.lat)) * cos(radians(p_lat)) *
    power(sin(radians(p_lng - v_spot.lng) / 2), 2)
  ));

  if v_distance > 120 then
    return jsonb_build_object(
      'status', 'too_far',
      'distance', round(v_distance)::int,
      'spot_name_en', v_spot.name_en,
      'spot_name_ja', v_spot.name_ja
    );
  end if;

  select exists(select 1 from stamps where user_id = v_uid and duck_spot_id = v_spot.id)
    into v_already;

  insert into stamps (user_id, duck_spot_id)
    values (v_uid, v_spot.id)
    on conflict (user_id, duck_spot_id) do nothing;

  select count(*) into v_count from stamps where user_id = v_uid;
  select exists(select 1 from certificates where user_id = v_uid) into v_cert;

  return jsonb_build_object(
    'status', case when v_already then 'already' else 'collected' end,
    'spot_name_en', v_spot.name_en,
    'spot_name_ja', v_spot.name_ja,
    'duck_spot_id', v_spot.id,
    'stamp_count', v_count,
    'certificate_earned', v_cert
  );
end;
$$;

grant execute on function scan_duck_spot(text, double precision, double precision) to authenticated;

-- =========================================================================
-- qr_entries: analytics for the photogenic-spot app-entry QR (§A.2a). Any
-- authenticated (incl. anonymous) visitor can log an entry; only the team
-- reads it (via service role -- no client select policy).
-- =========================================================================
create table qr_entries (
  id uuid primary key default gen_random_uuid(),
  spot_slug text not null,
  created_at timestamptz not null default now()
);

alter table qr_entries enable row level security;

create policy "anyone can log a qr entry"
  on qr_entries for insert
  to authenticated
  with check (true);
