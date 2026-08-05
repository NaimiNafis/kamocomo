// Fills the whole app with a plausible crowd: ~100 people with names and
// backgrounds, six or seven main activities on every board, orbits of subs
// beneath them, and votes spread across the lot.
//
// This replaces running seed-full-nodes / seed-demo-subs / seed-demo-ratings
// one after another. Those each solved a piece with an anonymous client and
// paid for it in sign-in rate limits; this one uses an admin key, so users can
// be created outright and rows written directly.
//
// ⚠ NEEDS A KEY THAT BYPASSES RLS. That's the whole point -- it writes rows as
// a hundred different people -- and it's also why the key belongs in .env.local
// (already gitignored), used only from this machine. Never prefix it with
// VITE_, or Vite will inline it into the shipped bundle.
//
// Prefer a **secret API key** over the legacy service_role JWT. Same power,
// better failure mode: secret keys are listed individually, can be revoked one
// at a time, and revoking one doesn't invalidate every other token the project
// has issued the way rotating the JWT secret does.
//
//   Dashboard -> Project Settings -> API Keys -> Secret keys -> create one,
//   then in .env.local:   SUPABASE_SECRET_KEY=sb_secret_...
//
// The old key still works if that's what you have:
//
//   SUPABASE_SERVICE_ROLE_KEY=eyJ...
//
// What it deliberately arranges, rather than leaving to chance:
//
//   - one main per place filled to EXACTLY the 10-sub cap, so every board has a
//     main at its fullest without the archive trigger firing
//   - one main per place pushed past it, so the archive has something in it
//   - a spread of like counts across subs, including several at 10+, because
//     a sub's corner radius rounds to a full circle at ten likes and a board
//     where nothing is liked shows none of that
//   - dislikes capped at 8. Ten hides a post (the vote-count trigger), and a
//     seed that hid its own content would read as a bug
//   - a different photo on every post, drawn from img/kamogawa/
//
// Re-running tops up rather than duplicating: places that already have their
// mains are skipped, and the demo users are found by email and reused.
//
// Usage: node scripts/seed-demo-community.mjs

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
    'No admin key found in .env.local.\n\n' +
      'Dashboard -> Project Settings -> API Keys -> Secret keys -> create one, then:\n' +
      '  SUPABASE_SECRET_KEY=sb_secret_...        (preferred -- revocable on its own)\n' +
      '  SUPABASE_SERVICE_ROLE_KEY=eyJ...         (legacy, also works)\n\n' +
      'No VITE_ prefix on either, or it ends up in the client bundle.',
  );
  process.exit(1);
}
if (ADMIN_KEY.startsWith('eyJ')) {
  console.warn('using the legacy service_role JWT; a secret API key is the safer swap\n');
}

