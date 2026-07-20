# CLAUDE.md — Virtual Kamogawa

> Place this file at the root of the `virtual-kamogawa` repo, next to
> `Virtual_Kamogawa_Design_Architecture.md`. Claude Code reads it automatically
> at the start of every session. The architecture doc is the source of truth for
> *what* to build; this file is the rules for *how*.

## Project

Virtual Kamogawa — a mobile-first web app that makes the tacit culture (暗黙知)
of Kyoto's Kamogawa riverbank discoverable: a 3D Cesium map of the river, a
"toukou map" web of activity posts people can vote on, an archive, and a
duck-spot QR stamp rally. Full spec: `Virtual_Kamogawa_Design_Architecture.md`
(read it before any non-trivial task; section references below point into it).

## Stack (fixed — do not substitute)

- React 18 + Vite + TypeScript, React Router, Zustand
- CesiumJS via `cesium` + `vite-plugin-cesium`
- Supabase (`@supabase/supabase-js`): Postgres, anonymous auth, Storage, Realtime
- i18next / react-i18next — every user-facing string goes through i18n (en + ja), no hardcoded copy
- Tailwind CSS, with design tokens from §4.1 defined as CSS variables
- localStorage (identity/prefs) + IndexedDB via `localforage` (drafts, offline cache)
- Single repo. Supabase schema lives in `/supabase/migrations/` as SQL files. No separate backend.

## Commands

- `npm run dev` — Vite dev server
- `npm run build` — production build (must pass before any phase is "done")
- `npm run lint` / `npm run typecheck` — must be clean before committing
- `npx supabase db push` — apply migrations (team uses hosted Supabase; `.env.local` holds `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_CESIUM_ION_TOKEN`)

## Architecture rules

1. **Folder structure** is §2 of the architecture doc — screens in `src/screens/<Name>/`, shared pieces in `src/components/`, all Supabase/Cesium/identity access through `src/lib/`. Screens never import `@supabase/supabase-js` directly.
2. **Identity:** anonymous only (§6). `lib/identity.ts` owns `signInAnonymously()`, session restore, and the local profile cache. Never build email/password auth.
3. **Server-authoritative rules** (§7, Appendix A): event-gating of main activities, the 20-sub cap → archive, one-vote-per-user, stamp uniqueness, and the duck-scan geofence are enforced in Postgres (RLS policies, triggers, or Edge Functions) — client checks are UX sugar only.
4. **Cesium cost control** (§8.1): camera locked to the Kyoto bounding rectangle with min/max zoom limits, set in `lib/cesium.ts`. Never remove these limits.
5. **Moderation:** every feed/map query filters `hidden = true`. Report button inserts into `reports`.
6. **Offline-friendly:** every network call has a loading state, an error state with retry, and a cached fallback where the doc calls for one. Assume flaky outdoor mobile signal.
7. **Routes** are fixed: `/` (intro → main map), `/?from=qr&spot=<slug>` (QR entry), `/toukou`, `/archive`, `/duck`, `/duck/scan?spot=<qr_token>`. Don't rename them — physical QR codes will encode these URLs.

## Design rules

- Mobile-first; test at 390×844 before desktop.
- Colors: only the §4.1 tokens (`--kamo-indigo`, `--kamo-river`, `--kamo-moss`, `--kamo-stone`, `--kamo-sand`, `--kamo-sunset`, `--kamo-ink`). No saturated "tech" colors, no default Tailwind palette colors in final UI.
- Type: Shippori Mincho for display, Noto Sans JP for UI (§4.2).
- Motion: calm — fades and eased camera flights, nothing bouncy (§4.3).
- The app is Japanese-first; `ja.json` is never allowed to lag behind `en.json`.
- No stock/AI-generated imagery in the UI. Real photos live in `img/kamogawa/`; custom marks (duck, exclamation) in `img/marks/` as SVG.

## Workflow

- Build in the phase order of `BUILD_PLAN.md`; don't start a phase before the previous one's checklist passes.
- Each phase = one feature branch, small commits, and `npm run build && npm run lint && npm run typecheck` clean before merge.
- Schema changes only via a new file in `/supabase/migrations/` — never edit an applied migration.
- When the spec and this file disagree, the architecture doc wins; flag the conflict instead of guessing.
