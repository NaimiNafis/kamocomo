# CLAUDE.md — Virtual Kamogawa

> Claude Code reads this file automatically at the start of every session.
> It's the rules for *how* to work in this repo. For *what* the app is and
> how it's built, see [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — read
> it before any non-trivial task.

## Project

Virtual Kamogawa — a mobile-first web app that makes the tacit culture (暗黙知)
of Kyoto's Kamogawa riverbank discoverable: a 3D Google Maps view of the river, a
"toukou map" web of activity posts people can vote on, an archive, and a
duck-spot QR stamp rally. Live at https://kamokamo.vercel.app.

## Stack (fixed — do not substitute)

- React 18 + Vite + TypeScript, React Router, Zustand
- Google Maps Platform 3D Maps (`Map3DElement`) via `@googlemaps/js-api-loader`,
  pinned to the **`alpha`** channel. That's a known, accepted risk: `MapMode.ROADMAP`
  (the flat cartoonish "Map" style) is pre-GA and exists nowhere else. If the map
  breaks unannounced in production, `loadMaps3d()` in `lib/map3d.ts` is the first
  suspect — reverting to `weekly` and dropping `'roadmap'` from `MapStyle` restores
  a working map.
- Supabase (`@supabase/supabase-js`): Postgres, anonymous auth, Storage, Realtime
- i18next / react-i18next — every user-facing string goes through i18n (en + ja), no hardcoded copy
- Tailwind CSS, with design tokens (`docs/ARCHITECTURE.md`) defined as CSS variables
- localStorage (identity/prefs) + IndexedDB via `localforage` (drafts, offline cache)
- Single repo. Supabase schema lives in `/supabase/migrations/` as SQL files. No separate backend.

## Commands

- `npm run dev` — Vite dev server
- `npm run build` — production build (must pass before considering anything "done")
- `npm run lint` / `npm run typecheck` — must be clean before committing
- `npx supabase db push` — apply migrations (team uses hosted Supabase; `.env.local` holds `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_GOOGLE_MAPS_API_KEY`)

## Architecture rules

1. **Folder structure** — screens in `src/screens/<Name>/`, shared pieces in `src/components/`, all Supabase/map/identity access through `src/lib/`. Screens never import `@supabase/supabase-js` directly.
2. **Identity:** anonymous only. `lib/identity.ts` owns `signInAnonymously()`, session restore, and the local profile cache. Never build email/password auth.
3. **Server-authoritative rules:** event-gating of main activities, the 10-sub cap → archive, one-vote-per-user, stamp uniqueness, and the duck-scan geofence are enforced in Postgres (RLS policies, triggers, or RPCs) — client checks are UX sugar only.
4. **Map cost control:** the camera is locked to the Kamogawa corridor (`bounds`), with `minAltitude`/`maxAltitude` and a `maxTilt` cap, set in `applyKamogawaConstraints()` in `lib/map3d.ts`. Never remove these limits. They're lifted only for the intro flight and the marker-tap cinematic, and restored right after.
5. **Moderation:** every feed/map query filters `hidden = true`. The report button opens a reason picker and inserts into `reports`.
6. **Offline-friendly:** every network call has a loading state, an error state with retry, and a cached fallback where it matters. Assume flaky outdoor mobile signal.
7. **Routes** are fixed: `/` (intro → main map), `/?from=qr&spot=<slug>` (QR entry), `/toukou?place=<id>` (always entered from a specific place marker), `/archive`, `/duck`, `/duck/scan?spot=<qr_token>`. Don't rename them — physical QR codes will encode these URLs.

## Design rules

- Mobile-first; test at 390×844 before desktop.
- Colors: only the `docs/ARCHITECTURE.md` tokens (`--kamo-indigo`, `--kamo-river`, `--kamo-moss`, `--kamo-stone`, `--kamo-sand`, `--kamo-sunset`, `--kamo-ink`). No saturated "tech" colors, no default Tailwind palette colors in final UI.
- Type: Shippori Mincho for display, Noto Sans JP for UI.
- Motion: calm — fades and eased camera flights, nothing bouncy.
- The app is Japanese-first; `ja.json` is never allowed to lag behind `en.json`.
- No stock/AI-generated imagery in the UI. Real photos live in `img/kamogawa/`; custom marks (duck, exclamation) in `img/marks/` as SVG.

## Workflow

- Small, focused commits, each with a conventional-commit message; group unrelated changes into separate commits rather than one large one.
- `npm run build && npm run lint && npm run typecheck` clean before committing.
- Schema changes only via a new file in `/supabase/migrations/` — never edit an applied migration.
- When `docs/ARCHITECTURE.md` and actual behavior disagree, treat the code as ground truth and update the doc — flag the conflict instead of guessing which is stale.
