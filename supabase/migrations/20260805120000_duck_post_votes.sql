-- Voting on duck photos, mirroring what activities already have.
--
-- The duck board is about to gain the toukou board's interactions: hold a photo
-- to see it in full, and say whether you liked it. `votes.activity_id` is a
-- foreign key to `activities`, so duck photos can't share that table -- they
-- get their own, shaped identically, rather than a second design.
--
-- The moderation rule comes with it. Ten dislikes hides a photo, one-way, the
-- same as CLAUDE.md §5 describes for posts: voting replaced reporting, and
-- coming back is a human decision in Studio rather than something a vote can
-- toggle. Duck photos were the one user-submitted surface that rule didn't
-- reach.

alter table duck_posts
  add column likes integer not null default 0,
  add column dislikes integer not null default 0;

create table duck_post_votes (
  user_id uuid not null references profiles (id) on delete cascade,
  duck_post_id uuid not null references duck_posts (id) on delete cascade,
  value smallint not null check (value in (1, -1)),
  primary key (user_id, duck_post_id)
);

alter table duck_post_votes enable row level security;

-- Public read: the board shows everyone's counts, and your own vote has to be
-- readable to render as cast.
create policy "duck post votes are publicly readable"
  on duck_post_votes for select
  using (true);

create policy "users can insert their own duck post votes"
  on duck_post_votes for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "users can update their own duck post votes"
  on duck_post_votes for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "users can delete their own duck post votes"
  on duck_post_votes for delete
  to authenticated
  using (user_id = auth.uid());

-- Counts are recomputed from the rows rather than incremented, so a retried
-- write or a vote changed from like to dislike can't drift them.
create function refresh_duck_post_vote_counts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid := coalesce(new.duck_post_id, old.duck_post_id);
  v_dislikes integer;
begin
  update duck_posts set
    likes = (select count(*) from duck_post_votes where duck_post_id = target and value = 1),
    dislikes = (select count(*) from duck_post_votes where duck_post_id = target and value = -1)
  where id = target
  returning dislikes into v_dislikes;

  if v_dislikes >= 10 then
    update duck_posts set hidden = true where id = target and hidden = false;
  end if;

  return null;
end;
$$;

create trigger trg_refresh_duck_post_vote_counts
after insert or update or delete on duck_post_votes
for each row
execute function refresh_duck_post_vote_counts();

create index duck_post_votes_post_idx on duck_post_votes (duck_post_id);