const db = createClient(URL, ADMIN_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const USER_COUNT = 100;
const MAINS_PER_PLACE = [6, 7];
const SUB_CAP = 10; // matches the archive trigger
const EMAIL_DOMAIN = 'kamo-demo.invalid';

const PHOTO_DIR = path.join(rootDir, 'img/kamogawa');

// ---------------------------------------------------------------------------
// The crowd. Names are grouped by the nationality band they'll be given, so a
// profile reads as a coherent person rather than a random draw across columns.
// ---------------------------------------------------------------------------
const PEOPLE = {
  japan: ['ゆき', 'はると', 'さくら', 'けんじ', 'あおい', 'そうた', 'みお', 'りく', 'なつみ', 'たける', 'ひなた', 'かえで', 'しょう', 'ゆい', 'だいき', 'ことね', 'れん', 'あかり', 'まさや', 'つばさ'],
  asia: ['Minji', 'Wei', 'Arjun', 'Siti', 'Jun-ho', 'Mei Lin', 'Rahul', 'Nurul', 'Ha-eun', 'Xiaoyu', 'Priya', 'Anucha', 'Bao', 'Ji-woo', 'Lan'],
  europe: ['Elin', 'Mateo', 'Sofie', 'Lukas', 'Chiara', 'Pieter', 'Aoife', 'Nikolai', 'Marta', 'Tomas', 'Ingrid', 'Rafa', 'Anouk', 'Bastien', 'Zofia'],
  americas: ['Dani', 'Cole', 'Renata', 'Owen', 'Camila', 'Jaz', 'Mateus', 'Harper', 'Lucia', 'Theo', 'Noa', 'Diego', 'Quinn', 'Valeria', 'Emmett'],
  other: ['Yusuf', 'Amara', 'Kai', 'Layla', 'Tane', 'Zara', 'Omar', 'Nia', 'Ari', 'Sena'],
};
const AGE_RANGES = ['under18', '18-24', '25-34', '35-44', '45-59', '60plus'];
const GENDERS = ['female', 'male', 'other', 'unspecified'];

const MAIN_PHRASES = [
  'morning pages by the water',
  '夕方の散歩、ここが一番いい',
  'guitar practice, nobody minds',
  '読書にちょうどいい静けさ',
  'stretching before the heat comes',
  '友達を待ちながら',
  'sketching the far bank',
  '川の音を聞きに来た',
  'coffee and not much else',
  'おにぎり持って来ました',
  'watching the herons work',
  '仕事の合間にひと休み',
];

const SUB_PHRASES = [
  'joined in for a while today',
  '今日はここで少しだけ',
  'same spot, same time',
  '思ったより人が多かった',
  'brought a friend along',
  '川風が気持ちいい',
  'stayed longer than I meant to',
  'また来ます',
  'first time down here',
  '猫がいた',
  'the light was worth it',
  '足だけ水に入れた',
  'quiet end to the day',
  '写真だけ撮って帰ります',
];

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const between = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));

/** Shuffled copy -- used to pick N distinct voters for one post. */
function shuffled(arr) {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------
async function ensureUsers() {
  // listUsers is paged; 100 demo accounts fit comfortably in two pages.
  const existing = new Map();
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    for (const u of data.users) {
      if (u.email?.endsWith(`@${EMAIL_DOMAIN}`)) existing.set(u.email, u.id);
    }
    if (data.users.length < 200) break;
  }

  const roster = [];
  const bands = Object.keys(PEOPLE);
  for (let i = 0; i < USER_COUNT; i++) {
    const nationality = bands[i % bands.length];
    const names = PEOPLE[nationality];
    // Deterministic pairing of index to name, so re-runs describe the same
    // person the same way even though the accounts already exist.
    const name = names[Math.floor(i / bands.length) % names.length];
    const email = `demo-${String(i).padStart(3, '0')}@${EMAIL_DOMAIN}`;
    roster.push({
      email,
      display_name: name,
      nationality,
      // Strides coprime with each list's length, so the walk visits every
      // option -- a stride sharing a factor would quietly use only some of
      // them (3 against 6 age ranges gives you exactly two of the six).
      age_range: AGE_RANGES[(i * 5) % AGE_RANGES.length],
      gender: GENDERS[(i * 3) % GENDERS.length],
      id: existing.get(email),
    });
  }

  const missing = roster.filter((p) => !p.id);
  if (missing.length) console.log(`creating ${missing.length} demo accounts...`);
  for (const person of missing) {
    const { data, error } = await db.auth.admin.createUser({
      email: person.email,
      password: `demo-${crypto.randomUUID()}`,
      email_confirm: true,
    });
    if (error) throw new Error(`createUser ${person.email}: ${error.message}`);
    person.id = data.user.id;
  }

  // A profiles row per account. Written directly rather than through the app's
  // upsert-on-sign-in path, because nobody is signing in.
  const { error } = await db.from('profiles').upsert(
    roster.map((p) => ({
      id: p.id,
      display_name: p.display_name,
      nationality: p.nationality,
      age_range: p.age_range,
      gender: p.gender,
    })),
    { onConflict: 'id' },
  );
  if (error) throw error;
  console.log(`  ${roster.length} people ready`);
  return roster;
}

