# Virtual Kamogawa

A mobile-first web app that makes the tacit culture (暗黙知) of Kyoto's Kamogawa
riverbank discoverable rather than dictated: a 3D map of the river, a
force-directed "toukou" web of activity posts people vote on, a cookpad-style
archive of how spots have been used over time, and a QR-based duck-stamp
scavenger hunt. Japanese-first, bilingual (JA/EN), no account required.

**Live demo:** https://kamokamo.vercel.app

## Stack

- **React 18 + Vite + TypeScript**, React Router, Zustand
- **Google Maps Platform 3D Maps** (`Map3DElement`) for the 3D globe/map
- **Supabase** (Postgres, anonymous auth, Storage, Realtime) — the only backend
- **Tailwind CSS v4** with the design tokens documented in `docs/ARCHITECTURE.md`
- **i18next** — every user-facing string is in `src/i18n/{en,ja}.json`
- **d3-force** for the toukou activity web
- **localforage** + a service worker (`vite-plugin-pwa`) for offline resilience

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for how it's built (screens,
data model, identity, event gating, anti-cheat) and [`CLAUDE.md`](CLAUDE.md)
for the working rules this repo follows.

## Prerequisites

- Node.js ≥ 20.19 (developed on 22)
- A Supabase project (free tier is fine)
- A Google Maps Platform API key (see below — a billing account is required)

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
VITE_GOOGLE_MAPS_API_KEY=<your Google Maps Platform key>
```

### One-time Google Maps Platform configuration

This project is run to cost **¥0**. That's achievable, but it depends on two
settings, so don't skip steps 4 and 5.

1. Create a project in the [Google Cloud Console](https://console.cloud.google.com/)
   and **enable billing**. A payment method is required to issue a Maps key at
   all — there is no card-free path.
2. Enable the **Maps JavaScript API**.
3. Create an API key and **restrict it** — this matters, because the key ships
   in client-side JS and can't be hidden:
   - *Application restrictions* → HTTP referrers → `https://kamokamo.vercel.app/*`
     and `http://localhost:5173/*`
   - *API restrictions* → Maps JavaScript API only
4. **Upgrade to a paid billing account** before the trial credit expires. This
   sounds backwards, but the recurring monthly free tier is only granted to
   upgraded accounts — if the trial simply lapses, the API stops and the map
   breaks. On an upgraded account you are charged ¥0 as long as you stay under
   the allowance.
