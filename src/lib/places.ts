import { supabase } from './supabase';
import type { MarkerPoint } from './map3d';
import { duckColor, duckMarkerDataUri, type ProximityLevel } from './ducks';

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
 * (its duck, recolored). Places whose duck link is missing are
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
        // Same generator for both, so lit and unlit are identical apart from
        // the halo -- no size to drift between them.
        iconUrl: duckMarkerDataUri(duckColor(index), 0),
        litIcon: (level) => duckMarkerDataUri(duckColor(index), level),
      },
    ];
  });
}

/**
 * How far away each band starts, in metres. The tightest one matches the
 * ~120 m collection geofence, so the brightest state means "you are close
 * enough to collect this" rather than an arbitrary threshold — the glow is
 * telling you something actionable, not just decorating.
 */
const PROXIMITY_BANDS: { within: number; level: ProximityLevel }[] = [
  { within: 120, level: 3 },
  { within: 300, level: 2 },
  { within: 800, level: 1 },
];

/**
 * The duck nearest a point, and how brightly it should be lit. Null beyond the
 * widest band, so nothing glows for someone browsing from another city, where
 * "nearest" is a meaningless answer.
 */
export function nearestDuck(
  points: MarkerPoint[],
  lat: number,
  lng: number,
): { id: string; level: ProximityLevel } | null {
  let bestId: string | null = null;
  let best = Infinity;
  for (const p of points) {
    const dy = (p.lat - lat) * 111_320;
    const dx = (p.lng - lng) * 111_320 * Math.cos((lat * Math.PI) / 180);
    const d = Math.hypot(dx, dy);
    if (d < best) {
      best = d;
      bestId = p.id;
    }
  }
  if (bestId === null) return null;
  const band = PROXIMITY_BANDS.find((b) => best <= b.within);
  return band ? { id: bestId, level: band.level } : null;
}

export interface PlacePreview {
  id: string;
  nameEn: string;
  nameJa: string;
  /** The place's mains' photos, newest-ish first. The popup shows only the
   * first; the rest are kept because they cost nothing (same query, just a
   * slice) and a gallery would need them. */
  photoUrls: string[];
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
