// Puts the boards back to demo content only: every post shows a seeded example
// image, and nothing anyone uploaded survives.
//
// ─────────────────────────────────────────────────────────────────────────────
//   npm run reset-to-seed           show what would go (safe, changes nothing)
//   npm run reset-to-seed -- --yes  actually do it
// ─────────────────────────────────────────────────────────────────────────────
//
// ⚠ DESTRUCTIVE AND NOT REVERSIBLE. It deletes every visitor account along
// with everything they posted, voted on and collected. Dry run is the default
// for that reason: deleting requires --yes, spelled out.
//
// What survives is exactly the demo crowd -- the hundred @kamo-demo.invalid
// accounts seed-demo-community.mjs creates -- and what they posted. Everyone
// else goes, which includes whatever anonymous identity this device was
// carrying: expect the app to hand you a fresh one, with no stamps, next time
// you open it.
//
// What it guarantees when it finishes:
//
//   - every duck post shows an image from img/duck
//   - every toukou post shows an image from img/kamogawa
//   - no object remains in storage outside the two seed folders
//   - within any one group -- the subs under a main, the photos on a duck --
//     no image repeats
//
// Order matters, and is forced by the schema. `activities.author_id` and
// `duck_posts.author_id` reference profiles with NO cascade, so a profile
// cannot be deleted while a post of theirs exists -- posts first, accounts
// second. `parent_id` on the other hand IS ON DELETE CASCADE, so removing a
// main a visitor posted also removes its subs, demo-authored ones included.
// Storage is listed before any of it, because the folders are enumerated
// through `profiles` and those rows are about to disappear.
//
// Activities on inactive places are left alone: older rows predate the
// `main_requires_place` constraint and Postgres refuses to update them at all.
// They are invisible in the app.
//
// Afterwards the boards are thinner than before. Re-run the seeds to fill them
// back out, then spread the photos again -- a seed run tops up groups that
// already had photos, and cannot know what the existing members are showing:
//   node scripts/seed-demo-community.mjs
//   node scripts/seed-demo-ducks.mjs
//   npm run spread-photos

import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const commit = process.argv.includes('--yes');

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

const KAMO_RE = /kamogawa-example-\d+\.jpeg/;
const DUCK_RE = /\/demo-ducks\/duck-example-\d+\.jpg/;

function shuffled(a) {
  const o = [...a];
  for (let i = o.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [o[i], o[j]] = [o[j], o[i]];
  }
  return o;
}
function deal(pool, n, avoid) {
  const usable = shuffled(pool.filter((p) => p !== avoid));
  const src = usable.length ? usable : pool;
  return Array.from({ length: n }, (_, i) => src[i % src.length]);
}

const DEMO_DOMAIN = 'kamo-demo.invalid';

// --- survey ---------------------------------------------------------------
const demo = new Set();
const others = [];
for (let page = 1; page <= 40; page++) {
  const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
  if (error) throw error;
  for (const u of data.users) {
    if (u.email?.endsWith(`@${DEMO_DOMAIN}`)) demo.add(u.id);
    else others.push(u.id);
  }
  if (data.users.length < 200) break;
}
if (!demo.size) throw new Error('no demo accounts found — refusing to delete everyone');

const { data: places } = await db.from('places').select('id').eq('active', true);
const placeIds = places.map((p) => p.id);

const { data: acts } = await db.from('activities').select('id, kind, parent_id, place_id, photo_url, author_id');
const { data: ducks } = await db.from('duck_posts').select('id, duck_spot_id, photo_url, author_id');

const kamoPool = [...new Set(acts.map((a) => a.photo_url).filter((u) => u && KAMO_RE.test(u)))].sort();
const duckPool = [...new Set(ducks.map((p) => p.photo_url).filter((u) => u && DUCK_RE.test(u)))].sort();
if (!kamoPool.length || !duckPool.length) throw new Error('seed photo pools look empty — aborting');

// Anything a visitor authored, plus anything still carrying an upload.
const doomedActs = acts.filter((a) => !demo.has(a.author_id) || (a.photo_url && !KAMO_RE.test(a.photo_url)));
const doomedMainIds = new Set(doomedActs.filter((a) => a.kind === 'main').map((a) => a.id));
const cascaded = acts.filter(
  (a) => a.kind === 'sub' && doomedMainIds.has(a.parent_id) && !doomedActs.includes(a),
);
const doomedDucks = ducks.filter(
  (p) => !demo.has(p.author_id) || !p.photo_url || !DUCK_RE.test(p.photo_url),
);

// Listed now: the folders are enumerated through profiles, which are about to go.
const { data: profiles } = await db.from('profiles').select('id');
const strays = [];
for (const p of profiles) {
  const { data: objs } = await db.storage.from('photos').list(p.id, { limit: 200 });
  for (const o of objs ?? []) if (o.id) strays.push(`${p.id}/${o.name}`);
}