5. **Set a quota cap.** Go to
   [Maps quotas](https://console.cloud.google.com/google/maps-apis/quotas),
   pick **Maps JavaScript API**, and set **`3D Map loads per day`** to **160**
   (it ships as `Unlimited`). ~160/day ≈ 4,960/month, just under the free
   allowance — this is what actually guarantees no bill. `Map loads per day` is
   the separate 2D counter and should stay at 0; leave it alone. Add a budget
   alert as a backstop.

### What the free allowance is

3D map loads bill to the **Immersive Maps** SKU (`4816-83A2-9059`, Pro tier):
**5,000 free loads per month**, resetting on the 1st, then $7.00 per 1,000.

A "load" is one `Map3DElement` creation, not a pan or zoom. Note that
`MainMap` mounts fresh every time someone navigates back to `/`, so a visitor
who tours a place, opens the duck page and returns can spend 3–5 loads. Budget
roughly **1,200–1,600 visitor sessions per month**, not 5,000.

Local development spends the same quota — every hot reload that remounts
`MainMap` is another load. Keep the dev server closed when you aren't using it.

The map is pinned to the Maps JS **`weekly`** (stable) channel in
[`src/lib/map3d.ts`](src/lib/map3d.ts). **Do not set `v: 'alpha'`** — it renders
a dismissible "For development purposes only" banner above the map that every
visitor sees, and the channel can change without notice. The 3D/2D switch does
not need it: 2D is the classic `google.maps.Map`, which is GA.

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
   This adds the 10 activity types, 3 events (one active), and the duck spots
   (8 active, between the Delta and Gojo).
4. **Seed demo map markers** (optional, makes the map feel alive):
   ```bash
   node scripts/seed-demo-activities.mjs
   ```
   This signs in real anonymous users and posts a few main activities through
   the same flow the app uses.

The `photos` Storage bucket, RLS policies, triggers (10-sub archive cap,
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

Each active duck spot has its own QR image encoding the *same* app URL with
that spot's opaque token: `https://<app>/duck/scan?spot=<qr_token>`. Generate
them all:

```bash
npx tsx scripts/generate-qr.ts
# or point them at a different deployment:
VITE_APP_URL=https://your-domain npx tsx scripts/generate-qr.ts
```

PNGs land in `qr-codes/` (gitignored; reproducible).

**Renaming or moving a spot does not invalidate its code.** A QR encodes
`?spot=<qr_token>`, and the token lives on the `duck_spots` row untouched by
either — only the PNG *filename*, which is derived from the name, goes stale.
Re-run the generator after a rename and you get correctly-named files containing
identical codes. Tokens are only ever reissued when `seed.sql` runs against a
fresh database. The stamp scan is
**server-authoritative**: the `scan_duck_spot` RPC recomputes the distance
between the reported location and the spot and only grants the stamp within
120 m — a client cannot self-grant a stamp (direct inserts to `stamps` are
blocked by RLS).

## Identity — the no-account trade-off

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

1. **Open the app** → the intro sweeps from the far side of the globe, across
   Japan and Kyoto, to the Kamogawa Delta, then lands on the 3D map. (First
   visit also asks three quick onboarding questions and opens a 5-slide
   tutorial; mobile gets a one-time "drag to look around" hint.)
2. **Tap the language toggle** (EN/JA) — every string flips instantly.
3. **Tap an ❗ marker** → a short cinematic (framing highlight → fly-in →
   orbit) settles on that spot, then a popup shows its photo/phrase with a
   button into **that place's own toukou web** — main activity in its type
   color, subs orbiting. Thumbs up/down a post; tap **+** on the main to add
   a sub with a photo; watch it animate in. Open a second browser
   side-by-side to see posts/votes appear live. The report button (bottom
   right of a card) asks for a reason.
4. **Tap "See earlier posts"** on a busy main (or the **Archive** button) →
   the cookpad-style history; open one to see its full sub timeline, archived
   posts included.
5. Back on the map, an active gathering shows a **"post an activity"** button
   to add a new main of your own.
6. **Tap a 🦆 marker** → the **duck page**: share a photo, and see the 10-slot
   stamp card.
7. **Scan a duck-spot QR** (`scripts/generate-qr.ts`) while standing near the
   spot → the stamp is collected (try it from far away to see the geofence
   reject it). Not near a spot? Flip **"Test mode: use Delta location"** on
   the scan page to try the flow without traveling. Collect all 10 → the
   **certificate** unlocks.
8. **Turn on airplane mode and reload** a feed screen → cached content with an
   offline banner, not a blank page.

## Project layout

```
src/
  app/          routes, error boundary
  screens/      Intro, MainMap, Onboarding, Tutorial, ToukouMap, Archive, Duck
  components/    shared UI (language toggle, map-style switch, stale banner)
  lib/          supabase, identity, map3d, river, toukou, archive, duck, geo, cache
  i18n/         en.json, ja.json
  store/        zustand (identity)
supabase/
  migrations/   versioned SQL schema + policies + triggers + RPC
  seed.sql      demo activity types, events, duck spots
scripts/        generate-qr.ts, seed-demo-activities.mjs, seed-demo-subs.mjs
img/marks/      custom duck + exclamation SVG marks
img/kamogawa/   real Kamogawa photos, incl. the shared placeholder image
```

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for what each screen does
and how the data model fits together.

## Contributing

Small, focused commits; `npm run build && npm run lint && npm run typecheck`
clean before committing. Schema changes are a new file in
`supabase/migrations/` — never edit one that's already applied. See
[`CLAUDE.md`](CLAUDE.md) for the fuller set of working rules (identity model,
server-authoritative rules, design tokens) this repo follows.
