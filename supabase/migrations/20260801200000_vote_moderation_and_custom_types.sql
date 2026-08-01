-- Voting becomes the board's moderation mechanism, and people can add their own
-- activity types.
--
-- The in-app report button and its reason picker are gone. In their place, a
-- post that collects enough dislikes takes itself off the board. That makes the
-- thumbs load-bearing rather than decorative -- but it also means there is no
-- longer a human between a group of annoyed users and someone else's post. See
-- the note on `hidden` below for why that shapes the implementation.

-- =========================================================================
-- Auto-hide at 10 dislikes.
--
-- Folded into the existing vote-count trigger rather than added as a second
-- one: it already runs SECURITY DEFINER on every insert/update/delete of
-- `votes`, and keeping the counts and the threshold in the same function means
-- they can never disagree about what the current tally is.
--
-- `hidden = true`, NOT a delete. Three reasons:
--   * every feed/map/archive query already filters `hidden`, so the post
--     vanishes everywhere with no new query logic;
--   * ten users can brigade any post they dislike, and a delete would be
--     irreversible with no record it ever existed -- the team can un-hide from
--     Studio after a look;
--   * a delete would cascade through the post's subs and votes.
--
-- Deliberately ONE-WAY: dropping back under the threshold does not un-hide.
-- Coming back should be a human decision, not something a vote can toggle.
--
-- (There is no DELETE policy on `activities` at all, so removal could never
-- have been done from the client regardless.)
-- =========================================================================
create or replace function refresh_activity_vote_counts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid := coalesce(new.activity_id, old.activity_id);
  v_dislikes integer;
begin
  update activities set
    likes = (select count(*) from votes where activity_id = target and value = 1),
    dislikes = (select count(*) from votes where activity_id = target and value = -1)
  where id = target
  returning dislikes into v_dislikes;

  if v_dislikes >= 10 then
    update activities set hidden = true where id = target and hidden = false;
  end if;

  return null;
end;
$$;

-- =========================================================================
-- More activity types, and the ability to add one.
-- =========================================================================
insert into activity_types (id, name_en, name_ja, color) values
  ('a1000000-0000-0000-0000-000000000006', 'Talking',   'おしゃべり', '#8E6E8C'),
  ('a1000000-0000-0000-0000-000000000007', 'Eating',    '食事',       '#C08552'),
  ('a1000000-0000-0000-0000-000000000008', 'Sketching', 'スケッチ',   '#5B8A8A'),
  ('a1000000-0000-0000-0000-000000000009', 'Exercise',  '運動',       '#7C8C5A'),
  ('a1000000-0000-0000-0000-00000000000a', 'Resting',   'ひと休み',   '#6E7FA0')
on conflict (id) do nothing;

alter table activity_types add column created_by uuid references profiles (id);

-- Still no direct client insert. Types go through the RPC below so the colour
-- comes from a closed palette -- a client that could insert freely would be
-- able to put an off-brand hex on the board, and §4.1 restricts the palette.
create function create_activity_type(p_name text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_name text := btrim(p_name);
  v_palette text[] := array[
    '#2e3a59', '#6e8ca0', '#7c8c5a', '#e0885e', '#d8c7a8',
    '#8e6e8c', '#c08552', '#5b8a8a', '#6e7fa0', '#a9834e'
  ];
  v_row activity_types%rowtype;
begin
  if v_uid is null then
    return jsonb_build_object('status', 'unauthenticated');
  end if;
  if v_name = '' or char_length(v_name) > 24 then
    return jsonb_build_object('status', 'invalid_name');
  end if;

  -- Reuse an existing type when the name already exists, so the picker doesn't
  -- fill up with near-duplicates that differ only by case or spacing.
  select * into v_row from activity_types
  where lower(name_en) = lower(v_name) or lower(name_ja) = lower(v_name)
  limit 1;

  if not found then
    -- Round-robin the palette by current row count. Colours therefore repeat
    -- once there are more than ten types; that's accepted (the palette is
    -- closed on purpose) and is why the seeded ten come first.
    insert into activity_types (name_en, name_ja, color, created_by)
    values (
      v_name,
      v_name, -- a name typed at post time only exists in the language it was typed in
      v_palette[(select count(*) from activity_types) % array_length(v_palette, 1) + 1],
      v_uid
    )
    returning * into v_row;
  end if;

  return jsonb_build_object(
    'status', 'ok',
    'id', v_row.id,
    'name_en', v_row.name_en,
    'name_ja', v_row.name_ja,
    'color', v_row.color
  );
end;
$$;

grant execute on function create_activity_type(text) to authenticated;
