-- Fix: archive_oldest_subs_over_cap() (20260720120000_initial_schema.sql)
-- archived the *newest* overflow sub instead of the oldest one.
--
-- `order by created_at asc offset 20` (ascending, no limit) skips the first
-- 20 rows -- the 20 OLDEST -- and returns everything after them, which is the
-- tail of an oldest-first ordering: the newest rows. So each time a main
-- crossed 20 live subs, the trigger archived the post that had just been
-- created, not the stalest one -- the opposite of "See earlier posts"
-- rolling old activity into the archive while recent posts stay live.
--
-- Ordering descending instead (newest first) and skipping the first 20
-- keeps the 20 most recent live and archives everything older, which is
-- what the original comment and the UI both intend.
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
      offset 20
    );
  end if;
  return new;
end;
$$;
