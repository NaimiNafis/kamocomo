import { importLibrary } from '@googlemaps/js-api-loader';
import {
  KAMOGAWA_BOUNDS,
  MAX_ALTITUDE_M,
  MIN_ALTITUDE_M,
  userLocationIcon,
  type MarkerPoint,
} from './map3d';
import { MARKER_PIXEL_SIZE, type ProximityLevel } from './ducks';

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
  /** Same proximity glow the 3D map uses — a duck shouldn't stop being lit just
   * because you flattened the view. */
  setProximity(placeId: string | null, level: ProximityLevel): void;
  /** The visitor's own position. The flat map had no dot at all at first, so
   * switching to 2D lost track of where you were standing. */
  setUserPosition(lat: number, lng: number, heading: number | null): void;
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
  // Aliased: destructuring `Map` here would shadow the global Map constructor,
  // and the marker lookups below are plain JS Maps.
  const { Map: GoogleMap } = await importLibrary('maps');
  const { Marker } = await importLibrary('marker');

  const map = new GoogleMap(container, {
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

  let markers = new Map<string, google.maps.Marker>();
  let points: MarkerPoint[] = [];
  let litId: string | null = null;
  let litLevel: ProximityLevel = 0;
  let userMarker: google.maps.Marker | null = null;

  // One size for every level, and the SAME constant the 3D map uses -- a second
  // literal here is how the two drifted apart last time.
  const MARKER_PX = MARKER_PIXEL_SIZE;
  const iconFor = (p: MarkerPoint) => {
    const level = p.id === litId ? litLevel : 0;
    const url = level > 0 && p.litIcon ? p.litIcon(level) : p.iconUrl;
    return {
      url,
      scaledSize: new google.maps.Size(MARKER_PX, MARKER_PX),
      anchor: new google.maps.Point(MARKER_PX / 2, MARKER_PX / 2),
    };
  };

  return {
    map,
    setLabels: (showLabels) => map.setOptions({ styles: showLabels ? [] : LABELS_OFF }),
    setProximity: (placeId, level) => {
      if (placeId === litId && level === litLevel) return;
      const affected = new Set([litId, placeId].filter((id): id is string => id !== null));
      litId = placeId;
      litLevel = level;
      // Only restyle what changed; setIcon avoids rebuilding the marker at all.
      affected.forEach((id) => {
        const point = points.find((p) => p.id === id);
        if (point) markers.get(id)?.setIcon(iconFor(point));
      });
    },
    setUserPosition: (lat, lng, heading) => {
      const icon = {
        url: userLocationIcon(heading),
        scaledSize: new google.maps.Size(72, 72),
        anchor: new google.maps.Point(36, 36),
      };
      if (userMarker) {
        userMarker.setPosition({ lat, lng });
        userMarker.setIcon(icon);
        return;
      }
      userMarker = new Marker({
        map,
        position: { lat, lng },
        icon,
        clickable: false,
        zIndex: 1000, // above the ducks; it's where YOU are
      });
    },
    setMarkers: (next) => {
      markers.forEach((m) => m.setMap(null));
      // The classic Marker rather than AdvancedMarkerElement: the advanced one
      // requires a mapId, and a mapId disables the inline `styles` above, which
      // is what gives us the labels toggle without any Cloud console work.
      // Deprecated but supported, and swappable if that ever changes.
      markers = new Map();
      points = next;
      for (const p of points) {
        const marker = new Marker({
          map,
          position: { lat: p.lat, lng: p.lng },
          icon: iconFor(p),
        });
        marker.addListener('click', () => onTap(p.id));
        markers.set(p.id, marker);
      }
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
      markers = new Map();
      userMarker?.setMap(null);
      userMarker = null;
      points = [];
    },
  };
}
