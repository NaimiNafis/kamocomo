-- Removes the retired place sets outright: the 8 from 20260723120000 and the
-- 16 from 20260727120000. 20260801120000 only deactivated them, on the
-- reasoning that their activities should stay readable in the archive. The
-- call now is that the ducks are the model and those places are clutter.
--
-- ⚠ THIS DELETES DATA AND CANNOT BE UNDONE.
--
-- `activities.place_id` has no ON DELETE rule, so a place with activities
-- cannot simply be dropped — the activities have to go first. They also can't
-- be detached instead: the `main_requires_place` CHECK rejects a main with a
-- null place_id on update. So removing these places necessarily removes the
-- activities posted at them, which is why this is its own migration rather
-- than being folded into the coordinate move.
--
-- What that costs: the demo mains and subs seeded at the old places disappear
-- from the archive. Everything at the 10 duck places is untouched. Re-seed
-- with `node scripts/seed-demo-places.mjs` afterwards to repopulate.
--
-- Not affected: duck_spots, duck_posts, stamps, certificates and every printed
-- QR token — none of them reference places.

-- Subs carry their parent's place_id, so this predicate covers mains and subs
-- alike; anything it misses is caught by the parent_id ON DELETE CASCADE.
-- Votes cascade from activities. `reports.target_id` has no foreign key, so a
-- report pointing at a deleted activity is left behind as a harmless orphan.
delete from activities
where place_id in (select id from places where duck_spot_id is null);

delete from places where duck_spot_id is null;

-- From here a place without a duck is meaningless, so stop new ones appearing.
-- NOT VALID is unnecessary: the table is now clean by construction.
alter table places
  add constraint place_requires_duck_spot check (duck_spot_id is not null);
