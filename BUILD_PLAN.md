# BUILD_PLAN.md — Virtual Kamogawa, phased Claude Code prompts

> How to use: work through the phases in order. For each phase, paste the
> **Prompt** block into Claude Code, review what it builds, and only move on
> when every item in **Done when** passes. Keep `CLAUDE.md` and
> `Virtual_Kamogawa_Design_Architecture.md` in the repo root so Claude Code
> always has the spec.
>
> Before Phase 1, do these one-time manual steps yourself:
> 1. Create a Supabase project → copy URL + anon key into `.env.local`.
> 2. Enable **anonymous sign-ins** (Supabase Dashboard → Authentication → Providers).
> 3. Create a Cesium ion account → token into `.env.local` as `VITE_CESIUM_ION_TOKEN`.
> 4. Put your reference photos into `img/references/` and `img/kamogawa/`.

---

## Phase 1 — Scaffold + globe

**Prompt**

> Read CLAUDE.md and §2 of Virtual_Kamogawa_Design_Architecture.md. Scaffold the
> project: Vite + React 18 + TypeScript, React Router, Zustand, Tailwind (with
> the §4.1 color tokens as CSS variables and the §4.2 Google Fonts wired in),
> i18next with `src/i18n/en.json` and `ja.json`, ESLint + typecheck scripts, and
> the folder structure from §2 (including `img/` subfolders with .gitkeep).
> Install `cesium` + `vite-plugin-cesium` and render a full-screen Cesium globe
> at `/` using `VITE_CESIUM_ION_TOKEN`, with default Cesium UI chrome hidden.
> In `src/lib/cesium.ts`, add the Kyoto camera constraints from §8.1
> (bounding rectangle around Kyoto, min/max zoom) and apply them.

**Done when**
- [ ] `npm run dev` shows a globe; you cannot pan the camera away from the Kyoto region or zoom out to space
- [ ] `npm run build && npm run lint && npm run typecheck` all pass
- [ ] Deployed once to Vercel/Netlify to prove the pipeline

---

## Phase 2 — Intro sequence

**Prompt**

> Implement the intro screen per §5.1: (1) "Virtual Kamogawa" fades in using
> Shippori Mincho, (2) cross-fades to the localized catchphrase
> 皆んなの鴨川、守り続けよう, (3) reveals the globe and flies the camera
> Earth → Japan → Kyoto → Kamogawa Delta (35.030 N, 135.772 E) over ~4s with
> eased timing. Runs once per session via `hasSeenIntro` in sessionStorage,
> with a Skip button. Motion should feel calm (§4.3). After the flight, land
> on the main-map route.

**Done when**
- [ ] Full sequence plays on a fresh session; reload skips straight to the map; Skip works mid-flight
- [ ] Catchphrase switches with language; both fonts render correctly

---

## Phase 3 — Supabase: schema, identity, onboarding

**Prompt**

> Read §6, §7, and Appendix A of the architecture doc. Create the initial SQL
> migration in `/supabase/migrations/` with every table from §7 (profiles,
> activity_types, events, activities, votes, duck_posts, duck_spots, stamps,
> certificates, reports) plus: RLS on all tables (public read of non-hidden
> rows; writes only where `author_id`/`user_id` = `auth.uid()`), the
> "mains only during an active event" insert policy from A.1, a trigger for the
> 20-sub cap → `archived=true` on the oldest sub, and a trigger that inserts a
> `certificates` row at 10 distinct stamps. Add a `seed.sql` with activity
> types (writing, reading, walking, music, yoga + colors), 2–3 event rows
> (one currently active), and 10 duck_spots along the river with random
> qr_tokens. Then build `src/lib/identity.ts` (anonymous sign-in on first
> load, silent session restore, localStorage profile cache) and the
> onboarding modal per §5.2 (nationality/age-range/gender as one-tap selects,
> shown once, written to cache + `profiles`).

