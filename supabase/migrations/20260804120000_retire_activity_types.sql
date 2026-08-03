-- Make "remove this activity type" work even after you've posted with it.
--
-- The previous version refused any type that had activities attached, on the
-- reasoning that the type is part of their record. That reasoning still holds,
-- but the refusal was the wrong conclusion: the normal way to get a custom type
-- is to add it *while posting*, so by the time you want it gone it always has
-- exactly one post -- yours -- and the composer just silently declined.
--
-- So removal now means two different things depending on the situation, and
-- both look the same from the picker:
--
--   nothing posted with it  -> delete the row outright
--   something posted with it -> retire it: keep the row so existing posts keep
--                               their name and colour, but stop offering it
--
-- Retiring is one-way from the app. Un-retiring is a Studio decision, like
-- un-hiding a post.

alter table activity_types
  add column retired boolean not null default false;

-- Existing posts still join to retired rows, so nothing needs a filter except
-- the picker (see fetchActivityTypes).
create index activity_types_active_idx on activity_types (retired) where retired = false;

create or replace function delete_activity_type(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row activity_types%rowtype;
  v_uses integer;
begin
  if v_uid is null then
    return jsonb_build_object('status', 'unauthenticated');
  end if;

  select * into v_row from activity_types where id = p_id;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  -- Seeded types have no creator, so this also stops anyone removing those.
  if v_row.created_by is distinct from v_uid then
    return jsonb_build_object('status', 'not_yours');
  end if;

  if v_row.retired then
    return jsonb_build_object('status', 'retired');
  end if;

  select count(*) into v_uses from activities where activity_type = p_id;
  if v_uses > 0 then
    update activity_types set retired = true where id = p_id;
    return jsonb_build_object('status', 'retired', 'uses', v_uses);
  end if;

  delete from activity_types where id = p_id;
  return jsonb_build_object('status', 'deleted');
end;
$$;

grant execute on function delete_activity_type(uuid) to authenticated;