// ---------------------------------------------------------------------------
// Photos: every kamogawa-example-*.jpeg uploaded once, then handed out at
// random. Uploaded once because 400 posts don't need 400 copies of the same
// dozen files -- the app only ever reads the public URL -- and handed out at
// random because a board where every card is the same picture reads as a bug.
// ---------------------------------------------------------------------------
async function uploadPhotos(ownerId) {
  const files = fs
    .readdirSync(PHOTO_DIR)
    .filter((f) => /^kamogawa-example-\d+\.jpeg$/.test(f))
    .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
  if (!files.length) throw new Error(`no kamogawa-example-*.jpeg in ${PHOTO_DIR}`);

  const urls = [];
  for (const file of files) {
    const objectPath = `${ownerId}/demo/${file}`;
    const { error } = await db.storage
      .from('photos')
      .upload(objectPath, fs.readFileSync(path.join(PHOTO_DIR, file)), {
        contentType: 'image/jpeg',
        upsert: true,
      });
    if (error) throw error;
    urls.push(db.storage.from('photos').getPublicUrl(objectPath).data.publicUrl);
  }
  console.log(`  ${urls.length} example photos uploaded`);
  return urls;
}

/**
 * Re-deals photos across posts that already exist, so a re-run after adding
 * images updates the boards instead of only affecting what it creates.
 *
 * Scoped to the active places on purpose. Older seeds left activities on places
 * that have since been removed, and some of those rows predate the
 * `main_requires_place` constraint -- touching one at all makes Postgres
 * re-check it and refuse. They're invisible in the app either way.
 *
 * Grouped by photo rather than updated row by row: one statement per image
 * instead of one per post.
 */
async function redealExistingPhotos(photos, placeIds) {
  const { data, error } = await db
    .from('activities')
    .select('id, kind, parent_id')
    .in('place_id', placeIds)
    .limit(5000);
  if (error) throw error;

  // Dealt per group rather than per row. An independent random pick per post
  // says nothing about what its neighbours got, and neighbours are exactly
  // what you see: the subs orbiting one main share a screen, so a repeat
  // inside a group of eight drawn from thirteen is near certain and reads as
  // a card that failed to load. Shuffling the pool per group and dealing
  // without replacement keeps a group's photos distinct until the pool runs
  // out. See scripts/spread-photos.mjs, which repairs boards already seeded.
  const groups = new Map();
  for (const row of data) {
    const key = row.kind === 'sub' && row.parent_id ? `sub:${row.parent_id}` : 'main';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row.id);
  }

  const buckets = new Map(photos.map((p) => [p, []]));
  for (const [, ids] of groups) {
    const deck = shuffled(photos);
    ids.forEach((id, i) => buckets.get(deck[i % deck.length]).push(id));
  }

  for (const [photo, ids] of buckets) {
    if (!ids.length) continue;
    const { error: upErr } = await db.from('activities').update({ photo_url: photo }).in('id', ids);
    if (upErr) throw upErr;
  }
  console.log(`  re-dealt photos across ${data.length} existing posts (siblings kept distinct)`);
}

// ---------------------------------------------------------------------------
// Votes. One row per (user, activity), so N likes genuinely needs N people --
// which is the whole reason this script bothers creating a hundred of them.
// ---------------------------------------------------------------------------
function votesFor(activityId, roster, likes, dislikes) {
  const voters = shuffled(roster).slice(0, likes + dislikes);
  return voters.map((v, i) => ({
    user_id: v.id,
    activity_id: activityId,
    value: i < likes ? 1 : -1,
  }));
}

