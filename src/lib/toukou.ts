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

// =========================================================================
// Graph fetch
// =========================================================================

/** Builds the toukou graph (§5.5): non-hidden, non-archived mains + subs,
 * colored by activity type, annotated with the current user's votes and
 * whether each main has archived (overflowed) subs. */
export async function fetchToukouGraph(userId: string): Promise<ToukouGraph> {
  const [{ data: types, error: typesError }, { data: activities, error: activitiesError }] =
    await Promise.all([
      supabase.from('activity_types').select('id, color'),
      supabase
        .from('activities')
        .select('id, kind, parent_id, activity_type, photo_url, phrase, likes, dislikes, lat, lng, event_id')
        .eq('hidden', false)
        .eq('archived', false)
        .order('created_at', { ascending: true }),
    ]);
  if (typesError) throw typesError;
  if (activitiesError) throw activitiesError;

  const colorByType = new Map(types.map((t) => [t.id, t.color]));

  const { data: votes, error: votesError } = await supabase
    .from('votes')
    .select('activity_id, value')
    .eq('user_id', userId);
  if (votesError) throw votesError;
  const voteByActivity = new Map(votes.map((v) => [v.activity_id, v.value as 1 | -1]));

  // Which mains have at least one archived sub -> show the archived stub.
  const { data: archivedSubs, error: archivedError } = await supabase
    .from('activities')
    .select('parent_id')
    .eq('kind', 'sub')
    .eq('archived', true)
    .eq('hidden', false);
  if (archivedError) throw archivedError;
  const mainsWithArchivedSubs = new Set(archivedSubs.map((s) => s.parent_id));

  const rows = activities as ActivityRow[];
  const nodes: ToukouNode[] = rows.map((row) => {
    const baseColor = colorByType.get(row.activity_type) ?? '#6e8ca0';
    return {
      id: row.id,
      kind: row.kind,
      parentId: row.parent_id,
      color: row.kind === 'main' ? baseColor : lighten(baseColor, 0.45),
      photoUrl: row.photo_url,
      phrase: row.phrase,
      likes: row.likes,
      dislikes: row.dislikes,
      myVote: voteByActivity.get(row.id) ?? null,
      hasArchivedSubs: row.kind === 'main' && mainsWithArchivedSubs.has(row.id),
    };
  });

  const nodeIds = new Set(nodes.map((n) => n.id));
  const edges: ToukouEdge[] = rows
    .filter((row) => row.kind === 'sub' && row.parent_id && nodeIds.has(row.parent_id))
    .map((row) => ({ source: row.id, target: row.parent_id as string }));

  return { nodes, edges };
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

/** A sub inherits its parent main's activity type and location -- it's a
 * variation of the same activity at the same spot (§5.5). */
export async function createSub(input: CreateSubInput): Promise<string> {
  const { data: parent, error: parentError } = await supabase
    .from('activities')
    .select('activity_type, lat, lng')
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
// Event gating (Appendix A.1, Tier 1 compute-on-read)
// =========================================================================

export async function getActiveEvent(): Promise<KamoEvent | null> {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from('events')
    .select('id, name, starts_at, ends_at')
    .lte('starts_at', nowIso)
    .gte('ends_at', nowIso)
    .order('ends_at', { ascending: false })
    .limit(1);
  if (error) throw error;
  return data[0] ?? null;
}

export async function getNextEvent(): Promise<KamoEvent | null> {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from('events')
    .select('id, name, starts_at, ends_at')
    .gt('starts_at', nowIso)
    .order('starts_at', { ascending: true })
    .limit(1);
  if (error) throw error;
  return data[0] ?? null;
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
