# Virtual Kamogawa — Design & Architecture Document

*Version 0.1 · Design/architecture reference for a CS + Design student project*
*Purpose: a shared source of truth the team (and Claude Code) can build from.*

---

## 0. TL;DR — the decisions we made

- **Frontend:** React + Vite + TypeScript, with **CesiumJS** for the 3D globe/map (same engine family as the Nagasaki Archive reference).
- **Backend:** **Supabase** (Postgres + Auth + Storage + Realtime). No custom server needed.
- **Repos:** **One repo, not two.** Supabase *is* your backend, so you don't need a separate backend repo. A single frontend repo that talks to Supabase is simpler to build, deploy, and grade. (See §2 for the full reasoning.)
- **Identity:** No accounts. Each phone gets an **anonymous device identity** (Supabase anonymous auth + a locally cached device ID). User's nationality/age/gender and their stamp progress live on-device and in Supabase, keyed to that anonymous ID.
- **Design:** Human-designed, Kamogawa-inspired palette and Japanese-first typography. Reference images collected in `img/`. No generic AI-looking visuals.

---

## 1. Concept — what we are actually building

Virtual Kamogawa is a web app that turns the **暗黙知 (tacit knowledge)** of the Kamogawa riverbank into something you can *discover* rather than something you're *told*.

The core insight from the pitch: rules and signs kill what makes Kamogawa feel free. Instead, the app makes people's behavior **visible** so newcomers can *observe → read the air → join the culture on their own terms.* The app is the "discovery layer" over the real place.

Three experiential pillars, mapped to concrete features:

| Pitch idea | In the app |
|---|---|
| 行動の可視化 (visualize behavior) | The 3D map shows what people are doing right now via markers |
| 観察 → 空気を読む (observe, read the air) | The **toukou/vote map** — a web of connected activity posts |
| 暗黙知の発見 (discover tacit knowledge) | You browse, you don't get lectured; the **archive** preserves the culture over time |
| さりげなく伝わる (subtly transmitted) | Hidden-QR entry from a photogenic spot → drops you into Virtual Kamogawa |
| 参加する (participate) | Post your own activity, vote, add a "sub-activity," collect **duck stamps** |

Everything below serves that concept.

---

## 2. Tech stack & repo structure

### Recommended stack

| Layer | Choice | Why |
|---|---|---|
| Framework | **React 18 + Vite + TypeScript** | Fast dev server, component model fits your many screens/popups, TS catches bugs before your demo. |
| 3D map | **CesiumJS** (via `cesium` npm + `vite-plugin-cesium`) | The Nagasaki Archive uses Cesium; it gives you a real globe → Japan → Kyoto → Kamogawa fly-through and 3D terrain/tiles out of the box. |
| Routing | **React Router** | First page (intro animation) → main map → toukou map → archive → duck page are all routes. |
| State | **Zustand** (small, simple) or React Context | Holds current user profile, language, cached device ID. Avoid Redux — overkill here. |
| Styling | **CSS Modules** or **Tailwind** | Either is fine; pick one and stay consistent. Design tokens in §4. |
| i18n | **i18next** (`react-i18next`) | English + Japanese toggle. Keep all copy in JSON files from day one. |
| Backend | **Supabase** | Postgres DB, anonymous auth, file storage (photos), realtime updates for posts/votes. |
| Local cache | **localStorage** + **IndexedDB** (via `idb` or `localforage`) | Device ID + profile in localStorage; cached images/drafts in IndexedDB. See §6. |
| Hosting | **Vercel** or **Netlify** (frontend) + Supabase cloud | Both free tiers; deploy on push. |

### One repo or two?

**Use one repo.** Here's the reasoning:

Supabase already provides your database, authentication, file storage, and realtime API. You interact with it from the frontend through the `@supabase/supabase-js` client library. That means **there is no backend application code to host** — no Express server, no separate API. A second repo would only contain configuration.

So the clean structure is a **single frontend repo**, with your Supabase project's schema tracked *inside* it as migration files (`/supabase/migrations/`). This keeps your database schema versioned alongside the code that uses it, which is exactly what a grader or teammate wants to see.

