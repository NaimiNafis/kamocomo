// Fills ONE main at every active place up to the 10-sub cap, so each board has
// a visibly "full" node to look at -- a main ringed at its thickest with a
// complete orbit of children around it, which is what a busy spot looks like.
//
// 10 is deliberate: it's exactly the sub cap from 20260723120000, so the main
// sits right at the edge without the archive trigger firing. Push past it and
// the oldest child rolls into the archive instead (seed-demo-subs.mjs does that
// on purpose to demo the overflow).
//
// Every sub gets a photo, since a photo is now required to post.
//
// Resumable rather than idempotent-by-flag: it computes how many more each main
// needs, so a run interrupted by the anonymous-auth rate limit can just be
// re-run and picks up where it stopped.
//
// Usage: node scripts/seed-full-nodes.mjs

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

const TARGET_SUBS = 10;
const PLACEHOLDER = path.join(rootDir, 'img/kamogawa/placeholder-riverbank.jpg');

// Bilingual so a full node doesn't read as a wall of one language.
const PHRASES = [
  'joined in for a while today',
  '今日はここで少しだけ',
  'same spot, same time — good crowd',
  '思ったより人が多かった',
  'brought a friend along this time',
  '川風が気持ちいい',
  'stayed longer than I meant to',
  'すっかり日が暮れてしまった',
  'this is becoming a habit',
  'また来ます',
];

const anon = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: places, error: placesError } = await anon
  .from('places')
  .select('id, name_en')
  .eq('active', true)
  .order('lat', { ascending: false });
if (placesError) throw placesError;

const { data: mains, error: mainsError } = await anon
  .from('activities')
  .select('id, place_id, phrase, activity_type, lat, lng')
  .eq('kind', 'main')
  .eq('hidden', false)
  .eq('archived', false)
  .order('created_at', { ascending: true });
if (mainsError) throw mainsError;

const { data: subs, error: subsError } = await anon
  .from('activities')
  .select('parent_id')
  .eq('kind', 'sub')
  .eq('hidden', false)
  .eq('archived', false);
if (subsError) throw subsError;

const subCount = new Map();
for (const s of subs) subCount.set(s.parent_id, (subCount.get(s.parent_id) ?? 0) + 1);

// Work out everything to do before touching auth, so a no-op run costs nothing.
const work = [];
for (const place of places) {
  const candidates = mains.filter((m) => m.place_id === place.id);
  if (candidates.length === 0) {
    console.warn(`${place.name_en}: no mains yet — run seed-demo-places.mjs first, skipping`);
    continue;
  }
  // Whichever already has the most children, so we top up rather than spread
  // thin, and re-runs keep choosing the same one.
  const main = candidates.reduce((a, b) => ((subCount.get(b.id) ?? 0) > (subCount.get(a.id) ?? 0) ? b : a));
  const already = subCount.get(main.id) ?? 0;
  const needed = TARGET_SUBS - already;
  if (needed <= 0) {
    console.log(`${place.name_en}: already full (${already}/${TARGET_SUBS})`);
    continue;
  }
  console.log(`${place.name_en}: ${already}/${TARGET_SUBS}, adding ${needed}`);
  work.push({ place, main, needed, already });
}

if (work.length === 0) {
  console.log('nothing to do');
  process.exit(0);
}

// One shared author for the whole run — cheap on the anonymous sign-in rate
// limit, which is easy to exhaust while seeding, and the app never shows who
// wrote a post anyway.
const { data: sign, error: signError } = await anon.auth.signInAnonymously();
if (signError) throw signError;
const userId = sign.user.id;
const { error: profileError } = await anon.from('profiles').upsert({ id: userId });
if (profileError) throw profileError;

const photoBytes = fs.readFileSync(PLACEHOLDER);

for (const { place, main, needed, already } of work) {
  for (let i = 0; i < needed; i++) {
    const storagePath = `${userId}/${crypto.randomUUID()}.jpg`;
    const { error: uploadError } = await anon.storage
      .from('photos')
      .upload(storagePath, photoBytes, { contentType: 'image/jpeg', upsert: false });
    if (uploadError) throw uploadError;
    const photoUrl = anon.storage.from('photos').getPublicUrl(storagePath).data.publicUrl;

    const { error: insertError } = await anon.from('activities').insert({
      kind: 'sub',
      parent_id: main.id,
      activity_type: main.activity_type,
      place_id: main.place_id,
      author_id: userId,
      phrase: PHRASES[(already + i) % PHRASES.length],
      photo_url: photoUrl,
      lat: main.lat,
      lng: main.lng,
    });
    if (insertError) throw insertError;
    console.log(`  + ${place.name_en} [${already + i + 1}/${TARGET_SUBS}]`);
  }
}

console.log('done');
