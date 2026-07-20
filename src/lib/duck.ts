import { supabase } from './supabase';
import { uploadPhoto, reportContent } from './toukou';
import { KAMOGAWA_DELTA } from './cesium';
import { getPosition } from './geo';

// =========================================================================
// Duck photo feed (social; decoupled from stamps -- §5.7)
// =========================================================================

export interface DuckPost {
  id: string;
  photoUrl: string;
  createdAt: string;
}

export async function fetchDuckPosts(): Promise<DuckPost[]> {
  const { data, error } = await supabase
    .from('duck_posts')
    .select('id, photo_url, created_at')
    .eq('hidden', false)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data.map((d) => ({ id: d.id, photoUrl: d.photo_url, createdAt: d.created_at }));
}

/** Uploads the photo and creates a duck post. Location is best-effort (falls
 * back to the Kamogawa default) -- unlike a stamp scan, a photo post isn't
 * geofenced. */
export async function createDuckPost(userId: string, photoFile: File): Promise<void> {
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
    .insert({ author_id: userId, photo_url: photoUrl, lat, lng });
  if (error) throw error;
}

export function reportDuckPost(reporterId: string, postId: string): Promise<void> {
  return reportContent(reporterId, 'duck_post', postId);
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
  return spots.map((s) => ({ ...s, earned: earned.has(s.id) }));
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