// ---------------------------------------------------------------------------
async function main() {
  const [{ data: places, error: pe }, { data: types, error: te }] = await Promise.all([
    db.from('places').select('id, name_en, lat, lng').eq('active', true).order('lat', { ascending: false }),
    db.from('activity_types').select('id').eq('retired', false).order('name_en'),
  ]);
  if (pe) throw pe;
  if (te) throw te;
  if (!places?.length) throw new Error('no active places -- run the migrations first');
  if (!types?.length) throw new Error('no activity types -- run seed.sql first');
  console.log(`${places.length} places, ${types.length} activity types`);

  const roster = await ensureUsers();
  const photos = await uploadPhotos(roster[0].id);
  await redealExistingPhotos(photos, places.map((p) => p.id));

  const { data: event, error: ee } = await db.rpc('ensure_todays_event');
  if (ee) throw ee;

  const { data: existingMains, error: me } = await db
    .from('activities')
    .select('place_id')
    .eq('kind', 'main')
    .eq('hidden', false)
    .eq('archived', false);
  if (me) throw me;
  const haveMains = new Map();
  for (const m of existingMains) haveMains.set(m.place_id, (haveMains.get(m.place_id) ?? 0) + 1);

  let mainsMade = 0;
  let subsMade = 0;
  let votesMade = 0;

  for (const place of places) {
    const want = pick(MAINS_PER_PLACE);
    const need = want - (haveMains.get(place.id) ?? 0);
    if (need <= 0) {
      console.log(`  ${place.name_en}: already has ${haveMains.get(place.id)} mains, skipping`);
      continue;
    }

    for (let i = 0; i < need; i++) {
      const author = pick(roster);
      // Posted over the last few days rather than all at this second, so the
      // detail sheet's "posted" line varies and the archive ordering is real.
      const daysAgo = between(0, 4);
      const createdAt = new Date(Date.now() - daysAgo * 86_400_000 - between(0, 20) * 3_600_000);

      const { data: mainRow, error: mainError } = await db
        .from('activities')
        .insert({
          kind: 'main',
          activity_type: pick(types).id,
          event_id: event.id,
          place_id: place.id,
          author_id: author.id,
          phrase: pick(MAIN_PHRASES),
          photo_url: pick(photos),
          lat: place.lat,
          lng: place.lng,
          created_at: createdAt.toISOString(),
        })
        .select('id')
        .single();
      if (mainError) throw mainError;
      mainsMade++;

      // The first main on each board is filled exactly to the cap, the second
      // pushed two past it so the archive trigger has fired somewhere, and the
      // rest get an ordinary handful.
      const subCount = i === 0 ? SUB_CAP : i === 1 ? SUB_CAP + 2 : between(2, 7);

      const subs = [];
      for (let s = 0; s < subCount; s++) {
        subs.push({
          kind: 'sub',
          parent_id: mainRow.id,
          activity_type: pick(types).id,
          place_id: place.id,
          author_id: pick(roster).id,
          phrase: pick(SUB_PHRASES),
          photo_url: pick(photos),
          lat: place.lat,
          lng: place.lng,
          created_at: new Date(createdAt.getTime() + (s + 1) * 900_000).toISOString(),
        });
      }
      const { data: subRows, error: subError } = await db
        .from('activities')
        .insert(subs)
        .select('id');
      if (subError) throw subError;
      subsMade += subRows.length;

      // Spread the ratings so the shape signal is visible: some untouched, some
      // part-rounded, several past ten and fully circular.
      const rows = [];
      for (const sub of subRows) {
        const likes = pick([0, 0, 1, 2, 3, 5, 6, 8, 10, 11, 14, 19, 24]);
        const dislikes = pick([0, 0, 0, 1, 2, 3, 5, 8]);
        rows.push(...votesFor(sub.id, roster, likes, dislikes));
      }
      if (rows.length) {
        const { error: voteError } = await db
          .from('votes')
          .upsert(rows, { onConflict: 'user_id,activity_id' });
        if (voteError) throw voteError;
        votesMade += rows.length;
      }

      process.stdout.write(`  ${place.name_en}: main +${subRows.length} subs\n`);
    }
  }

  console.log(
    `done — ${mainsMade} mains, ${subsMade} subs, ${votesMade} votes from ${roster.length} people`,
  );
}

await main();
