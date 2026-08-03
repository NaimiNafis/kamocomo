// Fills the duck board and puts one stamp in your own collection.
//
// Two different jobs, because the duck pages show two different things:
//
//   - the COMMUNAL board (/duck/photos): every duck ringed with photos people
//     have shared of it, voted on. Seeded from the 100 demo accounts that
//     seed-demo-community.mjs created -- reused rather than re-made, since
//     duck_post_votes is keyed (user_id, duck_post_id) and N likes therefore
//     genuinely needs N accounts.
//   - YOUR collection (/duck): a stamp is per user and the photo in a slot is
//     your OWN duck_post, so the Kamogawa Delta is stamped for every non-demo
//     profile -- in practice this device. Re-run to catch a new one.
//
// ⚠ Needs a key that bypasses RLS, same as the community seed:
//   SUPABASE_SECRET_KEY=sb_secret_...  in .env.local (no VITE_ prefix).
//
// Dislikes stay under ten. Ten hides a photo (the vote-count trigger in
// 20260805120000), and a seed that hid its own content would read as a bug.
//
// Re-running tops up rather than duplicating: ducks that already have enough
// photos are skipped, votes are upserted, stamps are upserted.
//
// Usage: node scripts/seed-demo-ducks.mjs

import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
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

const URL = env.VITE_SUPABASE_URL;
const ADMIN_KEY =
  env.SUPABASE_SECRET_KEY ??
  process.env.SUPABASE_SECRET_KEY ??
  env.SUPABASE_SERVICE_ROLE_KEY ??
  process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!ADMIN_KEY) {
  console.error(
    'No admin key found in .env.local.\n' +
      'Dashboard -> Project Settings -> API Keys -> Secret keys, then:\n' +
      '  SUPABASE_SECRET_KEY=sb_secret_...   (no VITE_ prefix)',
  );
  process.exit(1);
}

const db = createClient(URL, ADMIN_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const PHOTO_DIR = path.join(rootDir, 'img/duck');
const DEMO_DOMAIN = 'kamo-demo.invalid';
/** Photos per duck on the communal board. */
const PHOTOS_PER_DUCK = [4, 5, 6, 7, 8];
/** Likes and dislikes drawn from these. Dislikes stop well short of ten. */
const LIKE_CHOICES = [0, 0, 1, 2, 3, 5, 7, 9, 12, 16, 20];
const DISLIKE_CHOICES = [0, 0, 0, 1, 2, 4, 8];

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const between = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));

function shuffled(arr) {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * The demo crowd, by their email suffix.
 *
 * Only accounts that also have a `profiles` row count -- `duck_posts.author_id`
 * is a foreign key to profiles, not to auth.users, and older anonymous seed
 * runs left plenty of auth users without one.
 */
async function demoAccounts(profileIds) {
  const ids = [];
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    for (const u of data.users) {
      if (u.email?.endsWith(`@${DEMO_DOMAIN}`) && profileIds.has(u.id)) ids.push(u.id);
    }
    if (data.users.length < 200) break;
  }
  return ids;
}

/**
 * Who gets the Delta stamped for them.
 *
 * There is no way to tell from the database which anonymous profile is the
 * phone in your hand -- earlier seed runs left hundreds of them, all equally
 * anonymous. So: the newest few non-demo profiles, which is where an actively
 * used device sits, capped tightly because each one also gets a photo on the
 * Delta and a hundred copies of the same duck would bury the board.
 *
 * Pass a profile id as an argument to target exactly one instead:
 *   node scripts/seed-demo-ducks.mjs 8eb39da2-...
 */
const STAMP_RECENT_PROFILES = 5;

/** Uploads the pool once and hands back public URLs, photo 1 first. */
async function uploadPhotos(ownerId) {
  const files = fs
    .readdirSync(PHOTO_DIR)
    .filter((f) => /^duck-example-\d+\.jpg$/.test(f))
    .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
  if (!files.length) throw new Error(`no duck-example-*.jpg in ${PHOTO_DIR}`);

  const urls = [];
  for (const file of files) {
    const objectPath = `${ownerId}/demo-ducks/${file}`;
    const { error } = await db.storage
      .from('photos')
      .upload(objectPath, fs.readFileSync(path.join(PHOTO_DIR, file)), {
        contentType: 'image/jpeg',
        upsert: true,
      });
    if (error) throw error;
    urls.push(db.storage.from('photos').getPublicUrl(objectPath).data.publicUrl);
  }
  console.log(`  ${urls.length} duck photos uploaded`);
  return urls;
}

