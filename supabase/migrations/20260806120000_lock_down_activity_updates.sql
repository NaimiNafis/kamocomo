-- Close the hole that let an author rewrite their own post's moderation state.
--
-- `users can update their own activities` scoped updates by author but said
-- nothing about WHICH columns, and every rule this app calls server-authoritative
-- lives in a column on that row. Signed in as an ordinary anonymous visitor,
-- with nothing but the anon key, all of this worked on a post of my own:
--
--   update activities set likes = 9999      -- the vote count, and with it the
--                                              card's shape and ring
--   update activities set dislikes = 0      -- erase disapproval
--   update activities set hidden = false    -- UN-HIDE a post the 10-dislike
--                                              trigger had hidden
--   update activities set archived = false  -- climb back out of the archive,
--                                              past the 10-sub cap
--   update activities set parent_id = ...   -- re-parent onto another main
--   update activities set place_id = ...    -- move it to another place
--
-- The last two are untidy; the middle two are the problem. CLAUDE.md §5 says
-- voting REPLACED reporting -- ten dislikes hides a post, one-way, and coming
-- back is a human decision in Studio. A one-way rule the author can reverse
-- with a single request isn't a rule.
--
-- The fix is to drop the policy outright rather than narrow it. The client
-- never updates an activity: it inserts them and votes on them, and the counts
-- are maintained by refresh_activity_vote_counts, which is SECURITY DEFINER and
-- unaffected by this. Editing a post isn't a feature that exists, so no
-- legitimate call loses anything -- and if editing is ever added, it should
-- arrive as a narrow grant on (phrase, photo_url), not as a door standing open
-- in the meantime.

drop policy "users can update their own activities" on activities;

-- Belt and braces: even with no policy, a future permissive policy added
-- carelessly would inherit the table-level UPDATE grant Supabase gives
-- `authenticated` by default. Take the grant down to the two columns that
-- could ever sensibly be edited, so the blast radius is bounded by the grant
-- and not only by whoever writes the next policy.
revoke update on activities from authenticated;
grant update (phrase, photo_url) on activities to authenticated;

-- Same shape of problem, much smaller stakes: qr_entries accepted any string
-- from anyone as a with-check of `true`, so the scan counter would take a
-- megabyte of junk as happily as a spot name.
--
-- Bounded by length rather than matched against duck_spots.qr_token, which was
-- the first instinct: the documented QR-entry route is `/?from=qr&spot=<slug>`,
-- there is no slug column, and nothing generates those codes yet -- only
-- `/duck/scan?spot=<qr_token>`. Pinning the check to tokens today would
-- silently reject slug codes tomorrow, and `logQrEntry` swallows its errors, so
-- the breakage would be invisible. Tighten this to an exists() against
-- duck_spots once the slug scheme is settled.
drop policy "anyone can log a qr entry" on qr_entries;

create policy "qr entries carry a plausible spot name"
  on qr_entries for insert
  to authenticated
  with check (length(spot_slug) between 1 and 64);
