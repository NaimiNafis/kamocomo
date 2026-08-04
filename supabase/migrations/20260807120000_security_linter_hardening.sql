-- Supabase's linter (Advisors) flagged two real gaps, both about the gap
-- between "who this was written for" and "who Postgres actually lets in".
--
-- Every SECURITY DEFINER function in this schema keeps Postgres's default
-- `EXECUTE ... TO PUBLIC` grant -- the `grant execute ... to authenticated`
-- lines scattered across earlier migrations were additive, never a
-- replacement, so the bare `anon` role (unauthenticated, no session at all)
-- has been able to call every one of them the whole time. Four are trigger
-- functions nothing should ever call directly; the other five are meant for
-- authenticated (incl. anonymous-signed-in) callers only. Revoke the PUBLIC
-- grant on all nine so `anon` is actually shut out, not just conventionally
-- avoided.
--
-- The `photos` storage bucket has the same shape of problem: it's public
-- (serves objects at /storage/v1/object/public/... with no RLS check at
-- all), but a SELECT policy on storage.objects on top of that also opens
-- the bucket-listing API, letting anyone enumerate every filename that's
-- ever been uploaded. Nothing in the app calls `.list()` -- only `.upload()`
-- and `.getPublicUrl()` -- so the policy was buying nothing but exposure.

-- =========================================================================
-- Storage: drop the listing-capable SELECT policy. getPublicUrl() keeps
-- working -- that's the bucket's public flag, not this policy.
-- =========================================================================
drop policy "photos are publicly readable" on storage.objects;

-- =========================================================================
-- Trigger-only functions: never called directly (Postgres refuses to invoke
-- a `returns trigger` function outside of trigger firing, and firing itself
-- doesn't check the invoking role's EXECUTE grant), so revoke-only with no
-- replacement grant.
-- =========================================================================
revoke execute on function archive_oldest_subs_over_cap() from public;
revoke execute on function refresh_activity_vote_counts() from public;
revoke execute on function refresh_duck_post_vote_counts() from public;
revoke execute on function issue_certificate_when_complete() from public;

-- =========================================================================
-- RPC functions: revoke PUBLIC, keep the existing authenticated grant.
-- Anonymous-signed-in users (this app's only kind of user) are unaffected;
-- only a caller with no session at all loses access.
-- =========================================================================
revoke execute on function create_activity_type(text) from public;
revoke execute on function delete_activity_type(uuid) from public;
revoke execute on function ensure_todays_event() from public;
revoke execute on function scan_duck_spot(text, double precision, double precision) from public;
revoke execute on function collect_duck_by_photo(uuid, text, double precision, double precision) from public;

-- =========================================================================
-- ensure_todays_event: the one RPC in the schema with no auth.uid() check
-- in its body -- every sibling (scan_duck_spot, collect_duck_by_photo,
-- create_activity_type, delete_activity_type) fails closed on a null uid.
-- The revoke above already blocks the bare anon role at the grant level,
-- but bring the function itself in line so the check doesn't depend only on
-- grants staying correct.
-- =========================================================================
create or replace function ensure_todays_event()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_day date := (now() at time zone 'Asia/Tokyo')::date;
  v_id uuid := ('00000000-0000-0000-0000-' || to_char(v_day, 'YYYYMMDD') || '0000')::uuid;
  v_start timestamptz := (v_day::timestamp) at time zone 'Asia/Tokyo';
  v_end timestamptz := v_start + interval '1 day';
  v_name text := 'Kamogawa Gathering — ' || to_char(v_day, 'YYYY-MM-DD');
begin
  if v_uid is null then
    return jsonb_build_object('status', 'unauthenticated');
  end if;

  insert into events (id, name, starts_at, ends_at, active)
  values (v_id, v_name, v_start, v_end, true)
  on conflict (id) do update set
    active = true, starts_at = excluded.starts_at, ends_at = excluded.ends_at;

  return jsonb_build_object('id', v_id, 'name', v_name, 'starts_at', v_start, 'ends_at', v_end);
end;
$$;

grant execute on function ensure_todays_event() to authenticated;
