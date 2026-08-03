import { supabase } from './supabase';
import { uploadPhoto, subShade, type ToukouEdge } from './toukou';
import { getPosition, type GeoPoint } from './geo';
import { duckColor } from './ducks';

// =========================================================================
// Duck graph (§6/item 6): the 10 ducks as main nodes, shared photos as subs.
// The duck page is a toukou-style graph -- each duck spot IS a duck (its color
// is shared with its map marker + stamp slot), and people post photos onto a
// duck, which show up as its subs.
// =========================================================================

export interface DuckNode {
  id: string;
  kind: 'main' | 'sub';
  parentId: string | null;
  color: string;
  nameEn: string; // main only (subs get '')
  nameJa: string;
  /** Main only: its 1-based catalogue number, the same one the collection
   * sheet shows -- so both surfaces pick the same silhouette for a duck. */
  number: number;
  earned: boolean; // main only -- whether this user has this duck's stamp
  /** Sub: the shared photo. Main: your own photo of this duck, kept so the
   * duck's sheet can show your stamp. Null either way when there isn't one. */
  photoUrl: string | null;
  /** Sub only: this photo is yours. The board rings it so you can pick your
   * own out of the orbit at a glance. */
  mine: boolean;
  // Subs only -- a duck isn't anyone's post, so mains carry no vote.
  likes: number;
  dislikes: number;
  myVote: 1 | -1 | null;
}

export interface DuckGraph {
  nodes: DuckNode[];
  edges: ToukouEdge[];
}

/**
 * Builds the duck board: every active duck spot as a coloured main node
 * (ordered lat-desc so colours match the map and the collection sheet), plus
 * every non-hidden duck photo as a sub of its duck.
 *
 * A main carries this user's own state -- whether they've earned the stamp and
 * which of their photos of it exists -- so the duck's sheet can show it. Subs
 * carry vote counts, this user's own vote, and whether the photo is theirs.
 */
export async function fetchDuckGraph(userId: string): Promise<DuckGraph> {
  const [
    { data: spots, error: se },
    { data: posts, error: pe },
    { data: stamps, error: ste },
    { data: myVotes, error: ve },
  ] = await Promise.all([
    supabase.from('duck_spots').select('id, name_en, name_ja').eq('active', true).order('lat', { ascending: false }),
    supabase
      .from('duck_posts')
      .select('id, photo_url, duck_spot_id, author_id, likes, dislikes, created_at')
      .eq('hidden', false)
      .not('duck_spot_id', 'is', null)
      .order('created_at', { ascending: true }),
    supabase.from('stamps').select('duck_spot_id').eq('user_id', userId),
    supabase.from('duck_post_votes').select('duck_post_id, value').eq('user_id', userId),
  ]);
  if (se) throw se;
  if (pe) throw pe;
  if (ste) throw ste;
  if (ve) throw ve;

  const earned = new Set(stamps.map((s) => s.duck_spot_id));
  const voted = new Map(myVotes.map((v) => [v.duck_post_id, v.value as 1 | -1]));
  // Your own most recent photo of each duck -- posts arrive oldest-first, so
  // later writes overwrite earlier ones and the newest wins.
  const myPhoto = new Map<string, string>();
  for (const p of posts) if (p.author_id === userId) myPhoto.set(p.duck_spot_id, p.photo_url);
  const colorBySpot = new Map(spots.map((s, i) => [s.id, duckColor(i)]));

  const mainNodes: DuckNode[] = spots.map((s, i) => ({
    id: s.id,
    kind: 'main',
    parentId: null,
    color: duckColor(i),
    nameEn: s.name_en,
    nameJa: s.name_ja,
    number: i + 1,
    earned: earned.has(s.id),
    photoUrl: myPhoto.get(s.id) ?? null,
    mine: false,
    likes: 0,
    dislikes: 0,
    myVote: null,
  }));

  const spotIds = new Set(spots.map((s) => s.id));
  const subNodes: DuckNode[] = posts
    .filter((p) => spotIds.has(p.duck_spot_id))
    .map((p) => ({
      id: p.id,
      kind: 'sub',
      parentId: p.duck_spot_id,
      color: subShade(colorBySpot.get(p.duck_spot_id) ?? '#e0885e'),
      nameEn: '',
      nameJa: '',
      number: 0,
      earned: false,
      photoUrl: p.photo_url,
      mine: p.author_id === userId,
      likes: p.likes,
      dislikes: p.dislikes,
      myVote: voted.get(p.id) ?? null,
    }));

  const edges: ToukouEdge[] = subNodes.map((s) => ({ source: s.id, target: s.parentId as string }));
  return { nodes: [...mainNodes, ...subNodes], edges };
}

