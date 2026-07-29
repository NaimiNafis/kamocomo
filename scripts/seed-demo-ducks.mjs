// Demo seeder for the duck graph (item 6): posts a couple of photos onto the
// first few ducks so the duck page's graph shows real photo subs. Uploads the
// shared placeholder image as each post's photo. Idempotent: skips a duck that
// already has photos. Reuses a single anon session (author_id must be a real
// auth.users row; the app never shows authorship).
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

const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const placeholderBytes = fs.readFileSync(path.join(rootDir, 'img/kamogawa/placeholder-riverbank.jpg'));

const { data: sign, error: signError } = await sb.auth.signInAnonymously();
if (signError) throw signError;
const userId = sign.user.id;
await sb.from('profiles').upsert({ id: userId });

const { data: spots, error: se } = await sb
  .from('duck_spots')
  .select('id, name_en')
  .eq('active', true)
  .order('lat', { ascending: false });
if (se) throw se;

const { data: existing, error: ee } = await sb
  .from('duck_posts')
  .select('duck_spot_id')
  .not('duck_spot_id', 'is', null);
if (ee) throw ee;
const withPhotos = new Set(existing.map((p) => p.duck_spot_id));

// Give the first 5 ducks 2 photos each.
for (const spot of spots.slice(0, 5)) {
  if (withPhotos.has(spot.id)) {
    console.log(`${spot.name_en} already has photos -- skipping`);
    continue;
  }
  for (let n = 0; n < 2; n++) {
    const storagePath = `${userId}/${crypto.randomUUID()}.jpg`;
    const { error: ue } = await sb.storage
      .from('photos')
      .upload(storagePath, placeholderBytes, { contentType: 'image/jpeg', upsert: false });
    if (ue) throw ue;
    const photoUrl = sb.storage.from('photos').getPublicUrl(storagePath).data.publicUrl;
    const { error: ie } = await sb
      .from('duck_posts')
      .insert({ author_id: userId, photo_url: photoUrl, duck_spot_id: spot.id, lat: 35.03, lng: 135.772 });
    if (ie) throw ie;
  }
  console.log(`+ ${spot.name_en}: 2 photos`);
}

console.log('done');
