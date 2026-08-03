-- Let people take back an activity type they added.
--
-- `create_activity_type` gave the composer a "+" but no way out, so a typo or a
-- second thought left a permanent entry in a picker everyone sees.
--
-- Deliberately narrow. You can only remove a type you created yourself, and
-- only while nothing has been posted with it: a type that already has
-- activities is part of the record, and deleting it would either orphan them or
-- take them with it. Both are worse than a slightly untidy picker.

create function delete_activity_type(p_id uuid)
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

  -- Seeded types have no creator, so this also stops anyone deleting those.
  if v_row.created_by is distinct from v_uid then
    return jsonb_build_object('status', 'not_yours');
  end if;

  select count(*) into v_uses from activities where activity_type = p_id;
  if v_uses > 0 then
    return jsonb_build_object('status', 'in_use', 'uses', v_uses);
  end if;

  delete from activity_types where id = p_id;
  return jsonb_build_object('status', 'deleted');
end;
$$;

grant execute on function delete_activity_type(uuid) to authenticated;
