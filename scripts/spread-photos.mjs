// Gives every set of sibling posts a different picture.
//
// ─────────────────────────────────────────────────────────────────────────────
//   npm run spread-photos            fix the boards
//   npm run spread-photos -- --dry-run   show what would change
// ─────────────────────────────────────────────────────────────────────────────
//
// Both seeds dealt photos with `Math.random()` per row, independently, which
// says nothing about what a post's neighbours got. On a board that is exactly
// where it shows: the subs orbiting one main are seen together, so the odds of
// a repeat inside a group of eight drawn from a pool of thirteen are close to
// certain, and a repeat reads as a rendering bug rather than as two people
// having photographed the same place.
//
// So photos are dealt per GROUP -- the subs under one main, the mains at one
// place, the photos on one duck -- shuffling the pool for each and dealing
// without replacement. A group larger than the pool has to repeat, and does so
// as late as possible.
//
// A sub is also kept off its own main's picture. They appear joined by a line;
// the same image at both ends looks like the card failed to load.
//
// Two things are deliberately never touched:
//
//   - photos real people uploaded. Only rows whose URL is one of the seeded
//     example images are re-dealt; anything else is somebody's own photo and
//     is not ours to shuffle.
//   - activities on inactive places. Older seeds left rows on places that have
//     since been removed, and some predate the `main_requires_place`
//     constraint -- touching one makes Postgres re-check it and refuse. They
//     are invisible in the app anyway. (Inherited from seed-demo-community.)
//
// ⚠ Needs the admin key: SUPABASE_SECRET_KEY=sb_secret_... in .env.local

import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dryRun = process.argv.includes('--dry-run');

const env = Object.fromEntries(
  fs
    .readFileSync(path.join(rootDir, '.env.local'), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const ADMIN_KEY = env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SECRET_KEY;
if (!ADMIN_KEY) {
  console.error('No SUPABASE_SECRET_KEY in .env.local');
  process.exit(1);
}

const db = createClient(env.VITE_SUPABASE_URL, ADMIN_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/**
 * Dropped from the pool: it carries a stock-library watermark, and §4 of
 * CLAUDE.md rules out stock imagery. Removing it here is what moves the posts
 * that were using it onto something else.
 */
const EXCLUDE = /kamogawa-example-13\.jpeg/;

const EXAMPLE_RE = /kamogawa-example-\d+\.jpeg/;
const DUCK_RE = /\/demo-ducks\/duck-example-\d+\.jpg/;

function shuffled(arr) {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Deal `n` photos from `pool`, none repeating until the pool runs out, and
 * none equal to `avoid`.
 */
function deal(pool, n, avoid) {
  const usable = shuffled(pool.filter((p) => p !== avoid));
  if (!usable.length) return Array.from({ length: n }, () => pool[0]);
  const out = [];
  for (let i = 0; i < n; i++) {
    if (i % usable.length === 0 && i > 0) {
      // pool exhausted, reshuffle so the repeats aren't in the same order
      usable.push(...shuffled(usable.slice(0, usable.length)));
    }
    out.push(usable[i % usable.length]);
  }
  return out;
}

/** One UPDATE per photo rather than per row. */
async function applyAssignments(table, assignments) {
  const byPhoto = new Map();
  for (const [id, url] of assignments) {
    if (!byPhoto.has(url)) byPhoto.set(url, []);
    byPhoto.get(url).push(id);
  }
  for (const [url, ids] of byPhoto) {
    for (let i = 0; i < ids.length; i += 100) {
      const { error } = await db
        .from(table)
        .update({ photo_url: url })
        .in('id', ids.slice(i, i + 100));
      if (error) throw error;
    }
  }
}

// ---------------------------------------------------------------------------
// 1. The toukou boards
// ---------------------------------------------------------------------------
const { data: places, error: placeErr } = await db.from('places').select('id').eq('active', true);
if (placeErr) throw placeErr;
const placeIds = places.map((p) => p.id);

const { data: acts, error: actErr } = await db
  .from('activities')
  .select('id, kind, parent_id, place_id, photo_url')
  .in('place_id', placeIds)
  .limit(5000);
if (actErr) throw actErr;

const seeded = acts.filter((a) => a.photo_url && EXAMPLE_RE.test(a.photo_url));
const pool = [...new Set(seeded.map((a) => a.photo_url))].filter((u) => !EXCLUDE.test(u)).sort();
if (!pool.length) throw new Error('no example photos found on any post');

console.log(`toukou: ${acts.length} activities on active places`);
console.log(`  ${seeded.length} on seeded example photos, ${acts.length - seeded.length} left alone`);
console.log(`  pool of ${pool.length} photos (watermarked example-13 excluded)`);

const assignments = new Map();

// Mains first: distinct within a place, so one board's cards differ.
const mainsByPlace = new Map();
for (const a of seeded.filter((x) => x.kind === 'main')) {
  if (!mainsByPlace.has(a.place_id)) mainsByPlace.set(a.place_id, []);
  mainsByPlace.get(a.place_id).push(a);
}
for (const [, group] of mainsByPlace) {
  const dealt = deal(pool, group.length);
  group.forEach((a, i) => assignments.set(a.id, dealt[i]));
}

// Then subs: distinct within a parent, and never the parent's own photo.
const photoOfMain = new Map();
for (const a of acts.filter((x) => x.kind === 'main')) {
  photoOfMain.set(a.id, assignments.get(a.id) ?? a.photo_url);
}
const subsByParent = new Map();
for (const a of seeded.filter((x) => x.kind === 'sub' && x.parent_id)) {
  if (!subsByParent.has(a.parent_id)) subsByParent.set(a.parent_id, []);
  subsByParent.get(a.parent_id).push(a);
}
for (const [parentId, group] of subsByParent) {
  const dealt = deal(pool, group.length, photoOfMain.get(parentId));
  group.forEach((a, i) => assignments.set(a.id, dealt[i]));
}

console.log(`  ${mainsByPlace.size} place(s) of mains, ${subsByParent.size} main(s) with subs`);

// ---------------------------------------------------------------------------
// 2. The duck board
// ---------------------------------------------------------------------------
const { data: duckPosts, error: dpErr } = await db
  .from('duck_posts')
  .select('id, duck_spot_id, photo_url');
if (dpErr) throw dpErr;

const seededDuck = duckPosts.filter((p) => p.photo_url && DUCK_RE.test(p.photo_url));
const duckPool = [...new Set(seededDuck.map((p) => p.photo_url))].sort();
const duckAssignments = new Map();
const byDuck = new Map();
for (const p of seededDuck) {
  if (!byDuck.has(p.duck_spot_id)) byDuck.set(p.duck_spot_id, []);
  byDuck.get(p.duck_spot_id).push(p);
}
for (const [, group] of byDuck) {
  const dealt = deal(duckPool, group.length);
  group.forEach((p, i) => duckAssignments.set(p.id, dealt[i]));
}

console.log(`\nduck: ${duckPosts.length} posts`);
console.log(`  ${seededDuck.length} on seeded duck photos, ${duckPosts.length - seededDuck.length} are people's own`);
console.log(`  pool of ${duckPool.length} photos across ${byDuck.size} ducks`);

// ---------------------------------------------------------------------------
if (dryRun) {
  console.log(`\nDry run — would update ${assignments.size} activities, ${duckAssignments.size} duck posts.`);
  process.exit(0);
}

await applyAssignments('activities', assignments);
await applyAssignments('duck_posts', duckAssignments);
console.log(`\ndone — ${assignments.size} activities, ${duckAssignments.size} duck posts re-dealt.`);
