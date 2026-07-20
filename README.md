# Virtual Kamogawa

A mobile-first web app that makes the tacit culture (暗黙知) of Kyoto's Kamogawa
riverbank discoverable rather than dictated: a 3D map of the river, a
force-directed "toukou" web of activity posts people vote on, a cookpad-style
archive of how spots have been used over time, and a QR-based duck-stamp
scavenger hunt. Japanese-first, bilingual (JA/EN), no account required.

**Live demo:** https://kamokamo.vercel.app

## Stack

- **React 18 + Vite + TypeScript**, React Router, Zustand
- **CesiumJS** (`cesium` + `vite-plugin-cesium`) for the 3D globe/map
- **Supabase** (Postgres, anonymous auth, Storage, Realtime) — the only backend
- **Tailwind CSS v4** with the design tokens from the architecture doc §4.1
- **i18next** — every user-facing string is in `src/i18n/{en,ja}.json`
- **d3-force** for the toukou activity web
- **localforage** + a service worker (`vite-plugin-pwa`) for offline resilience

The architecture reference is `Virtual_Kamogawa_Design_Architecture.md`; the
build rules are `CLAUDE.md`; the phased build log is `BUILD_PLAN.md`.

## Prerequisites

- Node.js ≥ 20.19 (developed on 22)
- A Supabase project (free tier is fine)
- A Cesium ion access token (free account)

## Setup

```bash
git clone git@github.com:NaimiNafis/kamokamo.git
cd kamokamo
npm install
cp .env.local.example .env.local   # then fill in the three values below
```

`.env.local`:

```
VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<your project's anon / publishable key>
VITE_CESIUM_ION_TOKEN=<your Cesium ion token>
```

### One-time Supabase configuration

1. **Enable anonymous sign-ins**: Supabase Dashboard → Authentication →
   Providers → turn on **Anonymous Sign-Ins**. Without this the app can't
   create the anonymous identities it relies on.
2. **Apply the schema.** With the [Supabase CLI](https://supabase.com/docs/guides/cli):
   ```bash
   npx supabase login
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push          # applies everything in supabase/migrations/
   ```
3. **Seed demo data.** `db push` does not run `seed.sql`; paste the contents of
   `supabase/seed.sql` into the Studio SQL Editor and run it (it's idempotent).
   This adds the 5 activity types, 3 events (one active), and 10 duck spots.
4. **Seed demo map markers** (optional, makes the map feel alive):
   ```bash
   node scripts/seed-demo-activities.mjs
   ```
   This signs in real anonymous users and posts a few main activities through
   the same flow the app uses.

The `photos` Storage bucket, RLS policies, triggers (20-sub archive cap,
10-stamp certificate, vote counters), the event-gating policy, and the
geofenced `scan_duck_spot` RPC are all created by the migrations — no manual
dashboard setup beyond step 1.

## Run

```bash
npm run dev          # Vite dev server
npm run build        # production build (tsc -b && vite build)
npm run preview      # serve the production build (needed to test the PWA/offline)
npm run lint         # ESLint
npm run typecheck    # tsc --noEmit
```

## QR codes for the stamp rally

Each of the 10 duck spots has its own QR image encoding the *same* app URL with
that spot's opaque token: `https://<app>/duck/scan?spot=<qr_token>`. Generate
them all:

```bash
npx tsx scripts/generate-qr.ts
# or point them at a different deployment:
VITE_APP_URL=https://your-domain npx tsx scripts/generate-qr.ts
```

PNGs land in `qr-codes/` (gitignored; reproducible). The stamp scan is
**server-authoritative**: the `scan_duck_spot` RPC recomputes the distance
between the reported location and the spot and only grants the stamp within
120 m — a client cannot self-grant a stamp (direct inserts to `stamps` are
blocked by RLS).

## Identity — the no-account trade-off (§6)

There is **no login**. On first load the app calls Supabase anonymous
sign-in, and the returned user id (plus a cached profile) is the device's
identity. Profile, stamp progress, posts, and votes are keyed to it.

The trade-off: **clearing browser data or switching phones loses the
identity** — there's no way to recover it, because there's no account to log
back into. This is an intentional simplification for a low-friction public
demo. If cross-device continuity is ever needed, an optional "link email" step
can be added later without changing the model.

## Offline behavior

Feeds (toukou, duck, archive) cache their last good result in IndexedDB via
localforage, and a service worker precaches the app shell. On flaky signal or
airplane mode the app shows the cached content with an "offline" banner instead
of a white screen. The 3D globe still needs live tiles, so the map itself is
online-only; the feed screens are the ones that work offline.

## Demo script (~3 minutes)

1. **Open the app** → the intro flies Earth → Japan → Kyoto → the Kamogawa
   Delta, then lands on the 3D map. (First visit also asks three quick
   onboarding questions and opens a 5-slide tutorial.)
2. **Tap the language toggle** (EN/JA) — every string flips instantly.
3. **Tap an ❗ marker** → the **toukou web** opens: main activities in their
   type color with subs orbiting. Like/dislike a post; tap **+** on a main to
   add a sub with a photo; watch it animate in. Open a second browser
   side-by-side to see posts/votes appear live.
4. **Tap "See earlier posts"** on a busy main (or the **Archive** button) →
   the cookpad-style history; open one to see its full sub timeline, archived
   posts included.
5. **Tap a 🦆 marker** → the **duck page**: share a photo, and see the 10-slot
   stamp card.
6. **Scan a duck-spot QR** (`scripts/generate-qr.ts`) while standing near the
   spot → the stamp is collected (try it from far away to see the geofence
   reject it). Collect all 10 → the **certificate** unlocks.
7. **Turn on airplane mode and reload** a feed screen → cached content with an
   offline banner, not a blank page.

## Project layout

```
src/
  app/          routes, error boundary
  screens/      Intro, MainMap, Onboarding, Tutorial, ToukouMap, Archive, Duck
  components/    shared UI (language toggle, map-style switch, stale banner)
  lib/          supabase, identity, cesium, toukou, archive, duck, geo, cache
  i18n/         en.json, ja.json
  store/        zustand (identity)
supabase/
  migrations/   versioned SQL schema + policies + triggers + RPC
  seed.sql      demo activity types, events, duck spots
scripts/        generate-qr.ts, seed-demo-activities.mjs
img/marks/      custom duck + exclamation SVG marks
```
