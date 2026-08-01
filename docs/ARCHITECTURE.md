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
| 3D map | Google Maps Platform 3D Maps (`Map3DElement`, `weekly` channel) |
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
scripts/        generate-qr.ts, seed-demo-places.mjs, seed-full-nodes.mjs, …
img/
  marks/        custom duck SVG mark, generated into 10 variants (no stock art)
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
| `/duck` | The 図鑑 — collection grid of the 10 ducks |
| `/duck/scan?spot=<qr_token>` | Geofenced stamp scan; routes through the intro to `/duck` |

```
INTRO (once/session)
  title -> catchphrase -> one continuous flight: Earth (far side) -> Delta
     |
     v (first visit only) ONBOARDING: nationality / age / gender
     |
MAIN MAP (Google Maps 3D, Kamogawa-corridor-locked)
  location dot (heading cone) · tutorial · language toggle · map style switch
  duck spots are the same 10 as the 図鑑 -- find the object, photograph it
  "duck collection" button -> /duck (図鑑)
  markers -- ONE duck per place, drawn as that duck's variant:
    duck -> tap plays a cinematic (frame, fly in, 45 deg sweep), then a popup with
       the place's name/photos and a button into ->
       |
       v
  /toukou?place=<id>  (that place's board)        /duck  (the 図鑑)
  MANY mains, each its own color, subs lighter;    10 numbered entries;
  subs vote, mains rated by child count;           unfound = silhouette,
  a "+" node adds a sub; "post an activity"        found = your photo + 保存日;
  adds a main; 10 dislikes auto-hides a post       photograph one to collect it
  -> /archive?main=<id>                            -> certificate at 10
```

A duck-QR scan doesn't dead-end on a scan screen: it collects the stamp, then
plays the full intro and lands on `/duck` with a result banner.

## Screens in detail

### Intro (`src/screens/Intro`)

Plays once per session (`hasSeenIntro` in `sessionStorage`): the title fades in, cross-fades to the localized catchphrase, then
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
the first painted frame is correct rather than a jump.

There is **no Skip**: the flight is the app's opening statement and runs once
per session. Because that removes the only manual escape, MainMap arms a
watchdog — if the flight hasn't reported completion by title + catchphrase +
12 s, the intro lands anyway. A backgrounded tab can swallow
`gmp-animationend`, and without that guard a visitor would be stranded on the
overlay with no way out. The corridor clamp (see
below) only engages once the flight lands — it would otherwise fight the
flight, which legitimately passes through views far outside Kyoto.

### Tutorial (`src/screens/Tutorial`)

Five slides in a **cover flow**: the active card faces you, its neighbours are
turned away in 3D and stacked behind, and moving through them rotates the rack.
It replaced a static grey "photo / video" box, which told a first-time visitor
nothing and read as an image that had failed to load. Swipe, arrow keys, the
chevrons, the dots or tapping a card all move it; Escape closes.

Built from CSS transforms on a `preserve-3d` stage rather than an animation
library — the whole effect is one `transform` per card, and this screen opens
automatically on a first visit, often outdoors on bad signal.

> `SLIDE_IMAGES` currently points every slide at the shared placeholder, because
> `img/kamogawa/` holds exactly one photo. Drop five real shots in, import them,
> list them there. Nothing else changes, and no image is fetched remotely.

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

The visitor's own position is a Google-Maps-style **location dot** — a
white-ringed disc with a translucent wedge showing which way the device faces —
that follows them via `watchPosition` and swings as they turn. It replaced a
static "You Are Here!" label. `Marker3DElement` has no rotation property and
rasterizes its art on append, so turning the cone means rebuilding the marker;
that's throttled to 6° of heading and 2 m of movement so sensor jitter doesn't
thrash it. iOS 13+ gates the compass behind a permission prompt that only works
from a user gesture, so the first pointerdown on the map is where it's asked;
without permission the dot simply loses its cone. The dot falls back to the
Kamogawa Delta when geolocation is denied, so there is always one.

It's drawn in `--kamo-river`, not Google's `#4285F4` — the design rules allow
only the kamo tokens and bar saturated "tech" colors.

Note that `bounds` constrains where the camera's *centre* may sit, not what
is visible — at altitude with a tilted camera you see well past it. `maxAltitude`
is therefore the lever that controls how much surrounding Kyoto is in frame, and
it's set to 8 km to keep the view on the river.

The **map view** has one control: whether Google draws its labels over the
photorealistic imagery. `SATELLITE` is label-free (the default) and `HYBRID`
adds road and place names.

It was briefly two axes, crossed with a flat cartoonish basemap labelled "2D".
That basemap is `MapMode.ROADMAP`, which is **pre-GA and exists only on the
`v=alpha` channel** — a channel Google documents as development-only and may
change without notice. Carrying that on a deployed public site wasn't worth one
extra view, so the API is pinned to `weekly` and ROADMAP is gone. The
label-free half of that pair also needed a Cloud-styled `mapId`
(`VITE_GOOGLE_MAPS_LABEL_FREE_MAP_ID`); with ROADMAP gone, SATELLITE is
natively label-free and no Map ID is involved.