You'd only split into two repos if you later add **server-side logic** that can't live in the browser (e.g. a scheduled job that flips "main activities" on during an event, or webhook processing). Even then, Supabase **Edge Functions** live inside the same repo under `/supabase/functions/`, so you *still* don't need a second repo. Recommendation: stay single-repo unless/until you hit a hard need.

### Suggested folder structure

```
virtual-kamogawa/
├─ img/                        # reference photos & example assets (per the brief)
│  ├─ references/              # Nagasaki Archive screenshots, mood board
│  ├─ kamogawa/                # real Kamogawa photos ("鴨川といえばこれ")
│  └─ marks/                   # our custom duck mark, exclamation mark sources
├─ public/                     # favicon, static Cesium assets, PWA icons
├─ src/
│  ├─ app/                     # routes, top-level layout, providers
│  ├─ screens/
│  │  ├─ Intro/                # first page animation (title → catchphrase → globe fly-in)
│  │  ├─ MainMap/              # 3D Cesium map + top/bottom buttons
│  │  ├─ Onboarding/           # nationality / age / gender modal
│  │  ├─ Tutorial/             # 5-slide popup overlay
│  │  ├─ ToukouMap/            # activity web graph
│  │  ├─ Archive/              # past activities, cookpad-style
│  │  └─ Duck/                 # duck sharing + stamp card + certificate
│  ├─ components/              # buttons, markers, modal shell, language toggle
│  ├─ lib/
│  │  ├─ supabase.ts           # client init
│  │  ├─ identity.ts           # anonymous device ID + profile cache
│  │  └─ cesium.ts             # camera fly-to helpers, marker layer
│  ├─ i18n/                    # en.json, ja.json
│  ├─ store/                   # zustand stores
│  └─ styles/                  # design tokens, globals
├─ supabase/
│  ├─ migrations/              # SQL schema (versioned)
│  └─ functions/               # (optional) edge functions, e.g. event scheduler
├─ .env.local                  # VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
└─ README.md
```

---

## 3. App flow (screen map)

```
┌────────────────────────────────────────────────────────────┐
│  INTRO  (auto-plays once)                                    │
│  "Virtual Kamogawa" (big)                                    │
│     → catchphrase: 皆んなの鴨川、守り続けよう                  │
│     → Earth globe → zoom to Japan → Kyoto → Kamogawa         │
└───────────────┬────────────────────────────────────────────┘
                ▼  (first visit only) ONBOARDING modal: 国籍 / 年齢 / 性別
┌────────────────────────────────────────────────────────────┐
│  MAIN MAP  (3D Cesium)                                       │
│   • pan / zoom / tilt, "you are here" marker                 │
│   • top button → Tutorial overlay   • language toggle (EN/JA)│
│   • bottom-right → map style switch                          │
│   • markers on map:                                          │
│        ❗ exclamation  → Toukou Map                          │
│        🦆 duck mark    → Duck Page                           │
└───────┬───────────────────────────┬────────────────────────┘
        ▼                           ▼
┌──────────────────┐        ┌──────────────────────────────┐
│  TOUKOU / VOTE   │        │  DUCK PAGE                    │
│  activity web    │        │  duck photo feed (social)     │
│  main + sub      │        │  stamps via spot-QR scan      │
│  like / dislike  │        │  10-stamp card → certificate  │
│  + add sub       │        └──────────────────────────────┘
│  overflow → ARCHIVE (cookpad-style history)                 │
└─────────────────────────────────────────────────────────────┘
```

---

## 4. Visual design direction

> The brief says **no AI-looking design**, save references in `img/`. So this section defines a *human* design language rooted in Kamogawa itself. Treat these as starting tokens for a designer to refine, not final law.

### 4.1 Color — "river, stone, dusk"

Kamogawa's real palette is muted and natural: river blue-grey, riverbank green, warm stone, and the indigo of dusk when people gather. Avoid saturated "tech" colors.

