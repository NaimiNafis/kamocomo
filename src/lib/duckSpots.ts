import { supabase } from './supabase';
import type { MarkerPoint } from './cesium';

/** Active duck spots, as map markers (§5.3). */
export async function fetchActiveDuckSpotMarkers(): Promise<MarkerPoint[]> {
  const { data, error } = await supabase.from('duck_spots').select('id, lat, lng').eq('active', true);

  if (error) throw error;
  return data;
}
