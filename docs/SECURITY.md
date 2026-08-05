# Security notes

What was checked, what was fixed, and what is knowingly left open. Audited
2026-08-06 against the live project by signing in with the **anon key** — the
same privileges any visitor's browser has — and attempting each attack.

The threat model is small on purpose: anonymous-only identity, no personal data
beyond what onboarding asks for, no payments, and content that is public by
design. What matters is that the rules the app calls server-authoritative
actually are: vote counts, the 10-dislike hide, the 10-sub archive cap, the
duck geofence, and event-gating of mains.

## Fixed

### Authors could rewrite their own posts' moderation state (critical)

`users can update their own activities` scoped updates by author but said
nothing about which **columns**, and every server-authoritative rule lives in a
column on that row. As an ordinary anonymous visitor, all of this worked:

| Attack | Effect |
|---|---|
| `set likes = 9999` | Any post to a full circle with the thickest ring |
| `set dislikes = 0` | Erase disapproval |
| `set hidden = false` | **Un-hide a post the 10-dislike trigger had hidden** |
| `set archived = false` | Climb back out of the archive, past the 10-sub cap |
| `set parent_id / place_id` | Re-parent onto another main, or move to another place |

The third is the one that mattered: moderation here *is* voting (CLAUDE.md §5),
one-way by design, and a one-way rule the author can reverse isn't a rule.

Fixed in `20260806120000` by dropping the policy rather than narrowing it — the
client never updates an activity, so nothing legitimate used it — plus a
column-level grant (`phrase`, `photo_url` only) so a carelessly-written future
policy can't reopen the same door.

### qr_entries accepted anything

`with check (true)` on an insert-only analytics table: it would take a megabyte
of junk as readily as a spot name. Now bounded to 1–64 characters. Worth
tightening to an `exists()` against `duck_spots` once the `<slug>` scheme in the
`/?from=qr&spot=` route is settled — today nothing generates those codes, and
`logQrEntry` swallows its errors, so a mismatch would fail silently.

## Verified as already correct

Each of these was attempted and refused:

- Editing, hiding, or inflating **another user's** post
- Granting yourself a duck stamp directly (`stamps` has no insert policy —
  `collect_duck_by_photo` is `SECURITY DEFINER` and recomputes the distance
  server-side, so the geofence can't be argued with from a client)
- Inserting a duck photo outside that RPC
- Voting **as** somebody else, or deleting anyone else's vote
- Issuing yourself a certificate
- Reading anyone else's stamps
- Uploading into another user's Storage folder
- Inserting an activity type directly (RPC-only, closed colour palette)
- Creating an event, or posting a main outside an active one (a **restrictive**
  policy, so it AND's onto every permissive one)
- Changing a post's `author_id`, or promoting a sub to a main

No secrets in the bundle or in git history. The only keys shipped to the client
are `VITE_SUPABASE_ANON_KEY` (public by design, RLS is the boundary) and
`VITE_GOOGLE_MAPS_API_KEY`. No `dangerouslySetInnerHTML`, `innerHTML`, `eval`,
or `new Function` anywhere in `src/`.

## Knowingly open

- **`profiles` is world-readable** — 401 rows of display name, nationality, age
  band and gender, dumpable in one request. The post detail sheet needs an
  author's name and bands, and RLS has no way to say "only for people whose
  posts you can see". Closing it means an RPC or a view that returns profiles
  only for authors of visible posts. Bands are coarse and there are no real
  users yet, so it's accepted for the prototype — reconsider before launch.
- **The `photos` bucket is public.** Every uploaded photo is readable by anyone
  with the URL, including photos on posts that were later hidden. Deliberate:
  the boards are public and signed URLs would break caching.
- **Anonymous accounts are free to create**, so vote brigading is bounded only
  by Supabase's anonymous sign-in rate limit (~30/hour/IP). One vote per user
  per post is enforced; the cost of a fake voter is a sign-in.
- **The Google Maps key is in the bundle** — unavoidable for a browser map.
  It must carry an HTTP-referrer restriction in the Google Cloud console, or
  anyone can spend the quota. Every domain the app answers on needs its own
  entry — currently `kamocomo.vercel.app` and `kamokamo.vercel.app`, the older
  one kept alive because printed QR codes encode the host. A domain that is
  live but unlisted doesn't degrade: the map fails to load entirely. *Not
  verifiable from the repo — check it in the console.*
- **`react-router-dom` 7.18.1** carries GHSA-qwww-vcr4-c8h2 (RSC-mode CSRF
  bypass). Not applicable: this is a client-only SPA with no RSC and no server
  actions. The advisory's fix is a downgrade to 7.11.0, a breaking change, so
  it's being left until a fixed forward version exists.
- **`reports` stays unused**, with its insert policy, per CLAUDE.md §5.

## Re-running the audit

There is no committed script — the probes create and delete real rows, and a
convenient attack script in the repo is a liability. The method: sign in with
`signInAnonymously()` using the anon key, attempt each row above, and assert
that everything except the app's own paths is refused. Clean up with the secret
key afterwards.
