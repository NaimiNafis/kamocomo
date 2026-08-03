import { supabase } from './supabase';

// =========================================================================
// Types
// =========================================================================

export interface ToukouNode {
  id: string;
  kind: 'main' | 'sub';
  parentId: string | null;
  color: string; // main = the activity-type hue; sub = a lighter shade of it
  photoUrl: string | null;
  phrase: string | null;
  likes: number;
  dislikes: number;
  myVote: 1 | -1 | null;
  /** Mains only: how many live children. A main has no vote buttons -- this is
   * its rating, on the reasoning that "it drew people in" is what's worth
   * seeing at a glance on a board. */
  subCount: number;
  hasArchivedSubs: boolean; // mains only -- drives the "archived" stub link
}

export interface ToukouEdge {
  source: string; // sub id
  target: string; // parent main id
}

export interface ToukouGraph {
  nodes: ToukouNode[];
  edges: ToukouEdge[];
}

export interface KamoEvent {
  id: string;
  name: string;
  starts_at: string;
  ends_at: string;
}

export interface ActivityType {
  id: string;
  name_en: string;
  name_ja: string;
  color: string;
  /** True for a type this device added, which is the only kind it may remove. */
  mine?: boolean;
}

interface TypeJoin {
  name_en: string;
  name_ja: string;
  color: string;
}

interface ActivityRow {
  id: string;
  kind: 'main' | 'sub';
  parent_id: string | null;
  activity_type: string;
  photo_url: string | null;
  phrase: string | null;
  likes: number;
  dislikes: number;
  lat: number;
  lng: number;
  event_id: string | null;
}

// =========================================================================
// Color: sub nodes are a lighter shade of their main's activity-type hue.
// =========================================================================

