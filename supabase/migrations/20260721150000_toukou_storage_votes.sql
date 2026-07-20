-- Phase 6 (§5.5, Appendix A.1): the toukou map needs photo uploads, a live
-- like/dislike counter, and realtime vote updates.

-- =========================================================================
-- Storage: a public "photos" bucket for activity + duck-post images.
-- Public read (photos are shown to everyone); writes limited to the
-- authenticated owner's own top-level folder (<uid>/...).
-- =========================================================================
insert into storage.buckets (id, name, public)
values ('photos', 'photos', true)
on conflict (id) do nothing;

create policy "photos are publicly readable"
  on storage.objects for select
  using (bucket_id = 'photos');

create policy "users upload photos to their own folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "users update their own photos"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "users delete their own photos"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- =========================================================================
-- Vote counters: keep activities.likes/dislikes in sync with the votes table
-- (the denormalized counters promised in the initial schema). SECURITY
-- DEFINER because it updates an activities row owned by a different user,
-- which the author-only update RLS would otherwise block.
-- =========================================================================
create function refresh_activity_vote_counts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid := coalesce(new.activity_id, old.activity_id);
begin
  update activities set
    likes = (select count(*) from votes where activity_id = target and value = 1),
    dislikes = (select count(*) from votes where activity_id = target and value = -1)
  where id = target;
  return null;
end;
$$;

create trigger trg_refresh_vote_counts
after insert or update or delete on votes
for each row
execute function refresh_activity_vote_counts();

-- =========================================================================
-- Realtime: vote changes appear live on the toukou map (§5.5). activities is
-- already in the publication from the Phase 5 migration.
-- =========================================================================
alter publication supabase_realtime add table votes;