Since the round-3 migration (`20260801120000`) **a place IS a duck spot**, so
there is exactly **one marker set**: 10 duck markers, one per spot, each in its
duck's color with the "!" worked into the mark. Before that the map carried 16
exclamation markers *plus* 10 duck markers — 26 icons over a narrow strip of
river, which read as clutter and made taps ambiguous. The previous place sets were removed
outright in `20260801170000`. Markers are unclustered so each is individually
tappable, and there is only ever one marker under a tap — the duck-spot layer
that used to sit on top of them at identical coordinates is gone, which is what
made taps land on the duck page or the board at random. Tapping a place plays
a short cinematic — a pulsing framing highlight, a close fly-in, and a 45°
camera sweep — then shows a popup with the place's name, a few of its current photos,
and a button into `/toukou?place=<id>`. Duck spots render as per-spot **colored
duck markers** (a shared 10-color palette, placeholder art until the real duck
illustrations land); tapping one goes to `/duck`. A "duck collection" button
also opens `/duck`; creating an activity happens inside a place's board, not on
the map.

### Toukou / place board (`src/screens/ToukouMap`)

Always scoped to one place (`?place=<id>`) — a bare `/toukou` visit bounces
back to the map. Since round-3 this is the **combined board**: the place's duck
(its color, its name, whether you've earned its stamp) sits with that spot's
shared duck photos hanging off it, and each main activity sits with its own
subs. The duck and the activities are deliberately *separate* clusters — wiring
every main to the duck made one hairball that implied the duck was their parent.
It shows **every (non-archived) main at that place**,
each in its activity-type color, with its subs orbiting in a lighter shade; the
mains repel into separate clusters. Activities persist across days — they're
not scoped to the current gathering event, so a place's web stays populated;
they only leave when hidden by moderation or archived by the sub-cap. Layout is d3-force
with collision radii sized to each card's full bounding circle and a
synchronous pre-warm before first paint, so even a busy board opens already
settled instead of visibly untangling.

A node card shows a photo (or the shared placeholder), its phrase, and a **ring
that thickens as it earns standing** — nothing at zero, so the rings that exist
read as signal. The two kinds are rated differently on purpose: a **sub** votes
(one per user, switchable) and its ring follows the net score, while a **main
has no vote buttons** and its ring follows how many children it drew. On a sub
the ring turns `--kamo-sunset` once the score goes negative, so a post drifting
toward auto-hide warns before it goes.

The vote control is a pill that lifts on hover, squashes on press, and fills its
thumb in `--kamo-moss` / `--kamo-sunset`. Icon and count only, no label: two
have to fit inside a 96px sub card. Done with Tailwind transitions rather than
an animation library — ~50KB of runtime for two transforms is a poor trade on a
screen built for flaky outdoor signal.

Mains with overflowed subs also get a "see earlier posts" link into the archive.
**Adding a sub is a dedicated "+" node** beside each main (colored like it),
carrying nothing but a "+" — at card size a caption was two lines of small type
explaining a symbol that already says it, so the label survives only as the
accessible name. A place-level "post an activity" button creates a new main, and
its type picker carries ten seeded types plus a "+" that creates one through
`create_activity_type` (colour assigned server-side from the §4.1 palette). **A
photo is required** on every post: text-only cards fall back to the shared
placeholder, which makes them all look like the same post.

**There is no report button** — see Moderation below.

The pan / wheel / pinch / node-drag interaction is a shared `useGraphViewport`
hook (also used by the duck graph): one finger pans or drags a node, and a
second finger pinch-zooms about the midpoint **even when both fingers are on
nodes**. Panning is clamped to roughly half a viewport past the outermost card
and a **recenter control** restores the auto-fit transform — between them you
can't pan into empty space and lose the graph, which an unbounded canvas
otherwise makes easy.

The board **opens zoomed out**, holds the whole graph in frame for a beat, then
eases in and settles on the **place's duck**, so you see how much is here before
arriving at the anchor of it.

That glide is interpolated in JS, not handed to a CSS transition. The force
simulation re-renders the canvas on every tick and rewrites its inline
`transform` along with it, which restarts or swallows a transition — earlier
attempts snapped for exactly that reason. Owning the value makes the animation
independent of how often the graph re-renders underneath. Nothing else is eased:
drags and pinches track the finger, since easing there is felt as lag rather
than smoothness. A pointer-down cancels the glide outright. Every node is draggable, the duck and its photos included; that
depends on `data-node-id` being present on the wrapper, which is what the
viewport hook hit-tests for.

Realtime keeps the board current: any insert/update to `activities` or `votes`
triggers a debounced refetch.

### Archive (`src/screens/Archive`)

A cookpad-style grid of every non-hidden main, newest first; opening one
shows its full sub history — live and archived — in chronological order, the
long-term record of how a spot has been used. Reached from the toukou page's
"see earlier posts" stub or the archive button on the map.

### Duck collection — 図鑑 (`src/screens/Duck`)

A **field guide**, not a stamp card. The duck objects along the river each carry
their own detail, so working out which is which is the point:

- an entry you **haven't found** shows only a **silhouette** — enough to know
  what shape to look for, not what the object actually is;
- an entry you **have found** shows **your own photo** of it, with its 保存日 and
  a 採取済み mark.

What's collected is a record of what you saw, which a row of identical icons
could never be. Entries are numbered No.01–No.10 by the canonical
lat-descending ordering, so duck N is the same duck here, on the map and on a
place's board. Search, three filters (all / found / not found) and a date sort
sit above a two-column grid; the test-mode toggle and the 10-entry certificate
stay.

Collecting is **photographing the object where it stands** rather than scanning
a QR — see [anti-cheat](#duck-stamp-anti-cheat). This replaced a 10-slot stamp
card and a separate duck photo graph. The communal "everyone's photos orbiting a
duck" view lives on each place's toukou board, so dropping the graph lost
nothing — and because the board's photo "+" posts through the same RPC,
photographing a duck from there also collects it when you're in range.

The ten ducks are generated variants of one body (crest, ribbon, hat, speckles,
scarf, spotted bill, sitting, raised wing, ducklings, plain) in `lib/ducks.ts`.
Colour form and silhouette come from the same geometry, which is what makes a
silhouette an honest clue rather than an unrelated shape. Placeholder quality;
real artwork swaps in at `duckVariantDataUri` / `duckSilhouetteDataUri`.

## Data model

Full schema lives in `supabase/migrations/` (the only source of truth — never
edit an applied migration, add a new file). Summary:

| Table | Purpose |
|---|---|
| `profiles` | One row per anonymous user; nationality/age/gender from onboarding |
| `activity_types` | Ten seeded types (writing, reading, walking, music, yoga, talking, eating, sketching, exercise, resting). Visitors can add more via the `create_activity_type` RPC, which assigns the colour server-side; `created_by` marks those. A user-made type exists only in the language it was typed in |
| `places` | Riverbank locations, one per duck spot. Each links 1:1 to a `duck_spot` via `duck_spot_id` (`20260801120000`), and a place without one is rejected by a CHECK (`20260801170000`) — so the 10 places *are* the 10 ducks. The earlier 8- and 16-place sets, and the activities posted at them, were deleted in `20260801170000` |
| `events` | Daily gathering windows; today's is upserted on read by `ensure_todays_event()` |
| `activities` | Both mains and subs (`kind`); mains carry `place_id` + `event_id`; also `parent_id`, `activity_type`, `photo_url`, `phrase`, `lat/lng`, `likes`/`dislikes`, `archived`, `hidden` |
| `votes` | One row per `(user_id, activity_id)`; switching updates it in place |
| `duck_posts` | Photos posted onto a duck (`duck_spot_id`). Communal on a place's board; your own most recent one also fills your 図鑑 entry. Written only via `collect_duck_by_photo` |
| `duck_spots` | The 10 physical stamp locations / ducks, each with an opaque `qr_token` |
| `stamps` | One row per `(user_id, duck_spot_id)` collected. `earned_at` is the 保存日 shown on a collection entry |
| `certificates` | Issued once a user has 10 distinct stamps |
| `reports` | Legacy. In-app reporting was replaced by dislike-driven auto-hide; the table stays so it can return without a schema change |
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
- **Moderation**: every feed/map query filters `hidden = true`. Two things set
  it. The vote-count trigger hides any post reaching **10 dislikes** — this
  replaced in-app reporting, which is why the thumbs are load-bearing. It is
  deliberately one-way: dropping back under the threshold does not un-hide,
  since coming back should be a human decision, not something a vote toggles.
  The team can still flip `hidden` by hand in Studio.

  The trade is explicit: with no report queue there is no human between ten
  annoyed users and someone else's post. `hidden` rather than `DELETE` is what
  keeps that recoverable — and there is no DELETE policy on `activities` at
  all, so removal could never have come from the client.

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

1. **Geofence** — the reported location must be within ~120 m of the spot,
   re-checked server-side against whatever the client submits, so a bypassed
   client still fails. Two RPCs enforce it: `collect_duck_by_photo` (the
   intended route — photograph the object) and `scan_duck_spot` (the older QR
   route, still working).

   `collect_duck_by_photo` **always posts the photo** to that duck's shared feed
   and grants the stamp **only** within range, so sharing a duck photo from
   anywhere keeps working while only presence fills your own collection. It
   **fails closed** with no location fix: no coordinates, no stamp. The client
   used to substitute the Kamogawa Delta's coordinates when geolocation failed,
   which was harmless while a photo proved nothing and would have handed every
   entry to anyone with location switched off the moment it did.

   A photo is weaker evidence than a QR — it can be a photo of a photo — but the
   presence requirement is unchanged.
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