| Token | Hex (starting point) | Use |
|---|---|---|
| `--kamo-indigo` | `#2E3A59` | Primary text, intro background, main activity accents |
| `--kamo-river` | `#6E8CA0` | Water, secondary UI, map overlays |
| `--kamo-moss` | `#7C8C5A` | Riverbank green, sub-activity accents |
| `--kamo-stone` | `#E9E4D8` | Backgrounds (生成り / off-white, calm) |
| `--kamo-sand` | `#D8C7A8` | Cards, surfaces |
| `--kamo-sunset` | `#E0885E` | Warm accent — likes, active states, the duck theme |
| `--kamo-ink` | `#1C1C1A` | High-contrast text |

Design principle: **low saturation, high warmth, lots of breathing room.** The UI should feel like sitting by the river, not like a dashboard.

### 4.2 Typography — Japanese-first

Because the app is bilingual and Japanese is primary, pick fonts that render *both* scripts beautifully.

- **Primary (UI + body):** `Noto Sans JP` — clean, neutral, excellent kanji/kana, pairs with Latin.
- **Display (the big "Virtual Kamogawa" title, catchphrases):** a font with more character. Options to try in `img/` mockups: `Shippori Mincho` (明朝, literary, calm — fits 暗黙知 theme) or `Zen Kaku Gothic New` (modern, friendly). Recommend **Shippori Mincho for display, Noto Sans JP for UI**.
- **Latin fallback:** `Inter` or the Noto Latin set for consistent weight.

Load via Google Fonts or self-host in `public/fonts/`. Set `lang` on `<html>` and use `font-feature-settings` so JP text isn't cramped.

### 4.3 Motion

The intro fly-through (globe → Kyoto → Kamogawa) is your signature moment. Use Cesium's `camera.flyTo` with eased timing (3–5s total). Keep the rest of the UI gentle: fades and short springs, nothing bouncy. Motion should feel like *drifting downstream*.

### 4.4 The custom marks

