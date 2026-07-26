-- Round-2 model change:
--   * places  -- each map marker is a PLACE, not a single main. During a
--     gathering many mains attach to a place; the map shows one marker per
--     place, so it never clutters no matter how busy a place gets.
--   * activities.place_id -- a main belongs to a place.
--   * sub cap 20 -> 10.
--   * a daily-rotating "gathering" event computed from the clock (no cron).
--   * duck_posts.duck_spot_id -- a duck photo belongs to a specific duck.

-- =========================================================================
-- places: fixed riverbank locations. Read-only to clients (like duck_spots);
-- the canonical set is seeded here so the app works immediately after a
-- `db push` (clients can't insert, so it can't live in the RLS-gated
-- seed.sql path alone).
-- =========================================================================
create table places (
  id uuid primary key default gen_random_uuid(),
  name_en text not null,
  name_ja text not null,
  lat double precision not null,
  lng double precision not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table places enable row level security;

create policy "places are publicly readable"
  on places for select
  using (true);

-- The ~8 fixed places down the busy Delta -> Shijo stretch. Fixed ids +
-- on-conflict so this is safe to re-run.
insert into places (id, name_en, name_ja, lat, lng) values
  ('b1000000-0000-0000-0000-000000000001', 'Kamogawa Delta',      '鴨川デルタ',   35.0300, 135.7720),
  ('b1000000-0000-0000-0000-000000000002', 'Demachiyanagi',       '出町柳',       35.0285, 135.7716),
  ('b1000000-0000-0000-0000-000000000003', 'Kojin Bridge',        '荒神橋',       35.0240, 135.7706),
  ('b1000000-0000-0000-0000-000000000004', 'Marutamachi Bridge',  '丸太町橋',     35.0180, 135.7700),
  ('b1000000-0000-0000-0000-000000000005', 'Nijo Bridge',         '二条大橋',     35.0130, 135.7705),
  ('b1000000-0000-0000-0000-000000000006', 'Oike Bridge',         '御池大橋',     35.0112, 135.7710),
  ('b1000000-0000-0000-0000-000000000007', 'Sanjo Bridge',        '三条大橋',     35.0100, 135.7715),
  ('b1000000-0000-0000-0000-000000000008', 'Shijo Bridge',        '四条大橋',     35.0035, 135.7715)
on conflict (id) do nothing;

-- =========================================================================
-- activities.place_id: a main belongs to a place; a sub inherits its
-- parent's place (resolved via parent_id, so its own place_id stays null).
-- NOT VALID so pre-existing place-less mains aren't rescanned, while every
-- NEW main is required to carry a place.
-- =========================================================================
alter table activities add column place_id uuid references places (id);
create index idx_activities_place_main on activities (place_id) where kind = 'main';

alter table activities
  add constraint main_requires_place check (kind <> 'main' or place_id is not null) not valid;

-- =========================================================================
-- Sub cap 20 -> 10: keep the 10 newest live subs per main, archive the rest.
-- Replaces the function from the initial schema (and the ordering fix in
-- 20260722150000). Descending + offset 10 keeps the recent ones live and
-- rolls older ones into the archive.
-- =========================================================================
create or replace function archive_oldest_subs_over_cap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.kind = 'sub' then
    update activities
    set archived = true
    where id in (
      select id from activities
      where parent_id = new.parent_id
        and kind = 'sub'
        and archived = false
      order by created_at desc
      offset 10
    );
  end if;
  return new;
end;
$$;

-- =========================================================================
-- ensure_todays_event: the "1-day gathering" is computed from the clock, no
-- cron. Upserts a deterministic event row for the current Kyoto day and
-- returns it, so the "mains only during an active event" gate always has a
-- live window and every main created today shares one event_id. The live
-- place board filters on that id; previous days' mains fall to the archive.
-- =========================================================================
create function ensure_todays_event()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_day date := (now() at time zone 'Asia/Tokyo')::date;
  v_id uuid := ('00000000-0000-0000-0000-' || to_char(v_day, 'YYYYMMDD') || '0000')::uuid;
  v_start timestamptz := (v_day::timestamp) at time zone 'Asia/Tokyo';
  v_end timestamptz := v_start + interval '1 day';
  v_name text := 'Kamogawa Gathering — ' || to_char(v_day, 'YYYY-MM-DD');
begin
  insert into events (id, name, starts_at, ends_at, active)
  values (v_id, v_name, v_start, v_end, true)
  on conflict (id) do update set
    active = true, starts_at = excluded.starts_at, ends_at = excluded.ends_at;

  return jsonb_build_object('id', v_id, 'name', v_name, 'starts_at', v_start, 'ends_at', v_end);
end;
$$;

grant execute on function ensure_todays_event() to authenticated;

-- =========================================================================
-- duck_posts.duck_spot_id: a duck photo now belongs to a specific duck spot
-- (its sub in the duck toukou graph). Nullable so old rows are unaffected.
-- =========================================================================
alter table duck_posts add column duck_spot_id uuid references duck_spots (id);
create index idx_duck_posts_spot on duck_posts (duck_spot_id);

-- Realtime: duck photos appear live in the duck graph, like activities do.
alter publication supabase_realtime add table duck_posts;
