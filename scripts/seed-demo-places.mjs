// Demo seeder for the round-2 places model (§C8-equivalent): gives each of the
// ~8 seeded places a cluster of main activities for TODAY's gathering event
// (varied activity types -> varied node colors) plus a few subs on each, so
// every place board looks alive. One main per place carries the placeholder
// photo so its map popup shows a real picture.
//
// Same real signInAnonymously() + insert flow as the other seeders (author_id
// must be a genuine auth.users row). Reuses a single anon session (cheap on the
// anonymous-auth rate limit; the app never shows authorship). Idempotent:
// skips any place that already has mains for today's event.
//
// Usage: node scripts/seed-demo-places.mjs

import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const envText = fs.readFileSync(path.join(rootDir, '.env.local'), 'utf8');
const env = Object.fromEntries(
  envText
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => {
      const idx = l.indexOf('=');
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()];
    }),
);

const URL = env.VITE_SUPABASE_URL;
const KEY = env.VITE_SUPABASE_ANON_KEY;
const PLACEHOLDER_PATH = path.join(rootDir, 'img/kamogawa/placeholder-riverbank.jpg');

const sb = createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });

// Phrases keyed by activity-type name (a spread of EN + JA).
const MAIN_PHRASES = {
  Writing: ['morning pages by the water', '川を眺めながら日記を書く', 'drafting here, the calm helps'],
  Reading: ['finishing a novel on the bank', '読書にちょうどいい静けさ', 'brought a book and a coffee'],
  Walking: ['slow loop along the river', '夕方の散歩コース', 'best stretch for a stroll'],
  Music: ['弾き語りの練習中', 'busking a few songs here', 'ギターの音が川に映える'],
  Yoga: ['朝日を浴びてヨガ', 'sunrise stretches by the water', 'マットを広げて一息'],
};
const SUB_PHRASES = [
  'joined in for a bit today',
  '今日もここに来た',
  'same spot, different vibe',
  '風が気持ちいい',
  'brought a friend this time',
  'ちょっと長居しちゃった',
  'the light was perfect',
];

const { data: sign, error: signError } = await sb.auth.signInAnonymously();
if (signError) throw signError;
const userId = sign.user.id;
const { error: profileError } = await sb.from('profiles').upsert({ id: userId });
if (profileError) throw profileError;

const { data: event, error: eventError } = await sb.rpc('ensure_todays_event');
if (eventError) throw eventError;
const eventId = event.id;
console.log('today event:', eventId);

const [{ data: types, error: te }, { data: places, error: pe }] = await Promise.all([
  sb.from('activity_types').select('id, name_en'),
  sb.from('places').select('id, name_en, lat, lng').eq('active', true).order('lat', { ascending: false }),
]);
if (te) throw te;
if (pe) throw pe;
const typeByName = Object.fromEntries(types.map((t) => [t.name_en, t.id]));
const typeNames = Object.keys(MAIN_PHRASES);

const { data: existingMains, error: me } = await sb
  .from('activities')
  .select('place_id')
  .eq('kind', 'main')
  .eq('event_id', eventId);
if (me) throw me;
const placesWithMains = new Set(existingMains.map((m) => m.place_id));

const placeholderBytes = fs.readFileSync(PLACEHOLDER_PATH);

async function uploadPlaceholder() {
  const storagePath = `${userId}/${crypto.randomUUID()}.jpg`;
  const { error } = await sb.storage
    .from('photos')
    .upload(storagePath, placeholderBytes, { contentType: 'image/jpeg', upsert: false });
  if (error) throw error;
  return sb.storage.from('photos').getPublicUrl(storagePath).data.publicUrl;
}

for (let i = 0; i < places.length; i++) {
  const place = places[i];
  if (placesWithMains.has(place.id)) {
    console.log(`"${place.name_en}" already has mains for today -- skipping`);
    continue;
  }

  // 3 mains of 3 different types (rotating) so the board shows multiple colors.
  const chosen = [0, 1, 2].map((k) => typeNames[(i + k) % typeNames.length]);
  console.log(`seeding "${place.name_en}" with mains: ${chosen.join(', ')}`);

  for (let m = 0; m < chosen.length; m++) {
    const typeName = chosen[m];
    const phrases = MAIN_PHRASES[typeName];
    const photoUrl = m === 0 ? await uploadPlaceholder() : null; // one photo per place

    const { data: main, error: mainError } = await sb
      .from('activities')
      .insert({
        kind: 'main',
        activity_type: typeByName[typeName],
        event_id: eventId,
        place_id: place.id,
        author_id: userId,
        phrase: phrases[m % phrases.length],
        photo_url: photoUrl,
        lat: place.lat,
        lng: place.lng,
      })
      .select('id')
      .single();
    if (mainError) throw mainError;

    const subCount = 3 + (m % 2); // 3-4 subs
    for (let s = 0; s < subCount; s++) {
      const { error: subError } = await sb.from('activities').insert({
        kind: 'sub',
        parent_id: main.id,
        activity_type: typeByName[typeName],
        place_id: place.id,
        author_id: userId,
        phrase: SUB_PHRASES[(m * 3 + s) % SUB_PHRASES.length],
        lat: place.lat,
        lng: place.lng,
      });
      if (subError) throw subError;
    }
    console.log(`  + ${typeName} main + ${subCount} subs${photoUrl ? ' (with photo)' : ''}`);
  }
}

console.log('done');