const { data: spots, error: se } = await db
  .from('duck_spots')
  .select('id, name_en, lat, lng')
  .eq('active', true)
  .order('lat', { ascending: false });
if (se) throw se;
if (!spots?.length) throw new Error('no active duck spots -- run the migrations first');

const { data: profiles, error: profErr } = await db
  .from('profiles')
  .select('id, created_at')
  .order('created_at', { ascending: false });
if (profErr) throw profErr;
const profileIds = new Set(profiles.map((p) => p.id));

const demo = await demoAccounts(profileIds);
if (!demo.length) throw new Error('no demo accounts -- run seed-demo-community.mjs first');

const demoSet = new Set(demo);
const requested = process.argv[2];
const real = requested
  ? [requested]
  : profiles
      .filter((p) => !demoSet.has(p.id))
      .slice(0, STAMP_RECENT_PROFILES)
      .map((p) => p.id);

console.log(`${spots.length} ducks, ${demo.length} demo accounts`);
console.log(`stamping the Delta for ${real.length} profile(s):`);
for (const id of real) console.log(`  ${id}`);

const photos = await uploadPhotos(demo[0]);
const delta = spots[0];

// --- 1. The Delta, stamped for whoever actually uses this app -------------
// Both rows are needed: the stamp marks the slot collected, and the picture in
// that slot is this user's own duck_post, not anyone else's.
for (const userId of real) {
  const { data: existing } = await db
    .from('duck_posts')
    .select('id')
    .eq('author_id', userId)
    .eq('duck_spot_id', delta.id)
    .limit(1);

  if (!existing?.length) {
    const { error } = await db.from('duck_posts').insert({
      author_id: userId,
      duck_spot_id: delta.id,
      photo_url: photos[0],
      lat: delta.lat,
      lng: delta.lng,
    });
    if (error) throw error;
  }
  const { error: stampError } = await db
    .from('stamps')
    .upsert({ user_id: userId, duck_spot_id: delta.id }, { onConflict: 'user_id,duck_spot_id' });
  if (stampError) throw stampError;
}
console.log(`  ${delta.name_en} stamped`);

// --- 2. Everyone else's photos, on every duck -----------------------------
const { data: existingPosts, error: pe } = await db
  .from('duck_posts')
  .select('duck_spot_id')
  .eq('hidden', false)
  .not('duck_spot_id', 'is', null);
if (pe) throw pe;
const have = new Map();
for (const p of existingPosts) have.set(p.duck_spot_id, (have.get(p.duck_spot_id) ?? 0) + 1);

let made = 0;
let votesMade = 0;
for (const spot of spots) {
  const want = pick(PHOTOS_PER_DUCK);
  const need = want - (have.get(spot.id) ?? 0);
  if (need <= 0) {
    console.log(`  ${spot.name_en}: already has ${have.get(spot.id)} photos, skipping`);
    continue;
  }

  const rows = Array.from({ length: need }, (_, i) => ({
    author_id: pick(demo),
    duck_spot_id: spot.id,
    photo_url: pick(photos),
    lat: spot.lat,
    lng: spot.lng,
    created_at: new Date(Date.now() - between(0, 6) * 86_400_000 - i * 3_600_000).toISOString(),
  }));
  const { data: inserted, error } = await db.from('duck_posts').insert(rows).select('id');
  if (error) throw error;
  made += inserted.length;

  // One row per (user, photo), so a like count is only as real as the number of
  // accounts behind it -- which is what the hundred demo users are for.
  const voteRows = [];
  for (const post of inserted) {
    const likes = pick(LIKE_CHOICES);
    const dislikes = pick(DISLIKE_CHOICES);
    const voters = shuffled(demo).slice(0, likes + dislikes);
    voters.forEach((userId, i) => {
      voteRows.push({ user_id: userId, duck_post_id: post.id, value: i < likes ? 1 : -1 });
    });
  }
  if (voteRows.length) {
    const { error: ve } = await db
      .from('duck_post_votes')
      .upsert(voteRows, { onConflict: 'user_id,duck_post_id' });
    if (ve) throw ve;
    votesMade += voteRows.length;
  }
  console.log(`  ${spot.name_en}: +${inserted.length} photos`);
}

console.log(`done — ${made} duck photos, ${votesMade} votes`);
