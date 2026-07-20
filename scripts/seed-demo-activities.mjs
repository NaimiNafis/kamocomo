// One-off demo-content seeder for Phase 5's map markers.
//
// Deliberately goes through the real signInAnonymously() + insert flow (the
// same path the app itself uses) rather than writing SQL directly against
// auth.users -- activities.author_id must reference a genuine profiles row,
// and profiles.id must reference a genuine auth.users row, so the only
// sanctioned way to create demo "authors" is the real anonymous-auth API.
//
// Not idempotent: each run creates fresh anonymous users and their main
// activities. Re-running adds more demo markers rather than erroring, so
// only run this when you actually want more demo content.
//
// Usage: node scripts/seed-demo-activities.mjs

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

function freshClient() {
  return createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}

const anon = freshClient();
const { data: activityTypes, error: typesError } = await anon
  .from('activity_types')
  .select('id, name_en');
if (typesError) throw typesError;

const { data: events, error: eventsError } = await anon.from('events').select('id, active');
if (eventsError) throw eventsError;
const activeEvent = events.find((e) => e.active);
if (!activeEvent) {
  console.error('No active event found -- run supabase/seed.sql first.');
  process.exit(1);
}

function activityTypeId(nameEn) {
  const match = activityTypes.find((t) => t.name_en === nameEn);
  if (!match) throw new Error(`activity type "${nameEn}" not found -- run supabase/seed.sql first`);
  return match.id;
}

const DEMO_MAINS = [
  { type: 'Writing', lat: 35.03, lng: 135.772, phrase: 'morning pages by the water, works every time' },
  { type: 'Reading', lat: 35.027, lng: 135.771, phrase: 'quiet corner, good for finishing a book' },
  { type: 'Walking', lat: 35.019, lng: 135.77, phrase: 'best stretch for an evening walk, ducks included' },
  { type: 'Music', lat: 35.01, lng: 135.771, phrase: '弾き語りにちょうどいい場所、誰も気にしない' },
  { type: 'Yoga', lat: 35.0035, lng: 135.7715, phrase: '朝日を浴びながらヨガ、おすすめです' },
];

for (const main of DEMO_MAINS) {
  const client = freshClient();
  const { data: sign, error: signError } = await client.auth.signInAnonymously();
  if (signError) throw signError;
  const userId = sign.user.id;

  const { error: profileError } = await client.from('profiles').upsert({ id: userId });
  if (profileError) throw profileError;

  const { data: activity, error: activityError } = await client
    .from('activities')
    .insert({
      kind: 'main',
      activity_type: activityTypeId(main.type),
      event_id: activeEvent.id,
      author_id: userId,
      phrase: main.phrase,
      lat: main.lat,
      lng: main.lng,
    })
    .select()
    .single();

  if (activityError) throw activityError;
  console.log(`seeded main "${main.type}" -> activity ${activity.id} (author ${userId})`);
}

console.log('done');
