-- Round two on the SECURITY DEFINER grant hardening from 20260807120000.
--
-- That migration revoked EXECUTE from `public` on all nine functions, but
-- the linter still flagged every one of them as anon-callable afterward.
-- Reason: Supabase provisions every project with schema-level default
-- privileges that grant EXECUTE on functions in `public` directly to
-- `anon`, `authenticated`, and `service_role` -- not just to `PUBLIC`. A
-- direct per-role grant isn't touched by revoking from `PUBLIC`; `anon`
-- has to be named explicitly. (Confirmed by contrast: the storage-policy
-- half of that migration -- dropping the listing-capable SELECT policy --
-- took effect immediately, because policies aren't grants and don't have
-- this default-privileges wrinkle.)
--
-- This migration finishes the job: revoke from `anon` by name everywhere,
-- and from `authenticated` too on the four trigger-only functions, which no
-- legitimate caller should ever invoke directly regardless of role. The
-- five RPC functions keep their `grant execute ... to authenticated` from
-- earlier migrations, so real app usage (always running as `authenticated`
-- -- anonymous sign-in still issues a full authenticated-role session) is
-- unaffected.

-- =========================================================================
-- Trigger-only: fired by AFTER INSERT triggers, never called directly.
-- =========================================================================
revoke execute on function archive_oldest_subs_over_cap() from public, anon, authenticated;
revoke execute on function refresh_activity_vote_counts() from public, anon, authenticated;
revoke execute on function refresh_duck_post_vote_counts() from public, anon, authenticated;
revoke execute on function issue_certificate_when_complete() from public, anon, authenticated;

-- =========================================================================
-- RPC functions: anon loses access; authenticated keeps it via the grant
-- each of these already has from its original migration.
-- =========================================================================
revoke execute on function create_activity_type(text) from public, anon;
revoke execute on function delete_activity_type(uuid) from public, anon;
revoke execute on function ensure_todays_event() from public, anon;
revoke execute on function scan_duck_spot(text, double precision, double precision) from public, anon;
revoke execute on function collect_duck_by_photo(uuid, text, double precision, double precision) from public, anon;
