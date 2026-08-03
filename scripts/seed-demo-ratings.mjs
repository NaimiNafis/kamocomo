// Fills the boards out so they look like a real gathering: several mains per
// place, each with a handful of subs, and a spread of ratings across them.
//
// The point is seeing the shape signal work. A sub's corner radius is driven by
// its like count and reaches a full circle at 10, so a board where everything
// has zero likes tells you nothing about whether the design reads. This seeds
// squares, half-rounded cards and full circles side by side.
//
// Votes are the awkward part. `votes` is keyed (user_id, activity_id) and
// user_id references a real auth.users row, so N likes on one post genuinely
// needs N accounts -- there's no way to fake a count. This signs in a pool of
// anonymous voters up front and reuses them across every post, which is the
// cheapest thing that works against the anonymous-auth rate limit.
//
// ⚠ Ten dislikes hides a post (the vote-count trigger). Dislikes here are capped
// well under that on purpose -- seeding a post into invisibility would look like
// a bug rather than a demo.
//
// Idempotent-ish: it skips places that already have enough mains, and votes are
// upserted, so re-running tops up rather than duplicating.
//
// Usage: node scripts/seed-demo-ratings.mjs

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
const KEY = env.VITE_SUPABASE_ANON_KEY;
const PLACEHOLDER = path.join(rootDir, 'img/kamogawa/placeholder-riverbank.jpg');

/** Voters in the pool. Has to exceed the highest like count below, or a post
 * can never reach a full circle. */
const VOTER_COUNT = 12;

/** Mains per place, and the shape of each one's children. `likes` is per sub, so
 * these are the exact ratings a board will show -- picked to put a square, a
 * couple of part-rounded cards and a full circle next to each other. */
const MAIN_TEMPLATES = [
  { phrase: 'morning pages by the water', subs: [{ likes: 10, dislikes: 0 }, { likes: 6, dislikes: 1 }, { likes: 2, dislikes: 0 }, { likes: 0, dislikes: 0 }] },
  { phrase: '夕方の散歩、ここが一番いい', subs: [{ likes: 8, dislikes: 2 }, { likes: 3, dislikes: 0 }, { likes: 1, dislikes: 4 }] },
  { phrase: 'guitar practice, nobody minds', subs: [{ likes: 5, dislikes: 0 }, { likes: 0, dislikes: 2 }] },
  { phrase: '読書にちょうどいい静けさ', subs: [{ likes: 4, dislikes: 1 }, { likes: 9, dislikes: 0 }, { likes: 0, dislikes: 0 }] },
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
];

const fresh = () =>
  createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const anon = fresh();

const [{ data: places, error: pe }, { data: types, error: te }] = await Promise.all([
  anon.from('places').select('id, name_en, lat, lng').eq('active', true).order('lat', { ascending: false }),
  anon.from('activity_types').select('id').order('name_en'),
]);
if (pe) throw pe;
if (te) throw te;
if (!places.length) throw new Error('no active places -- run the migrations first');
if (!types.length) throw new Error('no activity types -- run seed.sql first');

const { data: event, error: ee } = await anon.rpc('ensure_todays_event');
if (ee) throw ee;

const { data: existingMains, error: me } = await anon
  .from('activities')
  .select('id, place_id')
  .eq('kind', 'main')
  .eq('hidden', false)
  .eq('archived', false);
if (me) throw me;

const mainsPerPlace = new Map();
for (const m of existingMains) mainsPerPlace.set(m.place_id, (mainsPerPlace.get(m.place_id) ?? 0) + 1);

const work = places
  .map((place) => ({ place, needed: MAIN_TEMPLATES.length - (mainsPerPlace.get(place.id) ?? 0) }))
  .filter((w) => w.needed > 0);

if (work.length === 0) {
  console.log('every place already has its mains; only topping up votes');
}

// One author for all the content, then a pool of voters. Separate because the
// author can't vote enough times on its own -- one row per (user, activity).
console.log(`signing in ${VOTER_COUNT + 1} anonymous users...`);
const author = fresh();
{
  const { data, error } = await author.auth.signInAnonymously();
  if (error) throw error;
  await author.from('profiles').upsert({ id: data.user.id });
}
const authorId = (await author.auth.getUser()).data.user.id;

const voters = [];
for (let i = 0; i < VOTER_COUNT; i++) {
  const client = fresh();
  const { data, error } = await client.auth.signInAnonymously();
  if (error) throw new Error(`voter ${i} sign-in failed (rate limit?): ${error.message}`);
  await client.from('profiles').upsert({ id: data.user.id });
  voters.push(client);
}
console.log(`  ${voters.length} voters ready`);

const photoBytes = fs.readFileSync(PLACEHOLDER);
async function uploadPhoto() {
  const p = `${authorId}/${crypto.randomUUID()}.jpg`;
  const { error } = await author.storage
    .from('photos')
    .upload(p, photoBytes, { contentType: 'image/jpeg', upsert: false });
  if (error) throw error;
  return author.storage.from('photos').getPublicUrl(p).data.publicUrl;
}

/** Casts `likes` up-votes and `dislikes` down-votes from distinct pool members.
 * Different slices for each so nobody votes twice on one post. */
async function rate(activityId, likes, dislikes) {
  const up = voters.slice(0, Math.min(likes, voters.length));
  const down = voters.slice(voters.length - Math.min(dislikes, voters.length - up.length));
  for (const [clients, value] of [[up, 1], [down, -1]]) {
    for (const client of clients) {
      const uid = (await client.auth.getUser()).data.user.id;
      const { error } = await client
        .from('votes')
        .upsert({ user_id: uid, activity_id: activityId, value }, { onConflict: 'user_id,activity_id' });
      if (error) throw error;
    }
  }
}

let created = 0;
for (const { place, needed } of work) {
  for (let i = 0; i < needed; i++) {
    const tpl = MAIN_TEMPLATES[i % MAIN_TEMPLATES.length];
    const type = types[(i + created) % types.length];

    const { data: main, error: mainError } = await author
      .from('activities')
      .insert({
        kind: 'main',
        activity_type: type.id,
        event_id: event.id,
        place_id: place.id,
        author_id: authorId,
        phrase: tpl.phrase,
        photo_url: await uploadPhoto(),
        lat: place.lat,
        lng: place.lng,
      })
      .select('id')
      .single();
    if (mainError) throw mainError;

    for (let s = 0; s < tpl.subs.length; s++) {
      const shape = tpl.subs[s];
      const { data: sub, error: subError } = await author
        .from('activities')
        .insert({
          kind: 'sub',
          parent_id: main.id,
          activity_type: type.id,
          place_id: place.id,
          author_id: authorId,
          phrase: SUB_PHRASES[(s + created) % SUB_PHRASES.length],
          photo_url: await uploadPhoto(),
          lat: place.lat,
          lng: place.lng,
        })
        .select('id')
        .single();
      if (subError) throw subError;
      await rate(sub.id, shape.likes, shape.dislikes);
      process.stdout.write(`  ${place.name_en}: sub +${shape.likes}/-${shape.dislikes}\n`);
    }
    created++;
  }
}

console.log(`done — ${created} mains with rated subs`);
