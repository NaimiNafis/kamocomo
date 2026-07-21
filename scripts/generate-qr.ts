// Generates a scannable QR PNG for each duck spot's stamp-scan URL (see
// "Duck-stamp anti-cheat" in docs/ARCHITECTURE.md). All QRs point at the SAME
// app -- they differ only by the opaque `?spot=<qr_token>` that tells the app
// which spot was scanned.
//
// Usage:
//   npx tsx scripts/generate-qr.ts
//   VITE_APP_URL=https://your-domain npx tsx scripts/generate-qr.ts
//
// Reads Supabase creds from .env.local; writes PNGs to qr-codes/.

import { createClient } from '@supabase/supabase-js';
import QRCode from 'qrcode';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function readEnv(): Record<string, string> {
  const text = fs.readFileSync(path.join(rootDir, '.env.local'), 'utf8');
  return Object.fromEntries(
    text
      .split('\n')
      .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
      .map((l) => {
        const idx = l.indexOf('=');
        return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()];
      }),
  );
}

async function main() {
  const env = readEnv();
  const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });

  const baseUrl = (process.env.VITE_APP_URL ?? 'https://kamokamo.vercel.app').replace(/\/$/, '');

  const { data: spots, error } = await supabase
    .from('duck_spots')
    .select('name_en, qr_token, active')
    .eq('active', true)
    .order('name_en');
  if (error) throw error;

  const outDir = path.join(rootDir, 'qr-codes');
  fs.mkdirSync(outDir, { recursive: true });

  for (const spot of spots) {
    const url = `${baseUrl}/duck/scan?spot=${spot.qr_token}`;
    const slug = spot.name_en.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const file = path.join(outDir, `${slug}.png`);
    await QRCode.toFile(file, url, { width: 512, margin: 2 });
    console.log(`${spot.name_en.padEnd(22)} -> ${path.relative(rootDir, file)}  (${url})`);
  }

  console.log(`\nGenerated ${spots.length} QR codes in ${path.relative(rootDir, outDir)}/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
