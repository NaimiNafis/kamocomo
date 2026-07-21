# Architecture

Technical reference for how Virtual Kamogawa is built and why. For setup and
running the app, see the [README](../README.md). For the rules Claude Code (or
any contributor) follows when working in this repo, see
[`CLAUDE.md`](../CLAUDE.md).

## Contents

- [Concept](#concept)
- [Tech stack](#tech-stack)
- [Repo layout](#repo-layout)
- [Routes & screen flow](#routes--screen-flow)
- [Screens in detail](#screens-in-detail)
- [Data model](#data-model)
- [Identity — no accounts](#identity--no-accounts)
- [Event gating](#event-gating)
- [Duck-stamp anti-cheat](#duck-stamp-anti-cheat)
- [Design tokens](#design-tokens)
- [Offline behavior](#offline-behavior)

## Concept

Virtual Kamogawa turns the **暗黙知 (tacit knowledge)** of Kyoto's Kamogawa
riverbank — the unwritten culture of how people actually use the river — into
something visitors can *discover* rather than something they're told via
signage. The app is a discovery layer over the real place:

| Idea | Feature |
|---|---|
| Visualize behavior | The 3D map shows what's happening on the riverbank right now, via markers |
| Observe, read the air | The **toukou web** — activity posts, connected, voteable |
| Discover tacit knowledge | The **archive** — how a spot has been used over time |
| Subtly transmitted | A hidden QR at a photogenic spot can drop a visitor straight into the app |
| Participate | Post an activity, vote, add to someone else's, collect duck stamps |

## Tech stack

| Layer | Choice |
|---|---|
| Framework | React 18 + Vite + TypeScript |
| 3D map | CesiumJS (`cesium` + `vite-plugin-cesium`) |
| Routing | React Router, code-split per screen |
| State | Zustand (identity), otherwise local component state |
| Styling | Tailwind CSS v4, design tokens as CSS variables |
| i18n | i18next / react-i18next — every string in `src/i18n/{en,ja}.json` |
| Graph layout | d3-force (the toukou activity web) |
| Backend | Supabase — Postgres, anonymous auth, Storage, Realtime |
| Offline cache | localforage (IndexedDB) + a service worker (`vite-plugin-pwa`) |
| Hosting | Vercel (frontend) + Supabase cloud |

It's a single repo: Supabase *is* the backend, tracked as SQL migrations
inside this repo (`supabase/migrations/`), so there's no separate server to
host or version alongside the frontend.

## Repo layout

```
src/
  app/          routes (App.tsx), error boundary
  screens/      one folder per screen — Intro, MainMap, Onboarding, Tutorial,
                ToukouMap, Archive, Duck
  components/   shared UI (language toggle, map-style switch, stale banner)
  lib/          all Supabase/Cesium/identity access lives here — screens never
                import @supabase/supabase-js directly
  i18n/         en.json, ja.json (ja is never allowed to lag behind en)
  store/        zustand stores (identity)
supabase/
  migrations/   versioned SQL — schema, RLS, triggers, RPCs (never edit an
                applied migration; add a new file)
  seed.sql      demo activity types, events, duck spots
scripts/        generate-qr.ts, seed-demo-activities.mjs, seed-demo-subs.mjs
img/
  marks/        custom duck + exclamation SVG marks (no stock/AI art)
  kamogawa/     real Kamogawa photos, incl. the shared placeholder image
```

## Routes & screen flow

Routes are fixed — physical QR codes printed at real duck spots encode these
URLs, so paths must not be renamed:

| Route | Screen |
|---|---|
| `/` | Intro (once per session) → the 3D map |
| `/?from=qr&spot=<slug>` | Same, but entered via a hidden photogenic-spot QR |
| `/toukou?main=<id>` | One place's activity web (always entered from a marker) |
| `/archive` , `/archive?main=<id>` | Cookpad-style history grid, or one main's full history |
| `/duck` | Duck photo feed + 10-slot stamp card |
| `/duck/scan?spot=<qr_token>` | Geofenced stamp scan from a physical QR |

```
INTRO (once/session)
  title -> catchphrase -> Earth (far side) -> Japan -> Kyoto -> Kamogawa Delta
     |
     v (first visit only) ONBOARDING: nationality / age / gender
     |
MAIN MAP (3D Cesium, Kyoto-locked)
  "you are here" marker · tutorial · language toggle · map style switch
  event-gated "post an activity" button
  markers:
    !  exclamation -> tap plays a cinematic (frame, fly in, orbit the spot),
       then a popup with that place's photo/phrase and a button into ->
    duck -> /duck
       |
       v
  /toukou?main=<id>  (that marker's own web)     /duck
  main + subs, thumbs up/down, add a sub,          photo feed, stamp card,
  report (with a reason), "see earlier posts"      /duck/scan -> stamps -> certificate
  -> /archive?main=<id>
```

## Screens in detail

### Intro (`src/screens/Intro`)

Plays once per session (`hasSeenIntro` in `sessionStorage`, Skip button always
available): the title fades in, cross-fades to the localized catchphrase, then
the camera flies from the far side of the globe (deliberately the hemisphere
*opposite* Japan, so the flight visibly sweeps across the whole Earth) through
Japan and Kyoto to the Kamogawa Delta. The Kyoto camera-bounds clamp (see
below) only engages once the flight lands — it would otherwise fight the
flight, since the flight legitimately passes through views outside Kyoto.

### Main map (`src/screens/MainMap`)

A full-screen Cesium viewer, camera-locked to a bounding rectangle around
Kyoto with min/max zoom limits (`lib/cesium.ts` — **never remove these**;
they're the cost control that keeps photoreal tile billing bounded to the
area the app actually cares about). A one-time "drag to look around" hint
appears for first-time mobile visitors.

Markers are unclustered on purpose: each needs to be individually tappable so
tapping one can route to *that specific place's* content, not a shared
destination. Tapping an exclamation marker plays a short cinematic — a
pulsing framing highlight at the spot, a close fly-in, and a slow orbit — then
shows a popup with that place's own photo/phrase and a button into
`/toukou?main=<id>`. Tapping a duck marker goes straight to `/duck`.

An event-gated "post an activity" button opens the same composer the toukou
page uses for subs, in main-creation mode (see [Event gating](#event-gating)).

### Toukou / activity web (`src/screens/ToukouMap`)

Always scoped to one place (`?main=<id>`) — a bare `/toukou` visit has
nowhere to go and bounces back to the map. The graph is one main (pinned at
the center, in its activity-type's color) plus its subs (a lighter shade,
linked to the main), laid out with d3-force. Collision radii are sized to
each card's full bounding circle (not just its width) and the simulation is
pre-warmed synchronously before first paint, so even the densest graph (up to
21 nodes — one main plus the 20-sub cap) opens already settled instead of
visibly untangling.

A node card shows a photo (or the shared placeholder if the post has none),
the phrase, thumbs up/down (one vote per user, switchable), and — mains
only — a `+` to add a sub and, once any of its subs have overflowed the cap,
a "see earlier posts" link into the archive. The report button (every card)
opens a reason picker (inappropriate / spam / off-topic / other) rather than
reporting blind. One finger pans; a second finger pinch-zooms about the
midpoint between the two touches.

Realtime keeps the graph current: any insert/update to `activities` or
`votes` triggers a debounced refetch.

### Archive (`src/screens/Archive`)

A cookpad-style grid of every non-hidden main, newest first; opening one
shows its full sub history — live and archived — in chronological order, the
long-term record of how a spot has been used. Reached from the toukou page's
"see earlier posts" stub or the archive button on the map.

### Duck page (`src/screens/Duck`)

A duck-photo feed (social, decoupled from stamps) plus the 10-slot stamp
card. Stamps are earned only by scanning a QR at one of the 10 physical duck
spots — see [Duck-stamp anti-cheat](#duck-stamp-anti-cheat). Collecting all
10 unlocks a screenshot-worthy certificate.

## Data model

Full schema lives in `supabase/migrations/` (the only source of truth — never
edit an applied migration, add a new file). Summary:

| Table | Purpose |
|---|---|
| `profiles` | One row per anonymous user; nationality/age/gender from onboarding |
| `activity_types` | Seeded palette (writing, reading, walking, music, yoga…) |
| `events` | Windows when main activities can be created |
| `activities` | Both mains and subs (`kind`), `parent_id`, `activity_type`, `photo_url`, `phrase`, `lat/lng`, `likes`/`dislikes`, `archived`, `hidden` |
| `votes` | One row per `(user_id, activity_id)`; switching updates it in place |
| `duck_posts` | The social duck-photo feed, separate from stamps |
| `duck_spots` | The 10 physical stamp locations, each with an opaque `qr_token` |
| `stamps` | One row per `(user_id, duck_spot_id)` a user has earned |
| `certificates` | Issued once a user has 10 distinct stamps |
| `reports` | Moderation flags, with a reason, on an activity or duck post |
| `qr_entries` | Analytics: which photogenic-spot QR drove an app entry |

Enforced server-side (RLS policies, triggers, or the `scan_duck_spot` RPC —
client checks are UX sugar only):

- **Main-only-during-an-event**: a restrictive insert policy rejects a
  `kind='main'` row unless `now()` falls inside an active event's window.
- **20-sub cap**: after each sub insert, a trigger archives every sub beyond
  the 20 most recent (by `created_at`) for that main.
- **One vote per user per activity**: the `votes` primary key.
- **Stamp geofence**: `scan_duck_spot` recomputes the distance server-side
  from whatever point the client submits and only awards the stamp within
  ~120 m — the client never grants a stamp itself.
- **Moderation**: every feed/map query filters `hidden = true`; the team
  flips it by hand in Supabase Studio after reviewing `reports`.

## Identity — no accounts

There's no login. On first load the app calls Supabase anonymous sign-in
(`lib/identity.ts`); the returned user id, cached locally, *is* the device's
identity for everything — profile, posts, votes, stamps.

**The trade-off**: clearing browser data or switching phones loses the
identity, since there's no account to recover it from. This is an intentional
simplification for a low-friction public demo. If cross-device continuity is
ever needed, an optional "link email" step could be added later without
changing the underlying model.

## Event gating

Main activities can only be created during a live "gathering" event; subs are
never gated (that's how the culture keeps accreting between events). The
authoritative check is compute-on-read — `getActiveEvent()` asks "is there an
event window around `now()`?" rather than trusting a stored flag — backed by
the restrictive RLS policy above, so a bypassed client still can't sneak a
main through outside a window. Between events, the map/toukou UI hides the
"post an activity" affordance and shows a localized "next gathering in…"
countdown instead. Events themselves are managed directly in the Supabase
Studio table editor — no `/admin` page.

## Duck-stamp anti-cheat

A stamp means "I was really at this spot," layered three ways:

1. **Geofence** — the scan must report a location within ~120 m of the spot,
   re-checked server-side (`scan_duck_spot` RPC) against whatever the client
   submits, so a bypassed client still fails.
2. **Opaque `qr_token`** — the QR encodes a random string, not a guessable id.
3. **`UNIQUE(user_id, duck_spot_id)`** — a re-scan is a silent no-op ("already
   collected"), not a duplicate stamp.

For testing the flow without physically visiting: `/duck/scan` has a "Delta
test mode" toggle that submits the Kamogawa Delta's own coordinates instead of
the device's GPS fix. This doesn't weaken the server-side check — it's
equivalent to (and no easier to abuse than) spoofing device GPS, just without
needing to.

## Design tokens

Muted, natural palette — river blue-grey, riverbank green, warm stone, dusk
indigo. No saturated "tech" colors, no default Tailwind palette colors in
final UI.

| Token | Hex | Use |
|---|---|---|
| `--kamo-indigo` | `#2E3A59` | Primary text, intro background, main-activity accents |
| `--kamo-river` | `#6E8CA0` | Water, secondary UI, map overlays |
| `--kamo-moss` | `#7C8C5A` | Riverbank green, sub-activity accents |
| `--kamo-stone` | `#E9E4D8` | Backgrounds |
| `--kamo-sand` | `#D8C7A8` | Cards, surfaces |
| `--kamo-sunset` | `#E0885E` | Warm accent — likes, active states, the duck theme |
| `--kamo-ink` | `#1C1C1A` | High-contrast text |

Type: **Shippori Mincho** for display (the title, catchphrases), **Noto Sans
JP** for UI text — both render Japanese and Latin well. Motion is calm:
eased camera flights, fades, nothing bouncy.

## Offline behavior

Every feed (toukou, duck, archive) caches its last good result in IndexedDB
via localforage and shows it with a stale banner if a refetch fails, instead
of a blank screen. A service worker precaches the app shell so a reload in
airplane mode still renders the UI. The 3D map itself needs live tiles and
stays online-only; the feed screens are the ones built to work offline.
