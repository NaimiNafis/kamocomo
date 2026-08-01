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
| 3D map | Google Maps Platform 3D Maps (`Map3DElement`, `alpha` channel — see below) |
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
  lib/          all Supabase/map/identity access lives here — screens never
                import @supabase/supabase-js directly. map3d.ts owns the
                Google Maps 3D wrapper
  i18n/         en.json, ja.json (ja is never allowed to lag behind en)
  store/        zustand stores (identity)
supabase/
  migrations/   versioned SQL — schema, RLS, triggers, RPCs (never edit an
                applied migration; add a new file)
  seed.sql      demo activity types, events, duck spots (places ship in a migration)
scripts/        generate-qr.ts, seed-demo-places.mjs, seed-demo-ducks.mjs, …
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
| `/toukou?place=<id>` | One place's board of activities (always entered from a place marker) |
| `/archive` , `/archive?main=<id>` | Cookpad-style history grid, or one main's full history |
| `/duck` | Duck graph (10 ducks + photos) + 10-slot stamp card |
| `/duck/scan?spot=<qr_token>` | Geofenced stamp scan; routes through the intro to `/duck` |

```
INTRO (once/session)
  title -> catchphrase -> one continuous flight: Earth (far side) -> Delta
     |
     v (first visit only) ONBOARDING: nationality / age / gender
     |
MAIN MAP (Google Maps 3D, Kamogawa-corridor-locked)
  "you are here" marker · tutorial · language toggle · map style switch
  "duck collection" button -> /duck
  markers (one per PLACE, plus colored duck markers):
    !  place -> tap plays a cinematic (frame, fly in, orbit), then a popup with
       the place's name/photos and a button into ->
    duck -> /duck
       |
       v
  /toukou?place=<id>  (that place's board)        /duck
  MANY mains, each its own color, subs lighter;    10 duck nodes + photo subs;
  thumbs up/down; a "+" node adds a sub;           tap a duck's "+" to post a
  "post an activity" adds a main; report (reason)  photo; 10-slot stamp card
  -> /archive?main=<id>                            -> /duck/scan -> stamp -> certificate
```

A duck-QR scan doesn't dead-end on a scan screen: it collects the stamp, then
plays the full intro and lands on `/duck` with a result banner.

## Screens in detail

### Intro (`src/screens/Intro`)

Plays once per session (`hasSeenIntro` in `sessionStorage`, Skip button always
available): the title fades in, cross-fades to the localized catchphrase, then
the camera flies from the far side of the globe (deliberately the hemisphere
*opposite* Japan, so the flight visibly sweeps across the whole Earth) to the
Kamogawa Delta.

That flight is **one** `flyCameraTo()`, awaited on the map's `gmp-animationend`
event. It began as three chained legs (Earth → Japan → Kyoto → Delta), which
read as jerky: `flyCameraTo` eases out to a full stop at the end of every leg,
so the viewer got accelerate/halt/accelerate/halt plus dead air while each
event round-tripped. Google moves the camera *parabolically*, which already
arcs over the globe, so a single long move gives the sweep the three legs were
imitating. `INTRO_FLIGHT_MS` in `lib/map3d.ts` is the only timing knob.

The map is constructed already framed on the far side (`initialCamera()`), so
the first painted frame is correct rather than a jump. The corridor clamp (see
below) only engages once the flight lands — it would otherwise fight the
flight, which legitimately passes through views far outside Kyoto.

### Main map (`src/screens/MainMap`)

A full-screen `Map3DElement`, camera-locked to the **Kamogawa corridor**
(34.960–35.065 N, 135.745–135.800 E) with `minAltitude` 300 m, `maxAltitude`
8 km and a 55° `maxTilt` (`applyKamogawaConstraints()` in `lib/map3d.ts` —
**never remove these**; they're the cost control that keeps tile billing
bounded to the stretch of river the app is actually about). The corridor is
derived from the seeded data — every active place and duck spot, plus ~1.5 km
of margin — and is deliberately *not* the Kyoto-shi administrative boundary,
which sprawls north into the Sakyo-ku mountains and west past Arashiyama and
would be looser than this. A one-time "drag to look around" hint appears for
first-time mobile visitors.

Note that `bounds` constrains where the camera's *centre* may sit, not what
is visible — at altitude with a tilted camera you see well past it. `maxAltitude`
is therefore the lever that controls how much surrounding Kyoto is in frame, and
it's set to 8 km to keep the view on the river.

The **style switch** is a single property, `mode`, with three values:
`SATELLITE` (photorealistic 3D, no labels/names/road text at all — the default),
`HYBRID` (the same imagery with roads and place names), and `ROADMAP` (the flat
cartoonish basemap, where water renders a clear blue and the Kamogawa is
unmistakable). ROADMAP is why the API is pinned to the `alpha` channel — it is
pre-GA and exists nowhere else. There is no label-free ROADMAP; that would need
a Cloud-styled Map ID, which can't be swapped at runtime without rebuilding the
map element and paying for another map load.

There is **one exclamation marker per fixed PLACE** (not per main), so the map
stays uncluttered no matter how many mains a place accrues during a gathering.
Markers are unclustered so each is individually tappable. Tapping a place plays
a short cinematic — a pulsing framing highlight, a close fly-in, and a slow
orbit — then shows a popup with the place's name, a few of its current photos,
and a button into `/toukou?place=<id>`. Duck spots render as per-spot **colored
duck markers** (a shared 10-color palette, placeholder art until the real duck
illustrations land); tapping one goes to `/duck`. A "duck collection" button
also opens `/duck`; creating an activity happens inside a place's board, not on
the map.

