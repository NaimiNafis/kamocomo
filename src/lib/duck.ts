import { supabase } from './supabase';
import { uploadPhoto, reportContent, subShade, type ToukouEdge } from './toukou';
import { KAMOGAWA_DELTA, getPosition } from './geo';
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
  earned: boolean; // main only -- whether this user has this duck's stamp
  photoUrl: string | null; // sub only
}

export interface DuckGraph {
  nodes: DuckNode[];
  edges: ToukouEdge[];
}

/** Builds the duck graph: the 10 active duck spots as colored main nodes
 * (ordered lat-desc so colors match the map/stamp card), each flagged with
 * whether the user has earned its stamp, plus every non-hidden duck photo as
 * a sub of its duck. */
export async function fetchDuckGraph(userId: string): Promise<DuckGraph> {
  const [{ data: spots, error: se }, { data: posts, error: pe }, { data: stamps, error: ste }] =
    await Promise.all([
      supabase.from('duck_spots').select('id, name_en, name_ja').eq('active', true).order('lat', { ascending: false }),
      supabase
        .from('duck_posts')
        .select('id, photo_url, duck_spot_id')
        .eq('hidden', false)
        .not('duck_spot_id', 'is', null)
        .order('created_at', { ascending: true }),
      supabase.from('stamps').select('duck_spot_id').eq('user_id', userId),
    ]);
  if (se) throw se;
  if (pe) throw pe;
  if (ste) throw ste;

  const earned = new Set(stamps.map((s) => s.duck_spot_id));
  const colorBySpot = new Map(spots.map((s, i) => [s.id, duckColor(i)]));

  const mainNodes: DuckNode[] = spots.map((s, i) => ({
    id: s.id,
    kind: 'main',
    parentId: null,
    color: duckColor(i),
    nameEn: s.name_en,
    nameJa: s.name_ja,
    earned: earned.has(s.id),
    photoUrl: null,
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
      earned: false,
      photoUrl: p.photo_url,
    }));

  const edges: ToukouEdge[] = subNodes.map((s) => ({ source: s.id, target: s.parentId as string }));
  return { nodes: [...mainNodes, ...subNodes], edges };
}

/** Uploads a photo and posts it onto a specific duck. Location is best-effort
 * (falls back to the Kamogawa default) -- unlike a stamp scan, a photo post
 * isn't geofenced. */
export async function createDuckPost(userId: string, photoFile: File, duckSpotId: string): Promise<void> {
  const photoUrl = await uploadPhoto(userId, photoFile);
  let lat = KAMOGAWA_DELTA.latitude;
  let lng = KAMOGAWA_DELTA.longitude;
  try {
    const pos = await getPosition();
    lat = pos.lat;
    lng = pos.lng;
  } catch {
    /* keep the default */
  }
  const { error } = await supabase
    .from('duck_posts')
    .insert({ author_id: userId, photo_url: photoUrl, duck_spot_id: duckSpotId, lat, lng });
  if (error) throw error;
}

export function reportDuckPost(reporterId: string, postId: string): Promise<void> {
  return reportContent(reporterId, 'duck_post', postId);
}

/** Realtime: new duck photos appear in the graph without a reload. */
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

export interface StampCardSlot extends DuckSpot {
  earned: boolean;
  color: string; // this duck's color (shared with its map marker + graph node)
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

/** The 10-slot stamp card: every active spot, flagged with whether this user
 * has earned it. */
export async function fetchStampCard(userId: string): Promise<StampCardSlot[]> {
  const [spots, { data: stamps, error }] = await Promise.all([
    fetchDuckSpots(),
    supabase.from('stamps').select('duck_spot_id').eq('user_id', userId),
  ]);
  if (error) throw error;
  const earned = new Set(stamps.map((s) => s.duck_spot_id));
  // Ordered lat-desc by fetchDuckSpots, so index -> duckColor matches the map
  // markers and the duck graph.
  return spots.map((s, i) => ({ ...s, earned: earned.has(s.id), color: duckColor(i) }));
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