function lighten(hex: string, amount: number): string {
  const value = hex.replace('#', '');
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  const toHex = (c: number) => mix(c).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/** The desaturated shade used for sub activities (§5.5) -- shared so the
 * archive colors subs the same way the toukou web does. */
export function subShade(hex: string): string {
  return lighten(hex, 0.45);
}

// =========================================================================
// Graph fetch
// =========================================================================

export interface PlaceBoard extends ToukouGraph {
  placeNameEn: string;
  placeNameJa: string;
  placeLat: number;
  placeLng: number;
}

/**
 * Builds one place's board (§C1/item 7): ALL of that place's non-hidden,
 * non-archived mains -- each colored by its activity type -- plus every main's
 * non-archived subs (a lighter shade), annotated with the user's votes and
 * which mains have overflowed (archived) subs. Returns null if the place is
 * gone (the screen redirects home on that). Activities persist on the board
 * across days (they aren't scoped to the current gathering event); they only
 * leave when hidden by moderation or archived by the sub-cap.
 */
export async function fetchPlaceBoard(
  userId: string,
  placeId: string,
): Promise<PlaceBoard | null> {
  const [{ data: place, error: placeError }, { data: types, error: typesError }, { data: mains, error: mainsError }] =
    await Promise.all([
      supabase
        .from('places')
        .select('name_en, name_ja, lat, lng')
        .eq('id', placeId)
        .maybeSingle(),
      supabase.from('activity_types').select('id, color'),
      supabase
        .from('activities')
        .select('id, kind, parent_id, activity_type, photo_url, phrase, likes, dislikes')
        .eq('place_id', placeId)
        .eq('kind', 'main')
        .eq('hidden', false)
        .eq('archived', false)
        .order('created_at', { ascending: true }),
    ]);
  if (placeError) throw placeError;
  if (typesError) throw typesError;
  if (mainsError) throw mainsError;
  if (!place) return null;

  const colorByType = new Map(types.map((t) => [t.id, t.color]));
  const mainIds = mains.map((m) => m.id);

  let subs: Pick<ActivityRow, 'id' | 'kind' | 'parent_id' | 'activity_type' | 'photo_url' | 'phrase' | 'likes' | 'dislikes'>[] = [];
  let voteByActivity = new Map<string, 1 | -1>();
  let mainsWithArchivedSubs = new Set<string | null>();

  if (mainIds.length > 0) {
    const [{ data: subRows, error: subsError }, { data: votes, error: votesError }, { data: archived, error: archivedError }] =
      await Promise.all([
        supabase
          .from('activities')
          .select('id, kind, parent_id, activity_type, photo_url, phrase, likes, dislikes')
          .in('parent_id', mainIds)
          .eq('kind', 'sub')
          .eq('hidden', false)
          .eq('archived', false)
          .order('created_at', { ascending: true }),
        supabase.from('votes').select('activity_id, value').eq('user_id', userId),
        supabase
          .from('activities')
          .select('parent_id')
          .in('parent_id', mainIds)
          .eq('kind', 'sub')
          .eq('archived', true)
          .eq('hidden', false),
      ]);
    if (subsError) throw subsError;
    if (votesError) throw votesError;
    if (archivedError) throw archivedError;
    subs = subRows;
    voteByActivity = new Map(votes.map((v) => [v.activity_id, v.value as 1 | -1]));
    mainsWithArchivedSubs = new Set(archived.map((a) => a.parent_id));
  }

  // A main's rating is how many children it drew, so tally them per parent.
  const subCountByMain = new Map<string, number>();
  for (const sub of subs) {
    if (sub.parent_id) subCountByMain.set(sub.parent_id, (subCountByMain.get(sub.parent_id) ?? 0) + 1);
  }

  // Subs inherit their parent's activity_type, so a sub's own activity_type is
  // already the parent's hue -- its color is just the lighter shade of that.
  const nodes: ToukouNode[] = [...mains, ...subs].map((row) => {
    const baseColor = colorByType.get(row.activity_type) ?? '#6e8ca0';
    return {
      id: row.id,
      kind: row.kind,
      parentId: row.parent_id,
      color: row.kind === 'main' ? baseColor : subShade(baseColor),
      photoUrl: row.photo_url,
      phrase: row.phrase,
      likes: row.likes,
      dislikes: row.dislikes,
      myVote: voteByActivity.get(row.id) ?? null,
      subCount: row.kind === 'main' ? (subCountByMain.get(row.id) ?? 0) : 0,
      hasArchivedSubs: row.kind === 'main' && mainsWithArchivedSubs.has(row.id),
    };
  });

  const mainIdSet = new Set(mainIds);
  const edges: ToukouEdge[] = subs
    .filter((s) => s.parent_id && mainIdSet.has(s.parent_id))
    .map((s) => ({ source: s.id, target: s.parent_id as string }));

  return {
    nodes,
    edges,
    placeNameEn: place.name_en,
    placeNameJa: place.name_ja,
    placeLat: place.lat,
    placeLng: place.lng,
  };
}

/** The activity types (§5.5) -- the palette + labels for the main composer.
 * `mine` marks the ones this user added, so the composer knows which carry a
 * remove control. */
export async function fetchActivityTypes(userId?: string): Promise<ActivityType[]> {
  const { data, error } = await supabase
    .from('activity_types')
    .select('id, name_en, name_ja, color, created_by')
    .eq('retired', false)
    .order('name_en');
  if (error) throw error;
  return data.map((t) => ({
    id: t.id,
    name_en: t.name_en,
    name_ja: t.name_ja,
    color: t.color,
    mine: !!userId && t.created_by === userId,
  }));
}

/**
 * Removes an activity type this device added, and reports what happened: a type
 * nothing has been posted with is deleted outright, one that has posts is
 * retired (kept, so those posts keep their name and colour, but no longer
 * offered). Both are "gone" from the picker. See the 20260804120000 migration
 * for why an in-use type is kept rather than deleted.
 */
export type RemoveTypeStatus =
  | 'deleted'
  | 'retired'
  | 'not_yours'
  | 'not_found'
  | 'unauthenticated'
  | 'failed';

export async function deleteActivityType(id: string): Promise<RemoveTypeStatus> {
  const { data, error } = await supabase.rpc('delete_activity_type', { p_id: id });
  if (error) throw error;
  return (data as { status: RemoveTypeStatus }).status;
}

/**
 * Creates an activity type the seeded list doesn't cover, or returns the
 * existing one when the name already matches. Goes through an RPC rather than a
 * direct insert so the colour is assigned server-side from the §4.1 palette --
 * a client able to insert freely could put an arbitrary hex on the board.
 *
 * A type named at post time only exists in the language it was typed in; the
 * RPC stores the same string in both name columns.
 */
export async function createActivityType(name: string): Promise<ActivityType | null> {
  const { data, error } = await supabase.rpc('create_activity_type', { p_name: name });
  if (error) throw error;
  const r = data as { status: string; id?: string; name_en?: string; name_ja?: string; color?: string };
  if (r.status !== 'ok' || !r.id) return null;
  return {
    id: r.id,
    name_en: r.name_en ?? name,
    name_ja: r.name_ja ?? name,
    color: r.color ?? '#6e8ca0',
    mine: true,
  };
}

/** Everything a post's detail sheet shows. */
export interface ActivityDetail {
  id: string;
  kind: 'main' | 'sub';
  color: string;
  photoUrl: string | null;
  phrase: string | null;
  likes: number;
  dislikes: number;
  createdAt: string;
  /** What the post is labelled with -- its activity type. Named neutrally
   * because the duck board's photos feed the same detail sheet, labelled with
   * their duck instead. */
  labelEn: string;
  labelJa: string;
  /** Who posted it: the name they gave, plus the coarse onboarding bands.
   * Every field is null where that question was skipped. */
  author: {
    name: string | null;
    nationality: string | null;
    ageRange: string | null;
    gender: string | null;
  } | null;
}

/**
 * One post in full, for the long-press sheet: the whole photo, what was said,
 * when, and the little the app knows about who.
 *
 * "Who" is whatever the poster offered: the name they chose, and the coarse
 * onboarding bands. `profiles` is publicly readable, which is what makes this
 * possible.
 */
export async function fetchActivityDetail(activityId: string): Promise<ActivityDetail | null> {
  const { data, error } = await supabase
    .from('activities')
    .select(
      'id, kind, activity_type, photo_url, phrase, likes, dislikes, created_at, author_id, activity_types(name_en, name_ja, color)',
    )
    .eq('id', activityId)
    .eq('hidden', false)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, nationality, age_range, gender')
    .eq('id', data.author_id)
    .maybeSingle();

  // Supabase types an embedded to-one join as a possible array.
  const joined = (data as { activity_types?: TypeJoin | TypeJoin[] | null }).activity_types;
  const type = Array.isArray(joined) ? joined[0] : joined;
  const base = type?.color ?? '#6e8ca0';

  return {
    id: data.id,
    kind: data.kind,
    color: data.kind === 'main' ? base : subShade(base),
    photoUrl: data.photo_url,
    phrase: data.phrase,
    likes: data.likes,
    dislikes: data.dislikes,
    createdAt: data.created_at,
    labelEn: type?.name_en ?? '',
    labelJa: type?.name_ja ?? '',
    author: profile
      ? {
          name: profile.display_name,
          nationality: profile.nationality,
          ageRange: profile.age_range,
          gender: profile.gender,
        }
      : null,
  };
}

// =========================================================================
// Photo upload (Supabase Storage)
// =========================================================================

const EXT_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

/** Uploads a photo to the public `photos` bucket under the user's own folder
 * (matching the storage RLS policy) and returns its public URL. */
export async function uploadPhoto(userId: string, file: File): Promise<string> {
  const ext = EXT_BY_TYPE[file.type] ?? 'jpg';
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from('photos').upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (error) throw error;
  return supabase.storage.from('photos').getPublicUrl(path).data.publicUrl;
}

// =========================================================================
// Create main / sub
// =========================================================================

export interface CreateMainInput {
  authorId: string;
  activityTypeId: string;
  eventId: string;
  placeId: string;
  phrase: string;
  photoFile: File | null;
  lat: number;
  lng: number;
}

export async function createMain(input: CreateMainInput): Promise<string> {
  const photoUrl = input.photoFile ? await uploadPhoto(input.authorId, input.photoFile) : null;
  const { data, error } = await supabase
    .from('activities')
    .insert({
      kind: 'main',
      activity_type: input.activityTypeId,
      event_id: input.eventId,
      place_id: input.placeId,
      author_id: input.authorId,
      phrase: input.phrase,
      photo_url: photoUrl,
      lat: input.lat,
      lng: input.lng,
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

export interface CreateSubInput {
  authorId: string;
  parentId: string;
  phrase: string;
  photoFile: File | null;
}

/** A sub inherits its parent main's activity type, place, and location -- it's
 * a variation of the same activity at the same spot (§5.5). */
export async function createSub(input: CreateSubInput): Promise<string> {
  const { data: parent, error: parentError } = await supabase
    .from('activities')
    .select('activity_type, place_id, lat, lng')
    .eq('id', input.parentId)
    .single();
  if (parentError) throw parentError;

  const photoUrl = input.photoFile ? await uploadPhoto(input.authorId, input.photoFile) : null;
  const { data, error } = await supabase
    .from('activities')
    .insert({
      kind: 'sub',
      parent_id: input.parentId,
      activity_type: parent.activity_type,
      place_id: parent.place_id,
      author_id: input.authorId,
      phrase: input.phrase,
      photo_url: photoUrl,
      lat: parent.lat,
      lng: parent.lng,
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

// =========================================================================
// Voting (one row per user per activity; switching updates the same row)
// =========================================================================

export async function setVote(userId: string, activityId: string, value: 1 | -1): Promise<void> {
  const { error } = await supabase
    .from('votes')
    .upsert({ user_id: userId, activity_id: activityId, value }, { onConflict: 'user_id,activity_id' });
  if (error) throw error;
}

export async function clearVote(userId: string, activityId: string): Promise<void> {
  const { error } = await supabase
    .from('votes')
    .delete()
    .eq('user_id', userId)
    .eq('activity_id', activityId);
  if (error) throw error;
}

// Moderation has no in-app report button any more. Two things replace it: a
// post that reaches 10 dislikes hides itself (the vote-count trigger, see
// 20260801200000), and the team can still flip `hidden` by hand in Studio.
// Every feed query filters `hidden`, so both routes take effect everywhere.

// =========================================================================
// Event gating: the gathering is a daily-rotating window computed from the
// clock (no cron). ensure_todays_event() upserts today's Kyoto-day event and
// returns it, so there is always a live window (mains are always creatable)
// and every main posted today shares one event_id (the place board filters on
// it; older days fall to the archive).
// =========================================================================

export async function getActiveEvent(): Promise<KamoEvent> {
  const { data, error } = await supabase.rpc('ensure_todays_event');
  if (error) throw error;
  return data as KamoEvent;
}

// =========================================================================
// Realtime
// =========================================================================

/**
 * Fires `onChange` whenever any activity or vote changes, so the screen can
 * refetch the graph (§5.5: new nodes/votes appear live). Whole-graph refetch
 * is simplest and fine at demo scale.
 */
export function subscribeToToukou(onChange: () => void): () => void {
  const channel = supabase
    .channel('toukou-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'activities' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'votes' }, onChange)
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