### Toukou / place board (`src/screens/ToukouMap`)

Always scoped to one place (`?place=<id>`) — a bare `/toukou` visit bounces
back to the map. The board shows **every (non-archived) main at that place**,
each in its activity-type color, with its subs orbiting in a lighter shade; the
mains repel into separate clusters. Activities persist across days — they're
not scoped to the current gathering event, so a place's web stays populated;
they only leave when hidden by moderation or archived by the sub-cap. Layout is d3-force
with collision radii sized to each card's full bounding circle and a
synchronous pre-warm before first paint, so even a busy board opens already
settled instead of visibly untangling.

A node card shows a photo (or the shared placeholder), the phrase, and thumbs
up/down (one vote per user, switchable); mains with overflowed subs also get a
"see earlier posts" link into the archive. **Adding a sub is a dedicated "+"
node** beside each main (colored like it); a place-level "post an activity"
button creates a new main here. The report button (every card) opens a reason
picker (inappropriate / spam / off-topic / other). The pan / wheel / pinch /
node-drag interaction is a shared `useGraphViewport` hook (also used by the
duck graph): one finger pans or drags a node, and a second finger pinch-zooms
about the midpoint **even when both fingers are on nodes**.

Realtime keeps the board current: any insert/update to `activities` or `votes`
triggers a debounced refetch.

### Archive (`src/screens/Archive`)

A cookpad-style grid of every non-hidden main, newest first; opening one
shows its full sub history — live and archived — in chronological order, the
long-term record of how a spot has been used. Reached from the toukou page's
"see earlier posts" stub or the archive button on the map.

### Duck page (`src/screens/Duck`)

A toukou-style **graph of the 10 ducks** (each duck spot IS a duck, drawn with
its own colored icon) where people post photos onto a duck — its "+" node opens
a photo picker and the photo becomes one of that duck's subs. The **10-slot
stamp card** stays on top (each earned slot shows its duck's color), plus a
persistent test-mode toggle. Stamps are earned only by scanning a QR at one of
the 10 physical duck spots — see [Duck-stamp anti-cheat](#duck-stamp-anti-cheat);
collecting all 10 unlocks a screenshot-worthy certificate.

## Data model

Full schema lives in `supabase/migrations/` (the only source of truth — never
edit an applied migration, add a new file). Summary:

| Table | Purpose |
|---|---|
| `profiles` | One row per anonymous user; nationality/age/gender from onboarding |
| `activity_types` | Seeded palette (writing, reading, walking, music, yoga…) |
| `places` | 16 active fixed riverbank locations tracing the river's shape; each is one map marker. Ships seeded in its migration (clients can't insert) |
| `events` | Daily gathering windows; today's is upserted on read by `ensure_todays_event()` |
| `activities` | Both mains and subs (`kind`); mains carry `place_id` + `event_id`; also `parent_id`, `activity_type`, `photo_url`, `phrase`, `lat/lng`, `likes`/`dislikes`, `archived`, `hidden` |
| `votes` | One row per `(user_id, activity_id)`; switching updates it in place |
| `duck_posts` | Photos posted onto a duck (`duck_spot_id`) — the duck graph's subs |
| `duck_spots` | The 10 physical stamp locations / ducks, each with an opaque `qr_token` |
| `stamps` | One row per `(user_id, duck_spot_id)` a user has earned |
| `certificates` | Issued once a user has 10 distinct stamps |
| `reports` | Moderation flags, with a reason, on an activity or duck post |
| `qr_entries` | Analytics: which photogenic-spot QR drove an app entry |

Enforced server-side (RLS policies, triggers, or the `scan_duck_spot` RPC —
client checks are UX sugar only):

- **Main-only-during-an-event**: a restrictive insert policy rejects a
  `kind='main'` row unless `now()` falls inside an active event's window; a
  `NOT VALID` check also requires every new main to carry a `place_id`.
- **10-sub cap**: after each sub insert, a trigger archives every sub beyond
  the 10 most recent (by `created_at`) for that main.
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

## Event gating — the daily gathering

The gathering is a **daily window computed from the clock, with no cron**.
`getActiveEvent()` calls the `ensure_todays_event()` RPC, which upserts a
deterministic event row for the current Kyoto day and returns it — so there is
always a live window and mains are always creatable. Its purpose is now
**gating creation**, not rotating the board: the restrictive
"main-only-during-an-event" RLS uses it so a bypassed client can't post a main
outside a window, and a new main records the day's `event_id`. The place board
itself is **not** scoped to the event — it shows all of a place's non-archived
mains, so activities persist across days rather than disappearing at day
rollover. Subs are never gated.

## Duck-stamp anti-cheat

A stamp means "I was really at this spot," layered three ways:

1. **Geofence** — the scan must report a location within ~120 m of the spot,
   re-checked server-side (`scan_duck_spot` RPC) against whatever the client
   submits, so a bypassed client still fails.
2. **Opaque `qr_token`** — the QR encodes a random string, not a guessable id.
3. **`UNIQUE(user_id, duck_spot_id)`** — a re-scan is a silent no-op ("already
   collected"), not a duplicate stamp.

For testing the flow without physically visiting, the duck page has a **test
mode** toggle: when on, a scan submits the *scanned spot's own* coordinates
(looked up by `qr_token`), so the geofence passes for **any** QR. This doesn't
weaken the server-side check — it's equivalent to (and no easier to abuse than)
spoofing device GPS, just without needing to.

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