export type CollectResult =
  | { status: 'unauthenticated' | 'not_found' }
  | {
      status: 'posted';
      /** Whether this also filled the collection entry. False when the photo
       * posted but you weren't close enough, or had no location at all. */
      collected: boolean;
      already: boolean;
      distance: number | null;
      spotNameEn: string;
      spotNameJa: string;
      stampCount: number;
      certificateEarned: boolean;
    };

/**
 * Posts a photo onto a duck and, if it was taken within ~120 m of that duck,
 * collects the entry.
 *
 * The photo always posts -- it's a contribution to that duck's shared feed
 * either way. Only presence fills your own collection.
 *
 * Location is best-effort but **fails closed**: when there's no fix we send
 * null rather than substituting the spot's own coordinates. Doing the latter
 * (which this used to, back when a photo proved nothing) would hand every entry
 * to anyone with location switched off, now that the photo IS the proof.
 */
export async function collectDuckByPhoto(
  userId: string,
  photoFile: File,
  duckSpotId: string,
  /** Test mode submits the spot's own coordinates so the flow is demonstrable
   * away from the river -- no easier to abuse than spoofing GPS. */
  overrideCoords?: GeoPoint,
): Promise<CollectResult> {
  const photoUrl = await uploadPhoto(userId, photoFile);

  let point: GeoPoint | null = overrideCoords ?? null;
  if (!point) {
    try {
      point = await getPosition();
    } catch {
      point = null; // no fix -> the photo posts, nothing is collected
    }
  }

  const { data, error } = await supabase.rpc('collect_duck_by_photo', {
    p_duck_spot_id: duckSpotId,
    p_photo_url: photoUrl,
    p_lat: point?.lat ?? null,
    p_lng: point?.lng ?? null,
  });
  if (error) throw error;

  const r = data as {
    status: string;
    collected?: boolean;
    already?: boolean;
    distance?: number;
    spot_name_en?: string;
    spot_name_ja?: string;
    stamp_count?: number;
    certificate_earned?: boolean;
  };
  if (r.status !== 'posted') return { status: r.status === 'not_found' ? 'not_found' : 'unauthenticated' };
  return {
    status: 'posted',
    collected: r.collected ?? false,
    already: r.already ?? false,
    distance: r.distance ?? null,
    spotNameEn: r.spot_name_en ?? '',
    spotNameJa: r.spot_name_ja ?? '',
    stampCount: r.stamp_count ?? 0,
    certificateEarned: r.certificate_earned ?? false,
  };
}

/** Realtime: new duck photos appear in the graph without a reload. */
// =========================================================================
// Voting on duck photos (one row per user per photo, as with activities)
// =========================================================================

export async function setDuckVote(
  userId: string,
  duckPostId: string,
  value: 1 | -1,
): Promise<void> {
  const { error } = await supabase
    .from('duck_post_votes')
    .upsert(
      { user_id: userId, duck_post_id: duckPostId, value },
      { onConflict: 'user_id,duck_post_id' },
    );
  if (error) throw error;
}

export async function clearDuckVote(userId: string, duckPostId: string): Promise<void> {
  const { error } = await supabase
    .from('duck_post_votes')
    .delete()
    .eq('user_id', userId)
    .eq('duck_post_id', duckPostId);
  if (error) throw error;
}

