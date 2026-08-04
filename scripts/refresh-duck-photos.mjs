// Swaps the demo duck photos for whatever is in img/duck/ right now.
//
// ─────────────────────────────────────────────────────────────────────────────
//  REPLACING THE DEMO PHOTOS
//
//    1. Put the new pictures in  img/duck/  , named duck-example-1.jpg …
//       duck-example-10.jpg (replacing the old ones).
//    2. Run:  npm run duck-photos
//    3. Reload the site. Existing posts now show the new pictures.
// ─────────────────────────────────────────────────────────────────────────────
//
// Why this doesn't touch the database: a duck_post stores the URL of a storage
// object, and the seeded ones all point at
// `<owner>/demo-ducks/duck-example-N.jpg`. Uploading over those same paths
// changes what the URL serves, so every post referencing it updates at once —
// no rows rewritten, nothing re-seeded, vote counts and authors untouched.
// Re-running seed-demo-ducks.mjs would instead add MORE posts, which is not
// the same thing at all.
//
// The paths are read back from the posts rather than assumed, because the
// owner folder is whichever demo account happened to be first when the board
// was seeded. Anything that isn't a demo-ducks object is left strictly alone:
// those are real photos people took through the app, and they are not ours to
// overwrite.
//
// ⚠ Needs the admin key, same as the seed scripts:
//   SUPABASE_SECRET_KEY=sb_secret_...  in .env.local (no VITE_ prefix).
//
// Usage: node scripts/refresh-duck-photos.mjs [--dry-run]

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

const db = createClient(env.VITE_SUPABASE_URL, ADMIN_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const PHOTO_DIR = path.join(rootDir, 'img/duck');
/** Only objects on this path are ours to replace. */
const DEMO_SEGMENT = '/demo-ducks/';

const { data: posts, error } = await db.from('duck_posts').select('id, photo_url');
if (error) throw error;

/** storage object path -> how many posts show it */
const demo = new Map();
let untouched = 0;
for (const p of posts) {
  const m = p.photo_url?.match(/\/photos\/(.+)$/);
  if (!m) continue;
  const objectPath = m[1];
  if (!objectPath.includes(DEMO_SEGMENT)) {
    untouched++;
    continue;
  }
  demo.set(objectPath, (demo.get(objectPath) ?? 0) + 1);
}

console.log(`${posts.length} duck posts`);
console.log(`  ${demo.size} demo photo(s) referenced by ${[...demo.values()].reduce((a, b) => a + b, 0)} post(s)`);
console.log(`  ${untouched} post(s) use people's own photos and are left alone`);

if (!demo.size) {
  console.log('\nNothing to refresh.');
  process.exit(0);
}

let replaced = 0;
const missing = [];
console.log('');
for (const [objectPath, count] of [...demo].sort()) {
  const file = path.basename(objectPath);
  const local = path.join(PHOTO_DIR, file);
  if (!fs.existsSync(local)) {
    missing.push(file);
    console.log(`  SKIP ${file} — no such file in img/duck/`);
    continue;
  }
  if (dryRun) {
    console.log(`  would replace ${objectPath}  (${count} post(s))`);
    continue;
  }
  const { error: upErr } = await db.storage
    .from('photos')
    .upload(objectPath, fs.readFileSync(local), {
      contentType: 'image/jpeg',
      upsert: true,
    });
  if (upErr) throw upErr;
  replaced++;
  console.log(`  replaced ${file}  (${count} post(s) now show the new picture)`);
}

if (missing.length) {
  console.log(`\nMissing locally: ${missing.join(', ')}`);
  console.log('Those posts keep their old picture until a file with that name exists.');
}

console.log(
  dryRun
    ? '\nDry run — nothing uploaded.'
    : `\ndone — ${replaced} photo(s) replaced, no database rows changed.`,
);
