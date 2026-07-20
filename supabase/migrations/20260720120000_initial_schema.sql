-- Virtual Kamogawa — initial schema (architecture doc §7, Appendix A.1)
-- RLS pattern throughout: anyone can read non-hidden/public rows; a user can
-- only write rows where the owning id column = auth.uid(). Tables with no
-- app-facing writes (activity_types, events, duck_spots) get a read policy
-- only — they're managed via Supabase Studio / seed data (service_role
-- bypasses RLS), never by the client.

create extension if not exists pgcrypto;

-- =========================================================================
-- profiles
-- =========================================================================
create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nationality text,
  age_range text,
  gender text,
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

create policy "profiles are publicly readable"
  on profiles for select
  using (true);

create policy "users can insert their own profile"
  on profiles for insert
  to authenticated
  with check (id = auth.uid());

create policy "users can update their own profile"
  on profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- =========================================================================
-- activity_types (seed data only — writing, reading, walking, music, yoga)
-- =========================================================================
create table activity_types (
  id uuid primary key default gen_random_uuid(),
  name_en text not null,
  name_ja text not null,
  color text not null
);

alter table activity_types enable row level security;

create policy "activity types are publicly readable"
  on activity_types for select
  using (true);

-- =========================================================================
-- events (windows when main activities can be created — Appendix A.1)
-- =========================================================================
create table events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  active boolean not null default false
);

alter table events enable row level security;

create policy "events are publicly readable"
  on events for select
  using (true);

-- =========================================================================
-- activities (both 'main' and 'sub' posts)
-- =========================================================================
create table activities (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('main', 'sub')),
  parent_id uuid references activities (id) on delete cascade,
  activity_type uuid not null references activity_types (id),
  event_id uuid references events (id),
  author_id uuid not null references profiles (id),
  photo_url text,
  phrase text,
  lat double precision not null,
  lng double precision not null,
  likes integer not null default 0,
  dislikes integer not null default 0,
  archived boolean not null default false,
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  constraint main_requires_event check (kind <> 'main' or event_id is not null),
  constraint main_has_no_parent check (kind <> 'main' or parent_id is null),
  constraint sub_requires_parent check (kind <> 'sub' or parent_id is not null)
);

create index idx_activities_parent_sub on activities (parent_id) where kind = 'sub';
create index idx_activities_event on activities (event_id);

alter table activities enable row level security;

create policy "activities are publicly readable when not hidden"
  on activities for select
  using (not hidden);

create policy "users can insert their own activities"
  on activities for insert
  to authenticated
  with check (author_id = auth.uid());

-- Restrictive: AND'd on top of every permissive insert policy above, so a
-- forged main can't sneak through even if some other permissive policy
-- would otherwise allow the insert (Appendix A.1's server-side guard).
create policy "mains only during an active event"
  on activities as restrictive
  for insert
  to authenticated
  with check (
    kind <> 'main'
    or exists (
      select 1 from events e
      where e.id = activities.event_id
        and now() between e.starts_at and e.ends_at
    )
  );

create policy "users can update their own activities"
  on activities for update
  to authenticated
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

-- Note: likes/dislikes on this table are denormalized counters. The trigger
-- that keeps them in sync with `votes` lands in Phase 6 alongside the
-- voting UI, rather than here.

-- =========================================================================
-- votes (one row per user per activity; switching like<->dislike updates it)
-- =========================================================================
create table votes (
  user_id uuid not null references profiles (id) on delete cascade,
  activity_id uuid not null references activities (id) on delete cascade,
  value smallint not null check (value in (1, -1)),
  primary key (user_id, activity_id)
);

alter table votes enable row level security;

create policy "votes are publicly readable"
  on votes for select
  using (true);

create policy "users can insert their own votes"
  on votes for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "users can update their own votes"
  on votes for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "users can delete their own votes"
  on votes for delete
  to authenticated
  using (user_id = auth.uid());

-- =========================================================================
-- duck_posts (social feed, decoupled from stamps)
-- =========================================================================
create table duck_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references profiles (id),
  photo_url text not null,
  lat double precision not null,
  lng double precision not null,
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);

alter table duck_posts enable row level security;

create policy "duck posts are publicly readable when not hidden"
  on duck_posts for select
  using (not hidden);

create policy "users can insert their own duck posts"
  on duck_posts for insert
  to authenticated
  with check (author_id = auth.uid());

-- =========================================================================
-- reports (moderation; team reviews via Supabase Studio using service_role,
-- so there is deliberately no client-facing select policy)
-- =========================================================================
create table reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references profiles (id),
  target_type text not null check (target_type in ('activity', 'duck_post')),
  target_id uuid not null,
  reason text,
  created_at timestamptz not null default now(),
  unique (reporter_id, target_type, target_id)
);

alter table reports enable row level security;

create policy "users can insert their own reports"
  on reports for insert
  to authenticated
  with check (reporter_id = auth.uid());

-- =========================================================================
-- duck_spots (physical QR locations for the stamp hunt; seed data only)
-- =========================================================================
create table duck_spots (
  id uuid primary key default gen_random_uuid(),
  name_en text not null,
  name_ja text not null,
  lat double precision not null,
  lng double precision not null,
  qr_token text not null unique,
  active boolean not null default true
);

alter table duck_spots enable row level security;

create policy "duck spots are publicly readable"
  on duck_spots for select
  using (true);

-- =========================================================================
-- stamps (one row per user per spot scanned; owner-only reads — no public
-- leaderboard/visibility feature exists, so this narrows past the general
-- "anyone can read" default in favor of least privilege)
-- =========================================================================
create table stamps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  duck_spot_id uuid not null references duck_spots (id) on delete cascade,
  earned_at timestamptz not null default now(),
  unique (user_id, duck_spot_id)
);

create index idx_stamps_user on stamps (user_id);

alter table stamps enable row level security;

create policy "users can read their own stamps"
  on stamps for select
  to authenticated
  using (user_id = auth.uid());

create policy "users can insert their own stamps"
  on stamps for insert
  to authenticated
  with check (user_id = auth.uid());

-- =========================================================================
-- certificates (issued only by the trigger below, never by client insert)
-- =========================================================================
create table certificates (
  user_id uuid primary key references profiles (id) on delete cascade,
  issued_at timestamptz not null default now()
);

alter table certificates enable row level security;

create policy "users can read their own certificate"
  on certificates for select
  to authenticated
  using (user_id = auth.uid());

-- =========================================================================
-- Trigger: sub cap = 20 -> archive the oldest overflow subs
-- =========================================================================
create function archive_oldest_subs_over_cap()
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
      order by created_at asc
      offset 20
    );
  end if;
  return new;
end;
$$;

create trigger trg_archive_oldest_subs
after insert on activities
for each row
execute function archive_oldest_subs_over_cap();

-- =========================================================================
-- Trigger: 10 distinct stamps -> issue a certificate
-- =========================================================================
create function issue_certificate_at_ten_stamps()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  stamp_count integer;
begin
  select count(*) into stamp_count
  from stamps
  where user_id = new.user_id;

  if stamp_count >= 10 then
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
execute function issue_certificate_at_ten_stamps();
