import { supabase } from './supabase';
import type { MarkerPoint } from './map3d';
import { duckColor, duckPlaceIconDataUri } from './ducks';

/**
 * Canonical duck ordering: lat descending, north-to-south. Everything that
 * shows the 10 ducks must use it, so duck N is the same color on the map, on
 * the stamp card and in the graph.
 */
async function fetchDuckOrder(): Promise<Map<string, number>> {
  const { data, error } = await supabase
    .from('duck_spots')
    .select('id')
    .eq('active', true)
    .order('lat', { ascending: false });
  if (error) throw error;
  return new Map(data.map((s, i) => [s.id, i]));
}

/**
 * The map's markers: one per active place, and since 20260801120000 every
 * active place IS a duck spot, so each is drawn with its duck's colored icon
 * (the duck with the "!" worked in). Places whose duck link is missing are
 * skipped rather than drawn with a fallback color — an unlinked place is
 * stale data from before that migration, and showing it would put a marker on
 * the map that the combined board can't render a duck for.
 */
export async function fetchPlaceMarkers(): Promise<MarkerPoint[]> {
  const [{ data, error }, duckOrder] = await Promise.all([
    supabase.from('places').select('id, lat, lng, duck_spot_id').eq('active', true),
    fetchDuckOrder(),
  ]);
  if (error) throw error;

  return data.flatMap((place) => {
    const index = place.duck_spot_id ? duckOrder.get(place.duck_spot_id) : undefined;
    if (index === undefined) return [];
    return [
      {
        id: place.id,
        lat: place.lat,
        lng: place.lng,
        iconUrl: duckPlaceIconDataUri(duckColor(index)),
      },
    ];
  });
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
