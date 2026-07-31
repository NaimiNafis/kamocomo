import { supabase } from './supabase';
import type { MarkerPoint } from './map3d';
import { duckColor, duckIconDataUri } from './ducks';

/**
 * Active duck spots as map markers, each drawn with its own colored duck icon
 * (item 1). Ordered lat-descending (north-to-south) so a spot's color matches
 * the same ordering used by the stamp card and the duck graph.
 */
export async function fetchActiveDuckSpotMarkers(): Promise<MarkerPoint[]> {
  const { data, error } = await supabase
    .from('duck_spots')
    .select('id, lat, lng')
    .eq('active', true)
    .order('lat', { ascending: false });
  if (error) throw error;
  return data.map((s, i) => ({
    id: s.id,
    lat: s.lat,
    lng: s.lng,
    iconUrl: duckIconDataUri(duckColor(i)),
  }));
}
