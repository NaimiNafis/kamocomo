import { importLibrary } from '@googlemaps/js-api-loader';
import { KAMOGAWA_BOUNDS, MAX_ALTITUDE_M, MIN_ALTITUDE_M, type MarkerPoint } from './map3d';

/**
 * The flat map — the ordinary Google map, with blue water and green parks.
 *
 * This is the classic 2D `google.maps.Map`, deliberately NOT `Map3DElement`'s
 * `MapMode.ROADMAP`. That mode is pre-GA and exists only on the `v=alpha`
 * channel, which renders a "For development purposes only" banner above the map
 * for every visitor. The 2D API has been generally available for years, so the
 * same view costs nothing in stability.
 *
 * It bills to a different SKU (Dynamic Maps) than the 3D map (Immersive Maps),
 * each with its own monthly free allowance, so the two don't compete — and the
 * map is only created the first time someone actually switches to 2D.
 */

export type Map2D = google.maps.Map;

/** Vertical field of view of the 3D camera, used to convert its `range` (metres
 * from the camera to the ground) into an equivalent 2D zoom. */
const FOV_HEIGHT_FACTOR = 0.63; // 2 * tan(35° / 2)
const METERS_PER_PIXEL_AT_ZOOM_0 = 156543.03392;

/** Hides every label while leaving geometry alone, so water stays blue and
 * parks stay green. Inline styling like this only works on a map with no
 * `mapId` — which is also why markers below are the classic kind. */
const LABELS_OFF: google.maps.MapTypeStyle[] = [
  { elementType: 'labels', stylers: [{ visibility: 'off' }] },
];

/** Screen height in metres implied by a 3D camera `range`. */
function visibleMeters(range: number): number {
  return range * FOV_HEIGHT_FACTOR;
}

/** 3D `range` → the 2D zoom that frames roughly the same ground. */
export function rangeToZoom(range: number, lat: number, viewportHeightPx: number): number {
  const metresPerPixel = visibleMeters(range) / Math.max(viewportHeightPx, 1);
  const zoom = Math.log2(
    (METERS_PER_PIXEL_AT_ZOOM_0 * Math.cos((lat * Math.PI) / 180)) / metresPerPixel,
  );
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

/** 2D zoom → the 3D `range` that frames roughly the same ground. */
export function zoomToRange(zoom: number, lat: number, viewportHeightPx: number): number {
  const metresPerPixel =
    (METERS_PER_PIXEL_AT_ZOOM_0 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom);
  return (metresPerPixel * viewportHeightPx) / FOV_HEIGHT_FACTOR;
}

// §8.1 cost control, mirrored from the 3D clamp so neither view can wander off
// the river or pull in tiles outside it. Derived from the same altitudes at the
// corridor's centre latitude, then rounded to whole zoom levels.
const CENTRE_LAT = (KAMOGAWA_BOUNDS.north + KAMOGAWA_BOUNDS.south) / 2;
const MIN_ZOOM = Math.ceil(
  Math.log2((METERS_PER_PIXEL_AT_ZOOM_0 * Math.cos((CENTRE_LAT * Math.PI) / 180) * 800) / visibleMeters(MAX_ALTITUDE_M)),
);
const MAX_ZOOM = Math.floor(
  Math.log2((METERS_PER_PIXEL_AT_ZOOM_0 * Math.cos((CENTRE_LAT * Math.PI) / 180) * 800) / visibleMeters(MIN_ALTITUDE_M)),
);

export interface Map2DHandle {
  map: Map2D;
  setLabels(showLabels: boolean): void;
  setMarkers(points: MarkerPoint[]): void;
  /** Point the flat map at the same place the 3D camera was looking. */
  moveTo(lat: number, lng: number, range: number, viewportHeightPx: number): void;
  /** Where it's looking now, so the 3D camera can pick the view back up. */
  readView(viewportHeightPx: number): { lat: number; lng: number; range: number } | null;
  dispose(): void;
}

export async function createMap2D(
  container: HTMLElement,
  onTap: (placeId: string) => void,
): Promise<Map2DHandle> {
  const { Map } = await importLibrary('maps');
  const { Marker } = await importLibrary('marker');

  const map = new Map(container, {
    center: { lat: CENTRE_LAT, lng: (KAMOGAWA_BOUNDS.east + KAMOGAWA_BOUNDS.west) / 2 },
    zoom: Math.min(MAX_ZOOM, MIN_ZOOM + 3),
    minZoom: MIN_ZOOM,
    maxZoom: MAX_ZOOM,
    // Same corridor as the 3D view. strictBounds stops the viewport leaving it
    // at all, rather than merely pulling back afterwards.
    restriction: { latLngBounds: KAMOGAWA_BOUNDS, strictBounds: true },
    disableDefaultUI: true,
    gestureHandling: 'greedy',
    clickableIcons: false, // Google's own POIs shouldn't compete with the ducks
  });

  let markers: google.maps.Marker[] = [];

  return {
    map,
    setLabels: (showLabels) => map.setOptions({ styles: showLabels ? [] : LABELS_OFF }),
    setMarkers: (points) => {
      markers.forEach((m) => m.setMap(null));
      // The classic Marker rather than AdvancedMarkerElement: the advanced one
      // requires a mapId, and a mapId disables the inline `styles` above, which
      // is what gives us the labels toggle without any Cloud console work.
      // Deprecated but supported, and swappable if that ever changes.
      markers = points.map((p) => {
        const marker = new Marker({
          map,
          position: { lat: p.lat, lng: p.lng },
          icon: { url: p.iconUrl, scaledSize: new google.maps.Size(30, 30) },
        });
        marker.addListener('click', () => onTap(p.id));
        return marker;
      });
    },
    moveTo: (lat, lng, range, viewportHeightPx) => {
      map.setCenter({ lat, lng });
      map.setZoom(rangeToZoom(range, lat, viewportHeightPx));
    },
    readView: (viewportHeightPx) => {
      const centre = map.getCenter();
      const zoom = map.getZoom();
      if (!centre || zoom === undefined) return null;
      const lat = centre.lat();
      return { lat, lng: centre.lng(), range: zoomToRange(zoom, lat, viewportHeightPx) };
    },
    dispose: () => {
      markers.forEach((m) => m.setMap(null));
      markers = [];
    },
  };
}
