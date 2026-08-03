-- Give a post a person.
--
-- Identity here is an anonymous Supabase session, so until now the most a post
-- could say about its author was the coarse onboarding bands -- "Europe · 25–34"
-- -- which reads as a demographic rather than a someone. On a riverbank where
-- the whole point is that other people are out there doing things, that was the
-- wrong trade.
--
-- Still anonymous in the sense that matters: no email, no password, no account
-- to log into. A display name is just what you'd like to be called, it's
-- optional, and posts without one fall back to the bands as before.

alter table profiles
  add column display_name text;

-- Own-row writes only; the existing public read policy already exposes it,
-- which is what lets the detail sheet name an author.
