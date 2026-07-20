-- Phase 5 (§5.3): new main activities need to appear on the map live. Tables
-- must be explicitly added to the supabase_realtime publication for
-- postgres_changes subscriptions to receive anything for them.
alter publication supabase_realtime add table activities;
