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

export interface ActivityPreview {
  id: string;
  phrase: string | null;
  photoUrl: string | null;
  lat: number;
  lng: number;
  typeNameEn: string;
  typeNameJa: string;
  color: string;
}

/**
 * A single main's preview -- phrase, photo, location, and its activity-type
 * name/color -- for the marker-tap cinematic's popup (§B3). Null if the main
 * is hidden or gone.
 */
export async function fetchActivityPreview(id: string): Promise<ActivityPreview | null> {
  const [{ data: main, error: mainError }, { data: types, error: typesError }] = await Promise.all([
    supabase
      .from('activities')
      .select('id, phrase, photo_url, lat, lng, activity_type')
      .eq('id', id)
      .eq('kind', 'main')
      .eq('hidden', false)
      .maybeSingle(),
    supabase.from('activity_types').select('id, name_en, name_ja, color'),
  ]);
  if (mainError) throw mainError;
  if (typesError) throw typesError;
  if (!main) return null;

  const type = types.find((t) => t.id === main.activity_type);
  return {
    id: main.id,
    phrase: main.phrase,
    photoUrl: main.photo_url,
    lat: main.lat,
    lng: main.lng,
    typeNameEn: type?.name_en ?? '',
    typeNameJa: type?.name_ja ?? '',
    color: type?.color ?? '#6e8ca0',
  };
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