- **❗ Exclamation mark** → routes to the toukou map. Design it hand-drawn, ink-brush style rather than a system emoji.
- **🦆 Duck mark** → the brief says "we'll make our own." Design a simple, recognizable Kamogawa duck (the river's famous ducks) as an SVG. Store master art in `img/marks/`. This becomes your mascot and appears on the stamp card + certificate.

---

## 5. Screen-by-screen architecture

### 5.1 Intro screen
- Single full-screen canvas. Sequence, timed:
  1. `Virtual Kamogawa` fades in (display font, large).
  2. Cross-fades to catchphrase (`皆んなの鴨川、守り続けよう`), localized per language.
  3. Reveals Cesium globe already initialized behind it; camera `flyTo` Earth → Japan → Kyoto → the Kamogawa coordinates.
- Runs **once per session**; a "Skip" affordance for repeat visitors. Store `hasSeenIntro` in sessionStorage.
- **Coordinates to fly to (verify on-site):** Kamogawa Delta area ≈ **35.030 N, 135.772 E**; popular Sanjō–Shijō stretch ≈ **35.008 N, 135.772 E**. Pick the hero viewpoint your team likes and hardcode it in `lib/cesium.ts`.

### 5.2 Onboarding modal (first visit only)
- Three quick questions: **nationality, age (range), gender.** Use ranges/selects, not free text, to keep it one tap each.
- Written to local cache immediately (so it never asks again on this device) and to the `profiles` table under the anonymous ID.
- Keep it *fast and skippable-ish* — this data powers analytics/visualization, not gatekeeping. Design it to feel like a friendly greeting, not a form.

### 5.3 Main map (Cesium)
- Full-screen Cesium viewer, custom minimal UI (hide the default Cesium widgets/credits chrome you don't want).
- **"You are here"** marker via the browser Geolocation API (with graceful fallback to the Kamogawa default if denied).
- Overlay controls:
  - **Top:** Tutorial (❓/info) button + **language toggle (EN / JA)**.
  - **Bottom-right:** map-style switch (e.g. photoreal 3D tiles ↔ stylized/flat ↔ night). Only build styles you actually have.
- **Markers** loaded from Supabase: exclamation markers (activity clusters) and duck markers (duck spots). Tapping a marker routes to the relevant page. Consider clustering when zoomed out.

### 5.4 Tutorial overlay
- Renders **on top of** the main map; map dims (semi-opaque scrim) and is non-interactive while open.
- ~5 slides, each: media placeholder (image/video) on top, text below.
- **Dot pagination** at the bottom showing current slide. Swipe / arrows to move. Close button returns to map.
- Content is i18n JSON so slides translate.

### 5.5 Toukou / vote map  *(the hard one)*
This is a **graph of activity posts**, visualized as a connected web — "roundish posts linked to each other," instagram/cookpad energy.

**Structure:**
- A **main activity** is the center node, with a distinct strong color (per activity type).
- **Sub activities** surround it, in a softer/lighter shade of the same color.
- **Main activities can only be created during a specific event** (a time-gated flag — see data model + §7). Between events, users can only add sub-activities to existing mains.
- Activity types seed the colors: writing, reading, walking, playing an instrument, yoga, etc. Each type = one hue; main = saturated, sub = desaturated.

**A node (post) contains:**
- Uploaded photo
- Like / dislike buttons (counts)
- A short user phrase (e.g. `i write here bc it's cool`)
- Main only: a **`+` button** to add a sub-activity

**Rules to implement:**
- Adding a sub = a new node linked to the main. Sub nodes have the same content **minus** the `+` button.
- **Sub cap = 20.** When a 21st sub is added, the **oldest sub is moved to the Archive** (still linked to the same main). This keeps the visible web uncluttered while nothing is lost.
- Rendering: a **force-directed graph** (e.g. `d3-force` or `react-force-graph`) with the main pinned center and subs orbiting. Edges are the "web strings."

### 5.6 Archive
- Cookpad-style browsable history: past main activities and their overflowed/retired subs.
- Reachable from a retired sub (tap through) and from a general archive entry point.
- Grid/list of cards; tap a main to see its full history of subs over time. This is where the **暗黙知 accumulates** — the long-term record of how people used the river.

### 5.7 Duck page
- Cookpad-style feed where people **share duck photos** — a social/observation feature (not tied to stamps).
- **Stamps come from scanning QR codes at physical duck spots** around Kamogawa. Each spot has its own QR; scanning it (route `/duck/scan?spot=<qr_token>`, Appendix A.2b) awards that spot's stamp to the current device — after a **required ~120 m geofence check**. One stamp per spot — it's a real-world scavenger hunt.
- **Stamp card = 10 stamps** (10 different spots). Progress persists per device/anonymous user.
- Completing all 10 → a **Certificate of Challenge Completion** page tied to that device/account. Designed to be screenshot-worthy (shareable → spreads awareness, which is the stated goal).

---

## 6. Identity & caching (no accounts)

Goal from the brief: **no account creation**, but user input (profile, stamps, their posts) should persist on their phone.

**Approach — anonymous identity + local cache:**

1. On first load, call **Supabase anonymous sign-in** (`supabase.auth.signInAnonymously()`). This returns a real user ID and session **without** email/password.
2. Persist the session locally (Supabase does this in localStorage by default) **plus** store a `device_id` yourself as a backup key.
3. The onboarding profile (nationality/age/gender) and stamp progress are written **both** to local cache (instant, offline-friendly) **and** to Supabase (so markers/posts show across all users).
4. On return visits, the cached session restores silently — the user never sees a login.

**What lives where:**

| Data | Local (localStorage / IndexedDB) | Supabase |
|---|---|---|
| Device/anon session | ✅ (source of truth for "who am I on this phone") | ✅ (auth) |
| Profile (nat/age/gender) | ✅ (skip onboarding next time) | ✅ (for aggregate visualization) |
| Language preference | ✅ | — |
| Stamp progress | ✅ (instant UI) | ✅ (authoritative, anti-cheat) |
| Draft posts / photos | ✅ IndexedDB (survive reload before upload) | ✅ on submit |
| Everyone's posts, votes, markers | cache for speed | ✅ shared source of truth |

**Caveat to tell your team:** clearing browser data or switching phones loses the identity — that's the trade-off for "no accounts." Acceptable for this project; note it in the README. If you ever want cross-device continuity, add an optional "link email" later without changing the model.

---

## 7. Supabase data model (starting schema)

> Draft tables. Refine as you build; track as SQL migrations in `/supabase/migrations/`.

```
profiles
  id            uuid  (= auth.uid(), anonymous user)   PK
  nationality   text
  age_range     text
  gender        text
  created_at    timestamptz

activity_types                 -- seed data: writing, reading, walking, ...
  id            uuid PK
  name_en       text
  name_ja       text
  color         text           -- base hue; main=saturated, sub=lighter

events                         -- windows when main activities can be created
  id            uuid PK
  name          text
  starts_at     timestamptz
  ends_at       timestamptz
  active        bool default false   -- flipped by scheduled job (see §8.5)

activities                     -- both main and sub live here
  id            uuid PK
  kind          text           -- 'main' | 'sub'
  parent_id     uuid  null     -- null for main; main's id for sub
  activity_type uuid  → activity_types
  event_id      uuid  null     -- required for 'main', set to creating event
  author_id     uuid  → profiles
  photo_url     text           -- Supabase Storage
  phrase        text           -- short user caption
  lat           double         -- map placement (for the ❗ markers)
  lng           double
  likes         int  default 0
  dislikes      int  default 0
  archived      bool default false   -- true once bumped past the 20-sub cap
  hidden        bool default false   -- moderation: pulled by the team
  created_at    timestamptz

votes                          -- one vote per user per activity
  user_id       uuid  → profiles
  activity_id   uuid  → activities
  value         int            -- +1 like / -1 dislike
  PRIMARY KEY (user_id, activity_id)

duck_posts                     -- social feed; NOT tied to stamps
  id            uuid PK
  author_id     uuid  → profiles
  photo_url     text
  lat, lng      double
  hidden        bool default false   -- moderation: pulled by the team
  created_at    timestamptz

reports                        -- moderation: user-flagged content
  id            uuid PK
  reporter_id   uuid  → profiles
  target_type   text           -- 'activity' | 'duck_post'
  target_id     uuid
  reason        text null
  created_at    timestamptz
  UNIQUE (reporter_id, target_type, target_id)

duck_spots                     -- physical QR locations for the stamp hunt
  id            uuid PK
  name_en       text
  name_ja       text
  lat, lng      double
  qr_token      text unique    -- value encoded in the physical QR / scan URL
  active        bool default true

stamps                         -- one row per spot a user has scanned
  id            uuid PK
  user_id       uuid  → profiles
  duck_spot_id  uuid  → duck_spots
  earned_at     timestamptz
  UNIQUE (user_id, duck_spot_id)   -- can't earn the same spot twice
  -- 10 distinct rows for a user = certificate unlocked

certificates
  user_id       uuid  → profiles  PK
  issued_at     timestamptz
```

**Key logic to enforce (via SQL constraints, RLS policies, or Edge Functions):**
- **Main only during an event:** reject `kind='main'` inserts unless `now()` falls inside an active `events` row. Easiest as a DB trigger or an Edge Function.
- **Sub cap = 20:** on new sub insert, if the parent already has 20 non-archived subs, set the oldest sub's `archived=true`. Do this in a trigger or Edge Function so it's atomic.
- **One vote per user per activity:** enforced by the `votes` primary key; a switch from like→dislike updates the row.
- **Stamp = scan a duck-spot QR:** the `/duck/scan?spot=<qr_token>` route validates the spot's `qr_token` **and the ~120 m geofence (client + server-side, see A.2b)**, then inserts a `stamps` row for the current user (the `UNIQUE (user_id, duck_spot_id)` constraint silently ignores re-scans). After insert, if the user has 10 distinct stamps, insert into `certificates`.
- **Moderation:** the report button inserts into `reports`; feeds and maps filter out `hidden = true` rows. The team reviews reports in Supabase Studio and flips `hidden` by hand.
- **Event-gated mains (to automate):** a scheduled job (`pg_cron` / Edge Function) toggles `events.active` at `starts_at` / `ends_at`; `kind='main'` inserts are rejected unless an event is currently active (see §8.5 — still to design).
- **RLS (Row Level Security):** on. Anyone can read; a user can only write rows where `author_id = auth.uid()`. This is what makes anonymous-but-safe work.

**Realtime:** subscribe to `activities` and `votes` so the toukou web and vote counts update live for everyone — this is the "行動の可視化" payoff.

---

## 8. Decisions (all resolved)

All seven are now resolved (5 and 6 are sketched in detail in Appendix A).

1. **Map style source — API key OK, scope it to Kyoto to control cost.** We'll use Cesium photoreal 3D tiles (needs a Cesium ion / Google key). To keep usage (and billing) down, **constrain the camera to a Kyoto bounding box** and cap min/max zoom so users can't pan away and trigger tile loads elsewhere — tiles only ever load for the Kamogawa/Kyoto area. Implement in `lib/cesium.ts` via `camera.constrainedAxis` + a bounding rectangle and `minimumZoomDistance` / `maximumZoomDistance`. (Note: photoreal tiles bill by usage, not by geographic area, so the real lever is *limiting how much map the user can load* — the bounding box does exactly that.)
2. **Seed data — yes, seed from `img/`.** Pre-populate a handful of main activities and duck spots at launch using the photos already in `img/kamogawa/` so the map feels alive during the demo. Add these as a seed SQL script in `/supabase/migrations/` (or a `seed.sql`).
3. **Moderation — yes, build it.** Anonymous photo uploads get a **report button** at minimum, plus a simple hidden/flagged flag on posts so the team can pull bad content. Consider a basic automated image check later; the report flow is the must-have for a public demo.
4. **Earning a stamp — scan the QR at a duck spot.** A stamp is **not** earned by posting a photo. Instead, physical **duck spots around Kamogawa each carry a QR code**; scanning one deep-links into the app and awards that spot's stamp. Collect **10 different spots** → certificate. (Sharing duck photos stays as a social feature, but it's decoupled from stamps.) This makes stamps a real-world scavenger hunt and naturally prevents spam — one stamp per spot per device. See updated duck page (§5.7) and `duck_spots` / `stamps` tables (§7).
5. **Event scheduling automation — resolved, designed in Appendix A.1.** Two-tier design: the authoritative gate is a compute-on-read time-window check enforced by RLS (no cron needed); a `pg_cron` / scheduled Edge Function job is added only for boundary side-effects. Events are managed in the **Supabase Studio table editor** (no `/admin` page — see the comparison in A.1). For the demo: seed 2–3 concrete event rows.
6. **Hidden-QR entry — resolved, designed in Appendix A.2.** Two reserved routes:
   - **App entry**: `/?from=qr&spot=<spot_slug>` — photogenic-spot QR drops the visitor into Virtual Kamogawa (read-only, safe).
   - **Duck-stamp scan** (decision #4): `/duck/scan?spot=<qr_token>` — verifies the spot's opaque token, **requires a ~120 m geofence check** (client + server-side), then awards the stamp. Full flow + anti-cheat layers in A.2b.
7. **Offline / poor signal by the river — yes.** Cache aggressively (IndexedDB) and make every network failure graceful — people use this outdoors on flaky signal.

---

## 9. Suggested build order (for when you move to implementation)

A sensible sequence, each a shippable chunk:

1. **Scaffold** — Vite + React + TS + Cesium hello-world globe. Confirm it deploys.
2. **Intro animation** — title → catchphrase → fly-through. Your signature moment; nail it early for motivation.
3. **Supabase setup** — project, anonymous auth, `profiles`, RLS. Wire onboarding modal + local cache.
4. **Main map shell** — "you are here," top/bottom buttons, language toggle, tutorial overlay (static content OK first).
5. **Markers** — exclamation + duck marks from Supabase; tap to route.
6. **Toukou map** — force graph, main/sub nodes, like/dislike, `+` sub, the 20-cap → archive rule.
7. **Archive** — cookpad-style history views.
8. **Duck page** — photo feed, `/duck/scan` QR route + geofence, 10-stamp card, certificate.
9. **Polish** — i18n completeness, empty states, seed data, moderation (report → hidden), offline caching, QR entry route (`/?from=qr`).

---

## Appendix A — Event automation (§8.5) & QR endpoints (§8.6), sketched

### A.1 Event automation — how "main activities only during events" actually works

**Guiding principle: keep the "am I in an event?" check dumb and server-truthful, add a scheduled job only for side-effects.** Two tiers — start with Tier 1, add Tier 2 when you want things to *happen* at start/end.

#### Tier 1 — Compute-on-read (build this first, no cron)

The app never trusts a stored `active` flag; it asks the database "is there an event window around `now()`?" This removes a whole class of "the flag got stuck" bugs.

Helper the app calls on the toukou map:

```
getActiveEvent()  → the event whose [starts_at, ends_at] contains now(), or null
getNextEvent()    → soonest upcoming event (for the countdown), or null
```

Server-side guard so a hacked client can't create a main out of window — a Postgres RLS policy on insert:

```sql
create policy "mains only during an active event"
on activities for insert to authenticated
with check (
  kind <> 'main'                         -- subs are always allowed
  or exists (
    select 1 from events e
    where e.id = activities.event_id
      and now() between e.starts_at and e.ends_at
  )
);
```

A new main attaches to the currently active event: `event_id = getActiveEvent().id`. Subs are **not** gated — people can add subs to existing mains any time (that's how the culture keeps accreting between events).

#### Tier 2 — Scheduled job (add when you need side-effects)

Only needed if something should *fire* at the boundary: broadcast "an event just started" over Realtime, snapshot the previous event's board, send a nudge, etc. Two equivalent options:

- **`pg_cron`** (runs inside Postgres) — simplest, one SQL job:

```sql
select cron.schedule('event-tick', '* * * * *', $$
  update events set active = true
    where not active and now() between starts_at and ends_at;
  update events set active = false
    where active and now() >= ends_at;
  -- (put NOTIFY / realtime broadcast / archive-snapshot side-effects here)
$$);
```

- **Scheduled Edge Function** — same logic in TS if you prefer JS and want to call other APIs.

With Tier 2 the stored `active` flag exists for *side-effects and convenience*, but the **authoritative gate stays the time-window check** from Tier 1, so the two can never disagree in a way that lets a bad main through.

#### Recurring events

Don't encode recurrence in the gate logic — **generate concrete rows** instead. A nightly `generate-events` job reads a recurrence rule and inserts the next N occurrences (skipping any that already exist), so the gate keeps only ever seeing plain `starts_at`/`ends_at` rows.

```
events
  ...
  recurrence  text null   -- optional RRULE, e.g. "FREQ=WEEKLY;BYDAY=SU;BYHOUR=7"
```

For the **demo**, skip the generator entirely — just seed 2–3 concrete event rows.

#### Who defines events (admin) — Supabase dashboard is easier, use it

**Recommendation: manage events in the Supabase Studio table editor, skip `/admin`.** Reasoning:

| | Supabase dashboard | Custom `/admin` page |
|---|---|---|
| Build effort | **Zero** — it already exists | Auth gating + forms + deploy + maintenance |
| Who can use it | Anyone with the project login | Anyone you build access for |
| Good when | Events are rare, editors are on the dev team | A **non-technical teammate** manages events, or you want to demo/show it off |

Events change maybe a handful of times, and you (the team) already have the Supabase login — so the dashboard's table editor covers it with **no code**. Both paths write to the same `events` table; the app doesn't care which created the row, so you can always add `/admin` later without changing anything else.

**Build `/admin` only if** a designer/non-dev teammate needs to create events without touching the Supabase dashboard, or you want it as a portfolio piece. If so, keep it tiny: password-gated route, list events, add/edit form → same table.

#### Between-event UI (toukou map)

- The map is still fully browsable — observing is the whole point.
- The **`+ create main`** affordance is hidden/disabled.
- Show a **"Next gathering" countdown chip** from `getNextEvent()` (e.g. "次の集い: 日 7:00 まで あと 2日"), localized.
- Subs on existing mains stay creatable.

**State per event:** `scheduled → active → ended`, derived from the clock (Tier 1) and/or written by the job (Tier 2).

---

### A.2 QR endpoints — two entry points

Both are just routes we reserve now; the physical QR codes point at these stable URLs whenever the real-world rollout happens.

#### A.2a App-entry QR — `/?from=qr`

The pitch's kura-sushi/expo idea: a QR hidden inside a photogenic Kamogawa scene. You photograph the scene, the QR is in-frame, the phone auto-reads it and opens the app.

```
https://virtualkamogawa.app/?from=qr&spot=<spot_slug>
```

On load:
1. Parse `from` and `spot`.
2. `from=qr` → optionally tailor the intro (start the fly-through already near that spot, or a small "you found the hidden entrance" beat).
3. Use `spot` to drop the "you are here" marker precisely — skips geolocation-permission friction.
4. Log an analytics row (which physical spot drives entries).
5. Continue into normal onboarding → main map.

Read-only, no write/auth action → safe. Desktop/no-camera users just get a normal link.

#### A.2b Duck-stamp scan QR — `/duck/scan?spot=<qr_token>`

One QR at each of the 10 physical duck spots. Scanning awards that spot's stamp.

```
https://virtualkamogawa.app/duck/scan?spot=<qr_token>
```

On load:
1. **Ensure an anonymous session** — create one silently if this is the person's first touch (a duck QR can be someone's very first entry to the app).
2. Look up `duck_spots` by `qr_token`. Not found / inactive → friendly error screen.
3. **Geofence check (required).** Request device geolocation and confirm it's within a radius of the spot's `lat/lng` (start at **~120 m** — city GPS drifts, so don't set it too tight). If the person is too far away, or denies/​can't provide location, **block the stamp** and explain ("Get closer to the duck spot to collect this stamp — location needed"). This is what makes a stamp mean *"I was really here,"* and it neutralises the biggest exploit: a photo of the QR shared online grants nothing to someone who isn't at the river.
4. Insert a `stamps` row `(user_id, duck_spot_id)`. The `UNIQUE(user_id, duck_spot_id)` constraint makes a re-scan a silent no-op → show "already collected."
5. Play the stamp-earned animation → show the stamp card with the new stamp filled → if the user now has 10 distinct stamps, unlock the **certificate**.
6. Route on into the duck page / main map.

**Anti-cheat, layered (all three, since we're gating physical presence):**
- **Geofence (required, step 3)** — the primary guard: you must be within ~120 m of the spot. Enforce it **server-side** too — send the device's lat/lng with the scan and re-check the distance in the DB/Edge Function, so a faked client request still fails.
- **Opaque `qr_token`** — the QR encodes a random string, not a guessable `duck_spot_id`, so nobody can forge scan URLs by typing.
- **`UNIQUE(user_id, duck_spot_id)`** — blocks farming the same spot twice.
- *(Optional, later)* rotate a signed token so screenshots of the QR expire — probably overkill once the geofence is in.

Because geolocation is now mandatory, keep the failure path gentle: explain *why* location is needed, offer a retry, and remember that indoor/tunnel GPS can be flaky near tall buildings — the generous radius absorbs most of that.

```
State: scan → (valid token?) → (within ~120m?) → (already have it?) → insert stamp → (10th?) → certificate
                    │no              │no                  │yes                            │no
                    ▼                ▼                     ▼                               ▼
              error screen   "get closer" msg      "already collected"              stamp card
```

#### Generating the physical QRs

Encode the **full URL including token** in each QR image (any QR generator works), then print/place them. Duck-spot QRs each carry that spot's unique `qr_token`; app-entry QRs carry the `spot_slug`. Keep a mapping (it's just the `duck_spots` table) so you can deactivate or re-issue a code without reprinting logic.

---

*Implementation instructions live in the companion files: `CLAUDE.md` (project rules for Claude Code) and `BUILD_PLAN.md` (phased prompts).*