/** Everything a duck photo's detail sheet shows -- deliberately the same shape
 * the toukou sheet takes, so one component serves both boards. */
export interface DuckPostDetail {
  id: string;
  kind: 'sub';
  color: string;
  photoUrl: string | null;
  /** The duck it was taken at, where a toukou post would name its activity. */
  labelEn: string;
  labelJa: string;
  phrase: null; // duck photos carry no caption
  likes: number;
  dislikes: number;
  createdAt: string;
  author: {
    name: string | null;
    nationality: string | null;
    ageRange: string | null;
    gender: string | null;
  } | null;
}

/** One duck photo in full: the shot, when it was taken, and who by. Mirrors
 * `fetchActivityDetail` -- `profiles` is publicly readable, which is what lets
 * a photo name its author. */
export async function fetchDuckPostDetail(
  postId: string,
  color: string,
): Promise<DuckPostDetail | null> {
  const { data, error } = await supabase
    .from('duck_posts')
    .select('id, photo_url, likes, dislikes, created_at, author_id, duck_spots(name_en, name_ja)')
    .eq('id', postId)
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
  type SpotJoin = { name_en: string; name_ja: string };
  const joined = (data as { duck_spots?: SpotJoin | SpotJoin[] | null }).duck_spots;
  const spot = Array.isArray(joined) ? joined[0] : joined;

  return {
    id: data.id,
    kind: 'sub',
    color,
    photoUrl: data.photo_url,
    labelEn: spot?.name_en ?? '',
    labelJa: spot?.name_ja ?? '',
    phrase: null,
    likes: data.likes,
    dislikes: data.dislikes,
    createdAt: data.created_at,
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

export function subscribeToDuckPosts(onChange: () => void): () => void {
  const channel = supabase
    .channel('duck-posts-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'duck_posts' }, onChange)
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}

// =========================================================================
// Stamps + duck spots (§5.7)
// =========================================================================

export interface DuckSpot {
  id: string;
  nameEn: string;
  nameJa: string;
}

/** One row of the 図鑑. Numbered by the canonical lat-descending ordering, so
 * No.01 is the same duck everywhere in the app. */
export interface CollectionEntry {
  id: string;
  number: number; // 1-based catalogue number
  nameEn: string;
  nameJa: string;
  color: string;
  /** Your own photo of this duck, once you've found it. The collection shows
   * what YOU saw, which is the point -- a shared icon wouldn't be a collection. */
  photoUrl: string | null;
  /** stamps.earned_at, shown as 保存日. Null while uncollected. */
  collectedAt: string | null;
}

/**
 * The whole collection for one user: every active duck, in catalogue order,
 * annotated with whether they've collected it and which of their own photos
 * fills the entry.
 *
 * Their most recent photo of each duck wins, so retaking a bad shot replaces it.
 */
export async function fetchCollection(userId: string): Promise<CollectionEntry[]> {
  const [{ data: spots, error: se }, { data: stamps, error: ste }, { data: photos, error: pe }] =
    await Promise.all([
      supabase
        .from('duck_spots')
        .select('id, name_en, name_ja')
        .eq('active', true)
        .order('lat', { ascending: false }),
      supabase.from('stamps').select('duck_spot_id, earned_at').eq('user_id', userId),
      supabase
        .from('duck_posts')
        .select('duck_spot_id, photo_url, created_at')
        .eq('author_id', userId)
        .eq('hidden', false)
        .not('duck_spot_id', 'is', null)
        .order('created_at', { ascending: false }),
    ]);
  if (se) throw se;
  if (ste) throw ste;
  if (pe) throw pe;

  const earnedAt = new Map(stamps.map((s) => [s.duck_spot_id, s.earned_at]));
  const myPhoto = new Map<string, string>();
  for (const p of photos) if (!myPhoto.has(p.duck_spot_id)) myPhoto.set(p.duck_spot_id, p.photo_url);

  return spots.map((s, i) => ({
    id: s.id,
    number: i + 1,
    nameEn: s.name_en,
    nameJa: s.name_ja,
    color: duckColor(i),
    photoUrl: myPhoto.get(s.id) ?? null,
    collectedAt: earnedAt.get(s.id) ?? null,
  }));
}

export async function fetchDuckSpots(): Promise<DuckSpot[]> {
  const { data, error } = await supabase
    .from('duck_spots')
    .select('id, name_en, name_ja, lat')
    .eq('active', true)
    .order('lat', { ascending: false }); // north-to-south along the river
  if (error) throw error;
  return data.map((s) => ({ id: s.id, nameEn: s.name_en, nameJa: s.name_ja }));
}


/** A duck spot's own coordinates, looked up by its QR token -- used by test
 * mode to submit "I'm standing at this spot" so the server geofence passes for
 * any QR without actually being there (no easier to abuse than spoofing GPS). */
export async function fetchDuckSpotCoords(token: string): Promise<{ lat: number; lng: number } | null> {
  const { data, error } = await supabase
    .from('duck_spots')
    .select('lat, lng')
    .eq('qr_token', token)
    .eq('active', true)
    .maybeSingle();
  if (error) throw error;
  return data ? { lat: data.lat, lng: data.lng } : null;
}

/** A duck spot's own coordinates by id -- what test mode submits so the
 * geofence passes without standing at the river. */
export async function fetchDuckSpotCoordsById(id: string): Promise<GeoPoint | null> {
  const { data, error } = await supabase
    .from('duck_spots')
    .select('lat, lng')
    .eq('id', id)
    .eq('active', true)
    .maybeSingle();
  if (error) throw error;
  return data ? { lat: data.lat, lng: data.lng } : null;
}

export async function fetchCertificate(userId: string): Promise<{ issuedAt: string } | null> {
  const { data, error } = await supabase
    .from('certificates')
    .select('issued_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data ? { issuedAt: data.issued_at } : null;
}

// =========================================================================
// Geofenced scan (§A.2b) -- all stamp-granting goes through the server RPC.
// =========================================================================

export type ScanResult =
  | { status: 'unauthenticated' }
  | { status: 'not_found' }
  | { status: 'too_far'; distance: number; spotNameEn: string; spotNameJa: string }
  | {
      status: 'already' | 'collected';
      spotNameEn: string;
      spotNameJa: string;
      duckSpotId: string;
      stampCount: number;
      certificateEarned: boolean;
    };

interface RawScan {
  status: string;
  distance?: number;
  spot_name_en?: string;
  spot_name_ja?: string;
  duck_spot_id?: string;
  stamp_count?: number;
  certificate_earned?: boolean;
}

export async function scanDuckSpot(token: string, lat: number, lng: number): Promise<ScanResult> {
  const { data, error } = await supabase.rpc('scan_duck_spot', {
    p_token: token,
    p_lat: lat,
    p_lng: lng,
  });
  if (error) throw error;
  const r = data as RawScan;
  switch (r.status) {
    case 'too_far':
      return {
        status: 'too_far',
        distance: r.distance ?? 0,
        spotNameEn: r.spot_name_en ?? '',
        spotNameJa: r.spot_name_ja ?? '',
      };
    case 'already':
    case 'collected':
      return {
        status: r.status,
        spotNameEn: r.spot_name_en ?? '',
        spotNameJa: r.spot_name_ja ?? '',
        duckSpotId: r.duck_spot_id ?? '',
        stampCount: r.stamp_count ?? 0,
        certificateEarned: r.certificate_earned ?? false,
      };
    case 'not_found':
      return { status: 'not_found' };
    default:
      return { status: 'unauthenticated' };
  }
}

// =========================================================================
// QR app-entry analytics (§A.2a)
// =========================================================================

export async function logQrEntry(spotSlug: string): Promise<void> {
  const { error } = await supabase.from('qr_entries').insert({ spot_slug: spotSlug });
  if (error) throw error;
}
