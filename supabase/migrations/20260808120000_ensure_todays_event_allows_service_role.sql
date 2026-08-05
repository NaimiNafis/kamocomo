-- Fixes a regression from 20260807120000.
--
-- That migration gave ensure_todays_event() the `auth.uid() is null` guard its
-- sibling RPCs have. The intent was right and the test was wrong: `auth.uid()`
-- is null for a caller with no session, but it is ALSO null for the service
-- role, which has no user to speak of and is exactly what the seed scripts and
-- any other server-side tooling connect as.
--
-- So the function started returning `{"status":"unauthenticated"}` to the
-- seeds. They read `event.id` off that, got undefined, and every main they
-- inserted failed `main_requires_event` -- a constraint violation a long way
-- from the actual cause.
--
-- The guard now asks what it meant to ask: reject callers who are not signed
-- in, where "not signed in" means the anon role rather than merely lacking a
-- uid. The service role is trusted by definition -- it bypasses RLS entirely,
-- so refusing it here bought nothing anyway.
--
-- Worth remembering that the grant is the real control: 20260807140000 revoked
-- EXECUTE from anon by name, so an unauthenticated client cannot reach this
-- function at all. The check below is the second lock, not the first.

create or replace function ensure_todays_event()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_role text := coalesce(auth.role(), '');
  v_day date := (now() at time zone 'Asia/Tokyo')::date;
  v_id uuid := ('00000000-0000-0000-0000-' || to_char(v_day, 'YYYYMMDD') || '0000')::uuid;
  v_start timestamptz := (v_day::timestamp) at time zone 'Asia/Tokyo';
  v_end timestamptz := v_start + interval '1 day';
  v_name text := 'Kamogawa Gathering — ' || to_char(v_day, 'YYYY-MM-DD');
begin
  if v_uid is null and v_role <> 'service_role' then
    return jsonb_build_object('status', 'unauthenticated');
  end if;

  insert into events (id, name, starts_at, ends_at, active)
  values (v_id, v_name, v_start, v_end, true)
  on conflict (id) do update set
    active = true, starts_at = excluded.starts_at, ends_at = excluded.ends_at;

  return jsonb_build_object('id', v_id, 'name', v_name, 'starts_at', v_start, 'ends_at', v_end);
end;
$$;

revoke execute on function ensure_todays_event() from public, anon;
grant execute on function ensure_todays_event() to authenticated;