**Done when**
- [ ] Migrations apply cleanly to a fresh Supabase project; RLS verified (anon user cannot update someone else's row — test it)
- [ ] First visit: anonymous session created, onboarding shows once, profile row appears in Supabase; second visit: no onboarding, same user id
- [ ] Inserting a 21st sub archives the oldest (test via SQL)

---

## Phase 4 — Main map shell + tutorial

**Prompt**

> Build the main map screen per §5.3 and the tutorial per §5.4. Overlay on the
> Cesium map: top bar with tutorial button + EN/JA language toggle;
> bottom-right map-style switch (photoreal ↔ flat imagery for now); a
> "you are here" marker from the Geolocation API falling back to the Kamogawa
> default when denied. Tutorial: 5-slide popup over a dimmed, non-interactive
> map — media placeholder on top, i18n text below, dot pagination, swipe +
> arrows, close button. Auto-open it once for first-time users (localStorage
> flag).

**Done when**
- [ ] All controls work at 390×844; map is untouchable while the tutorial is open
- [ ] Language toggle flips every visible string instantly; dots track the slide

---

## Phase 5 — Markers

**Prompt**

> Load markers onto the map per §5.3/§4.4: exclamation markers from non-hidden
> main `activities` (lat/lng) and duck markers from active `duck_spots`. Use
> SVG billboard markers (placeholder art in `img/marks/` for now — ink-brush
> exclamation, custom duck). Tap exclamation → `/toukou`; tap duck → `/duck`.
> Cluster markers when zoomed out. Subscribe to Supabase Realtime so new
> activities appear without reload.

**Done when**
- [ ] Seeded markers render at correct positions; taps route correctly
- [ ] Inserting an activity row in Supabase Studio makes its marker appear live

---

## Phase 6 — Toukou map (the big one)

**Prompt**

> Read §5.5 and A.1 carefully, then build `/toukou`. Force-directed graph
> (d3-force or react-force-graph): main activity pinned center in its
> activity-type color, subs orbiting in a lighter shade, edges as strings.
> Node card: photo, like/dislike (writes to `votes`, one per user, switchable),
> user phrase, and on mains a `+` button. `+` opens a sub-activity composer:
> photo upload to Supabase Storage, phrase, submit → node animates in. Show at
> most 20 subs (server trigger already archives overflow); tapping an archived
> stub links to `/archive`. Event gating per A.1: `getActiveEvent()` /
> `getNextEvent()` helpers; when no event is active hide "create main" and show
> the localized next-gathering countdown chip; subs always creatable. Add a
> report button on every card (inserts into `reports`). Realtime: new
> nodes/votes appear live.

**Done when**
- [ ] Graph renders seeded data; like→dislike switches a single `votes` row
- [ ] Sub creation works end-to-end including photo upload; 21st sub visually bumps the oldest
- [ ] With no active event (edit rows in Studio): main creation is hidden, countdown shows, DB rejects a forced main insert
- [ ] Two browsers open side by side see each other's posts/votes live

---

## Phase 7 — Archive

**Prompt**

> Build `/archive` per §5.6: cookpad-style card grid of past main activities
> (ended events) and archived subs, filtering out hidden rows. Tapping a main
> opens its detail: the main's card plus all its subs (live + archived) in
> chronological order — the record of how the spot was used over time.
> Entry points: from an archived stub on the toukou map and from main-map
> navigation. i18n throughout.

**Done when**
- [ ] Archived subs from Phase 6 appear here, linked from the toukou map
- [ ] Detail view shows a main's full sub history in order

---

## Phase 8 — Duck page, QR scan, stamps, certificate

**Prompt**

> Read §5.7 and A.2, then build: (1) `/duck` — cookpad-style duck-photo feed
> (upload, report button, hidden-filtered; decoupled from stamps) plus the
> stamp card showing 10 slots with earned stamps filled. (2) `/duck/scan?spot=<qr_token>`
> per A.2b: ensure anonymous session, look up spot by token, **geofence**:
> get device location and verify within 120 m — enforce server-side too (RPC/
> Edge Function that recomputes the distance before inserting the stamp);
> too far or no permission → friendly localized "get closer" screen with retry.
> Success → stamp animation → updated card; re-scan → "already collected";
> 10th stamp → certificate unlocked. (3) Certificate page: screenshot-worthy,
> duck mark + both languages, tied to this device. (4) `/?from=qr&spot=<slug>`
> entry per A.2a: parse params, position the intro near the spot, log an entry
> analytics row. Also add a small `scripts/generate-qr.ts` that outputs a QR
> PNG for each duck spot's scan URL.

**Done when**
- [ ] Scan flow works with a spoofed location near a spot; server rejects a scan whose reported location is far away even when the client is bypassed
- [ ] Re-scan shows "already collected"; 10 stamps (seed via SQL) unlock the certificate
- [ ] QR script outputs 10 scannable PNGs pointing at the right URLs

---

## Phase 9 — Polish & hardening

**Prompt**

> Final pass: (1) audit `ja.json` vs `en.json` for parity and natural Japanese;
> (2) empty/loading/error states with retry on every screen; (3) offline
> resilience — cache feeds in localforage and show cached data with a stale
> banner when offline, keep photo-upload drafts in IndexedDB across reloads;
> (4) verify every feed/map/archive query filters hidden rows; (5) mobile
> QA at 390×844 including Cesium performance (cap resolution scale if needed);
> (6) Lighthouse pass; (7) README: setup, env vars, migration + seed steps,
> the no-account identity trade-off (§6 caveat), and the demo script.

**Done when**
- [ ] Airplane-mode reload shows cached content, not a white screen
- [ ] A teammate can clone → follow the README → run the app against a fresh Supabase project
- [ ] Full demo walkthrough works on a real phone over mobile data

---

## Suggested first message to Claude Code

> Read CLAUDE.md, BUILD_PLAN.md, and Virtual_Kamogawa_Design_Architecture.md.
> Summarize your understanding of the project in a few sentences, then start
> Phase 1 of BUILD_PLAN.md.
