import { supabase } from './supabase';
import type { MarkerPoint } from './cesium';

/** Non-hidden main activities, as map markers (§5.3). */
export async function fetchMainActivityMarkers(): Promise<MarkerPoint[]> {
  const { data, error } = await supabase
    .from('activities')
    .select('id, lat, lng')
    .eq('kind', 'main')
    .eq('hidden', false);

  if (error) throw error;
  return data;
}

/**
 * Realtime: new main activities appear on the map without a reload (§5.3).
 * Returns an unsubscribe function.
 */
export function subscribeToNewMainActivities(onInsert: (marker: MarkerPoint) => void): () => void {
  const channel = supabase
    .channel('main-activities-inserts')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'activities', filter: 'kind=eq.main' },
      (payload) => {
        const row = payload.new as { id: string; lat: number; lng: number; hidden: boolean };
        if (!row.hidden) onInsert({ id: row.id, lat: row.lat, lng: row.lng });
      },
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
