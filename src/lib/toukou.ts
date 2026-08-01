import { supabase } from './supabase';
import { duckColor } from './ducks';

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

/** The duck that sits at the centre of a place's board. Since the round-3
 * migration a place IS a duck spot, so every board has exactly one. */
export interface BoardDuck {
  id: string; // duck_spot_id
  nameEn: string;
  nameJa: string;
  color: string;
  earned: boolean; // has this user collected the stamp here
  photos: { id: string; photoUrl: string }[]; // duck_posts, drawn as its subs
}

export interface PlaceBoard extends ToukouGraph {
  placeNameEn: string;
  placeNameJa: string;
  placeLat: number;
  placeLng: number;
  duck: BoardDuck | null;
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
        .select('name_en, name_ja, lat, lng, duck_spot_id')
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
    duck: await fetchBoardDuck(userId, place.duck_spot_id),
  };
}

/**
 * The place's duck: its canonical color (lat-desc index, same ordering the
 * stamp card and map markers use), whether this user has its stamp, and its
 * shared photos. Null for a place with no duck link — stale data from before
 * the round-3 migration, which the board renders without a centre.
 */
async function fetchBoardDuck(
  userId: string,
  duckSpotId: string | null,
): Promise<BoardDuck | null> {
  if (!duckSpotId) return null;

  const [{ data: spots, error: spotsError }, { data: photos, error: photosError }, { data: stamp, error: stampError }] =
    await Promise.all([
      supabase.from('duck_spots').select('id, name_en, name_ja').eq('active', true).order('lat', { ascending: false }),
      supabase
        .from('duck_posts')
        .select('id, photo_url')
        .eq('duck_spot_id', duckSpotId)
        .eq('hidden', false)
        .order('created_at', { ascending: true }),
      supabase
        .from('stamps')
        .select('duck_spot_id')
        .eq('user_id', userId)
        .eq('duck_spot_id', duckSpotId)
        .maybeSingle(),
    ]);
  if (spotsError) throw spotsError;
  if (photosError) throw photosError;
  if (stampError) throw stampError;

  const index = spots.findIndex((s) => s.id === duckSpotId);
  if (index === -1) return null;

  return {
    id: duckSpotId,
    nameEn: spots[index].name_en,
    nameJa: spots[index].name_ja,
    color: duckColor(index),
    earned: stamp !== null,
    photos: photos.map((p) => ({ id: p.id, photoUrl: p.photo_url })),
  };
}

/** The seeded activity types (§5.5) -- the palette + labels for the main composer. */
export async function fetchActivityTypes(): Promise<ActivityType[]> {
  const { data, error } = await supabase
    .from('activity_types')
    .select('id, name_en, name_ja, color')
    .order('name_en');
  if (error) throw error;
  return data;
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

// =========================================================================
// Moderation
// =========================================================================

export async function reportContent(
  reporterId: string,
  targetType: 'activity' | 'duck_post',
  targetId: string,
  reason?: string,
): Promise<void> {
  const { error } = await supabase.from('reports').insert({
    reporter_id: reporterId,
    target_type: targetType,
    target_id: targetId,
    reason: reason ?? null,
  });
  // Duplicate report (unique constraint) is a silent no-op, not an error.
  if (error && error.code !== '23505') throw error;
}

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
