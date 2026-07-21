// Demo sub-activity seeder (§C8): fills out each Phase 5 demo main with a
// small cluster of subs, and pushes one main (Reading) to 21 subs so the
// 20-sub cap trigger archives the oldest one -- letting the toukou "See
// earlier posts" stub and the archive's "Archived" badge actually be
// observed, not just coded.
//
// Same real signInAnonymously() + insert flow as seed-demo-activities.mjs,
// for the same reason (author_id must be a genuine profiles/auth.users row).
// RLS only requires author_id = auth.uid() (no per-author cap, and the app
// never displays who authored a post), so this reuses a *single* signed-in
// session for every sub in a run rather than one sign-in per post -- cheap
// on the anonymous-auth rate limit, which is easy to exhaust while seeding.
//
// Resumable: computed per place as "how many more are needed", not "does it
// have any yet" -- a run interrupted partway (e.g. by that rate limit) can
// just be re-run and it picks up where it left off, continuing the numbering
// on the 21-sub place instead of restarting it.
//
// Usage: node scripts/seed-demo-subs.mjs

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

function freshClient() {
  return createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}

// Matched by phrase (stable across environments) rather than a hardcoded id.
// `target` is the total sub count this place should end up with.
const PLACES = [
  {
    mainPhrase: 'morning pages by the water, works every time',
    target: 5,
    subs: [
      { phrase: 'brought my notebook again, this spot never disappoints' },
      { phrase: '川の音を聞きながら書くと集中できる', photo: true },
      { phrase: 'found a good rhythm here today' },
      { phrase: 'wrote three pages before the sun was even up' },
      { phrase: 'ノートを忘れずに、鴨川メモの続き' },
    ],
  },
  {
    mainPhrase: 'best stretch for an evening walk, ducks included',
    target: 5,
    subs: [
      { phrase: 'saw a whole family of ducks crossing today', photo: true },
      { phrase: '夕方の散歩、風が気持ちいい' },
      { phrase: 'good pace for a 20-minute loop' },
      { phrase: 'brought my dog, he loved it', photo: true },
      { phrase: '犬の散歩にちょうどいい距離' },
    ],
  },
  {
    mainPhrase: '弾き語りにちょうどいい場所、誰も気にしない',
    target: 5,
    subs: [
      { phrase: '今日はギターを弾きに来た', photo: true },
      { phrase: 'played for about an hour, a few people stopped to listen' },
      { phrase: 'ハーモニカ持ってきた' },
      { phrase: 'someone joined in with a tambourine, it was fun', photo: true },
      { phrase: '練習にちょうどいい静かな時間帯' },
    ],
  },
  {
    mainPhrase: '朝日を浴びながらヨガ、おすすめです',
    target: 5,
    subs: [
      { phrase: '今朝も日の出ヨガ' },
      { phrase: 'stretched for 30 minutes, felt great after', photo: true },
      { phrase: 'マットを持ってきて正解だった' },
      { phrase: 'joined a small group doing sun salutations' },
      { phrase: '涼しい時間帯がおすすめ', photo: true },
    ],
  },
  {
    // The archive-overflow demo: 21 subs -> the oldest gets archived.
    mainPhrase: 'quiet corner, good for finishing a book',
    target: 21,
    subs: buildReadingSubs(),
  },
];

function buildReadingSubs() {
  const templates = [
    (n) => ({ phrase: `day ${n}: finished another chapter by the river` }),
    (n) => ({ phrase: `${n}冊目、ここで読むと集中できる` }),
    (n) => ({ phrase: `back again with a new book, #${n}` }),
    (n) => ({ phrase: `静かな時間、${n}回目の読書` }),
    (n) => ({ phrase: `brought a coffee and book #${n}, perfect combo` }),
  ];
  const subs = [];
  for (let i = 1; i <= 21; i++) {
    const sub = templates[i % templates.length](i);
    // A few carry a real photo so the overflow demo also shows picture cards.
    sub.photo = i % 6 === 0;
    subs.push(sub);
  }
  return subs;
}

const anon = freshClient();
const { data: mains, error: mainsError } = await anon
  .from('activities')
  .select('id, phrase, activity_type, lat, lng')
  .eq('kind', 'main')
  .eq('hidden', false);
if (mainsError) throw mainsError;

const { data: existingSubs, error: subsCountError } = await anon
  .from('activities')
  .select('parent_id')
  .eq('kind', 'sub');
if (subsCountError) throw subsCountError;
const subCountByParent = new Map();
for (const s of existingSubs) subCountByParent.set(s.parent_id, (subCountByParent.get(s.parent_id) ?? 0) + 1);

// Resolve what's actually left to do before touching auth at all.
const work = [];
for (const place of PLACES) {
  const main = mains.find((m) => m.phrase === place.mainPhrase);
  if (!main) {
    console.warn(`main not found for phrase "${place.mainPhrase}" -- skipping`);
    continue;
  }
  const already = subCountByParent.get(main.id) ?? 0;
  const remaining = place.subs.slice(already, place.target);
  if (remaining.length === 0) {
    console.log(`main "${place.mainPhrase}" already has ${already}/${place.target} subs -- nothing to do`);
    continue;
  }
  console.log(`"${place.mainPhrase}": ${already}/${place.target} so far, adding ${remaining.length} more`);
  work.push({ main, remaining });
}

if (work.length === 0) {
  console.log('nothing left to seed, done');
  process.exit(0);
}

// One shared author for everything below -- cheap on the anonymous sign-in
// rate limit, and the app never surfaces author identity anyway.
const { data: sign, error: signError } = await anon.auth.signInAnonymously();
if (signError) throw signError;
const userId = sign.user.id;
const { error: profileError } = await anon.from('profiles').upsert({ id: userId });
if (profileError) throw profileError;

const placeholderBytes = fs.readFileSync(PLACEHOLDER_PATH);

for (const { main, remaining } of work) {
  for (const sub of remaining) {
    let photoUrl = null;
    if (sub.photo) {
      const storagePath = `${userId}/${crypto.randomUUID()}.jpg`;
      const { error: uploadError } = await anon.storage
        .from('photos')
        .upload(storagePath, placeholderBytes, { contentType: 'image/jpeg', upsert: false });
      if (uploadError) throw uploadError;
      photoUrl = anon.storage.from('photos').getPublicUrl(storagePath).data.publicUrl;
    }

    const { error: insertError } = await anon.from('activities').insert({
      kind: 'sub',
      parent_id: main.id,
      activity_type: main.activity_type,
      author_id: userId,
      phrase: sub.phrase,
      photo_url: photoUrl,
      lat: main.lat,
      lng: main.lng,
    });
    if (insertError) throw insertError;
    console.log(`  + [${main.phrase}] ${sub.phrase}${photoUrl ? ' (with photo)' : ''}`);
  }
}

console.log('done');