console.log(`accounts: ${demo.size} demo (kept), ${others.length} visitor (deleted)`);
console.log(`seed pools: ${kamoPool.length} kamogawa, ${duckPool.length} duck\n`);
console.log('WOULD DELETE');
console.log(`  ${doomedActs.length} of ${acts.length} toukou post(s)  -> ${acts.length - doomedActs.length - cascaded.length} remain`);
console.log(`     ${doomedMainIds.size} are mains; cascade takes ${cascaded.length} further demo sub(s) with them`);
console.log(`  ${doomedDucks.length} of ${ducks.length} duck post(s)  -> ${ducks.length - doomedDucks.length} remain`);
console.log(`  ${others.length} visitor account(s), with their votes, stamps and certificates`);
console.log(`  ${strays.length} uploaded file(s) from storage`);
console.log(`\nAfterwards, re-run the two seed scripts to fill the boards back out.`);

if (!commit) {
  console.log('\nDry run. Nothing changed. Re-run with --yes to apply.');
  process.exit(0);
}

// --- delete ---------------------------------------------------------------
// Posts before accounts: author_id has no cascade, so a profile with a post
// still attached refuses to delete.
const delIds = doomedActs.map((a) => a.id);
for (let i = 0; i < delIds.length; i += 100) {
  const { error } = await db.from('activities').delete().in('id', delIds.slice(i, i + 100));
  if (error) throw error;
}
const delDuck = doomedDucks.map((p) => p.id);
for (let i = 0; i < delDuck.length; i += 100) {
  const { error } = await db.from('duck_posts').delete().in('id', delDuck.slice(i, i + 100));
  if (error) throw error;
}
console.log(`\ndeleted ${delIds.length} toukou, ${delDuck.length} duck post(s)`);

for (let i = 0; i < strays.length; i += 100) {
  const { error } = await db.storage.from('photos').remove(strays.slice(i, i + 100));
  if (error) throw error;
}
console.log(`deleted ${strays.length} uploaded file(s)`);

let gone = 0;
for (const id of others) {
  const { error } = await db.auth.admin.deleteUser(id);
  if (error) {
    console.log(`  could not delete ${id}: ${error.message}`);
    continue;
  }
  gone++;
  if (gone % 50 === 0) console.log(`  ...${gone}/${others.length} accounts`);
}
console.log(`deleted ${gone} visitor account(s)`);

// --- re-deal everything that's left ---------------------------------------
const { data: left } = await db
  .from('activities')
  .select('id, kind, parent_id, place_id, photo_url')
  .in('place_id', placeIds)
  .limit(5000);

const assign = new Map();
const mainsByPlace = new Map();
for (const a of left.filter((x) => x.kind === 'main')) {
  if (!mainsByPlace.has(a.place_id)) mainsByPlace.set(a.place_id, []);
  mainsByPlace.get(a.place_id).push(a);
}
for (const [, g] of mainsByPlace) {
  const d = deal(kamoPool, g.length);
  g.forEach((a, i) => assign.set(a.id, d[i]));
}
const subsByParent = new Map();
for (const a of left.filter((x) => x.kind === 'sub' && x.parent_id)) {
  if (!subsByParent.has(a.parent_id)) subsByParent.set(a.parent_id, []);
  subsByParent.get(a.parent_id).push(a);
}
for (const [pid, g] of subsByParent) {
  const d = deal(kamoPool, g.length, assign.get(pid));
  g.forEach((a, i) => assign.set(a.id, d[i]));
}

const { data: leftDucks } = await db.from('duck_posts').select('id, duck_spot_id');
const duckAssign = new Map();
const byDuck = new Map();
for (const p of leftDucks) {
  if (!byDuck.has(p.duck_spot_id)) byDuck.set(p.duck_spot_id, []);
  byDuck.get(p.duck_spot_id).push(p);
}
for (const [, g] of byDuck) {
  const d = deal(duckPool, g.length);
  g.forEach((p, i) => duckAssign.set(p.id, d[i]));
}

async function apply(table, map) {
  const byPhoto = new Map();
  for (const [id, url] of map) {
    if (!byPhoto.has(url)) byPhoto.set(url, []);
    byPhoto.get(url).push(id);
  }
  for (const [url, ids] of byPhoto) {
    for (let i = 0; i < ids.length; i += 100) {
      const { error } = await db.from(table).update({ photo_url: url }).in('id', ids.slice(i, i + 100));
      if (error) throw error;
    }
  }
}
await apply('activities', assign);
await apply('duck_posts', duckAssign);

console.log(`re-dealt ${assign.size} toukou and ${duckAssign.size} duck posts onto seed images`);
console.log('done.');
