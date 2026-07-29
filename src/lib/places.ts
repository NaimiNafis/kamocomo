import { supabase } from './supabase';
import type { MarkerPoint } from './cesium';

/** The fixed activity places, as map markers (one exclamation marker each). */
export async function fetchPlaceMarkers(): Promise<MarkerPoint[]> {
  const { data, error } = await supabase
    .from('places')
    .select('id, lat, lng')
    .eq('active', true);
  if (error) throw error;
  return data;
}

export interface PlacePreview {
  id: string;
  nameEn: string;
  nameJa: string;
  photoUrls: string[]; // a few of the place's mains' photos, for the popup
  activityCount: number; // how many live mains are happening here now
}

/**
 * A place's preview for the marker-tap popup: its name, a few of its current
 * mains' photos, and how many activities are live there. Null if the place is
 * gone. Non-archived, non-hidden mains only (= today's board at demo scale).
 */
export async function fetchPlacePreview(placeId: string): Promise<PlacePreview | null> {
  const [{ data: place, error: pe }, { data: mains, error: me }] = await Promise.all([
    supabase.from('places').select('id, name_en, name_ja').eq('id', placeId).maybeSingle(),
    supabase
      .from('activities')
      .select('photo_url')
      .eq('place_id', placeId)
      .eq('kind', 'main')
      .eq('hidden', false)
      .eq('archived', false),
  ]);
  if (pe) throw pe;
  if (me) throw me;
  if (!place) return null;

  const photoUrls = mains
    .map((m) => m.photo_url)
    .filter((u): u is string => !!u)
    .slice(0, 3);

  return {
    id: place.id,
    nameEn: place.name_en,
    nameJa: place.name_ja,
    photoUrls,
    activityCount: mains.length,
  };
}
