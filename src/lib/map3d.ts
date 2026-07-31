import { importLibrary, setOptions } from '@googlemaps/js-api-loader';
import exclamationIconUrl from '../../img/marks/exclamation.svg?url';
import duckIconUrl from '../../img/marks/duck.svg?url';
import { KAMOGAWA_DELTA } from './geo';

/**
 * Google Maps Platform 3D Maps (`Map3DElement`) — replaces the previous
 * CesiumJS + Cesium ion globe. The camera work the app depends on (the intro
 * flight from the far side of Earth, the marker-tap fly-in and orbit) is
 * native here: `flyCameraTo()` and `flyCameraAround()`.
 *
 * §8.1 cost control lives in `applyKamogawaConstraints()` below — the camera
 * is locked to a tight Kamogawa corridor with min/max altitude and a tilt cap
 * so a user can never pan away or flatten the view enough to pull in tiles
 * outside the stretch of river the app is about.
 * Never remove these limits (CLAUDE.md architecture rule #4).
 */

export type Maps3D = google.maps.Maps3DLibrary;
export type Map3D = google.maps.maps3d.Map3DElement;

/**
 * The Kamogawa corridor the camera is clamped to. Derived from the seeded
 * data — all 16 active places (34.9966–35.0484 N, 135.7601–135.7852 E) and all
 * 10 duck spots (34.975–35.043 N) — plus ~1.5 km of margin so edge markers
 * aren't jammed against the wall.
 *
 * Deliberately NOT the Kyoto-shi administrative boundary, which sprawls north
 * into the Sakyo-ku mountains and west past Arashiyama and would be *looser*
 * than this — the point is to keep visitors on the river.
 */
export const KAMOGAWA_BOUNDS: google.maps.LatLngBoundsLiteral = {
  south: 34.96,
  north: 35.065,
  west: 135.745,
  east: 135.8,
};

export const MIN_ALTITUDE_M = 300; // keep the camera from clipping into the ground
export const MAX_ALTITUDE_M = 20_000; // keep it from zooming out to a globe/space view

/**
 * A shallow (near-horizontal) camera reveals ground far past the horizon even
 * at a modest height, pulling in tiles well outside the corridor. Cap how flat
 * it can tilt so the visible footprint stays roughly local.
 *
 * Google measures tilt opposite to Cesium (0° = straight down here, -90° =
 * straight down there), so the old -35° pitch cap becomes 90 + (-35) = 55.
 */
const MAX_TILT_DEGREES = 55;

let optionsSet = false;

/**
 * Loads the `maps3d` library. The Maps JS API is fetched from Google's CDN on
 * first call and cached by the loader, so repeat calls are cheap.
 *
 * Pinned to the `weekly` (stable) channel deliberately: `MapMode.ROADMAP` is
 * documented as Experimental (pre-GA) and only exists on `v=alpha`, and
 * putting a live site on the alpha channel to get it isn't a trade worth
 * making. The river overlay (lib/river.ts) covers what roadmap mode would
 * have given us.
 */
export function loadMaps3d(): Promise<Maps3D> {
  if (!optionsSet) {
    const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
    setOptions({ key, v: 'weekly' });
    optionsSet = true;
  }
  return importLibrary('maps3d');
}

// =========================================================================
// Camera views + flights
// =========================================================================

interface CameraView {
  center: google.maps.LatLngAltitudeLiteral;
  range: number;
  tilt: number;
  heading: number;
}

/** The resting/home view: arrived at the Kamogawa Delta (§5.1's destination). */
const HERO_VIEW: CameraView = {
  center: { lat: KAMOGAWA_DELTA.latitude, lng: KAMOGAWA_DELTA.longitude, altitude: 0 },
  range: 4500,
  tilt: 40,
  heading: 0,
};

/** Whole-Earth view — the intro's starting point, on the hemisphere OPPOSITE
 * Japan (mid-Atlantic/South America side), so the flight visibly sweeps
 * across the globe to reveal Japan rather than starting already facing it. */
const FAR_SIDE_VIEW: CameraView = {
  center: { lat: 10, lng: -42, altitude: 0 },
  range: 20_000_000,
  tilt: 0,
  heading: 0,
};

/** Japan-scale overview — first stop of the intro flight. */
const JAPAN_VIEW: CameraView = {
  center: { lat: 36.5, lng: 137.5, altitude: 0 },
  range: 1_600_000,
  tilt: 0,
  heading: 0,
};

/** Kyoto-scale overview — second stop of the intro flight. */
const KYOTO_OVERVIEW_VIEW: CameraView = {
  center: { lat: KAMOGAWA_DELTA.latitude, lng: KAMOGAWA_DELTA.longitude, altitude: 0 },
  range: 80_000,
  tilt: 0,
  heading: 0,
};

const PLACE_VIEW_RANGE_M = 350;
const PLACE_VIEW_TILT = 52; // was Cesium pitch -38°

/** Instantly places the camera at the resting home view (no animation). */
export function setHomeView(map: Map3D): void {
  map.center = HERO_VIEW.center;
  map.range = HERO_VIEW.range;
  map.tilt = HERO_VIEW.tilt;
  map.heading = HERO_VIEW.heading;
}

/**
 * `flyCameraTo`/`flyCameraAround` return as soon as the animation *starts*;
 * completion arrives as a `gmp-animationend` event. This resolves on that
 * event, or immediately if the flight is cancelled out from under us.
 */
function awaitAnimation(map: Map3D, signal?: { cancelled: boolean }): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.cancelled) {
      resolve();
      return;
    }
    const done = () => {
      map.removeEventListener('gmp-animationend', done);
      resolve();
    };
    map.addEventListener('gmp-animationend', done, { once: true });
  });
}

function flyToStep(map: Map3D, view: CameraView, durationMillis: number, signal?: { cancelled: boolean }) {
  map.flyCameraTo({
    endCamera: { center: view.center, range: view.range, tilt: view.tilt, heading: view.heading },
    durationMillis,
  });
  return awaitAnimation(map, signal);
}

/**
 * Flies back to the resting home view (e.g. after closing a marker-tap
 * cinematic) so the visitor can see and tap other markers again, instead of
 * being left zoomed into wherever the cinematic ended.
 */
export function flyToHomeView(map: Map3D, durationMillis = 1200): Promise<void> {
  return flyToStep(map, HERO_VIEW, durationMillis);
}

/**
 * §5.1 intro flight: the far side of Earth -> Japan -> Kyoto -> Kamogawa
 * Delta, ~5s total. Starts from FAR_SIDE_VIEW instantly (the reveal happens
 * in the overlay, not here) so the first leg visibly sweeps across the whole
 * globe to bring Japan into view -- more dramatic than starting already
 * facing it. Pass a `signal` and flip `signal.cancelled = true` (alongside
 * `map.stopCameraAnimation()`) to stop the sequence early, e.g. for the
 * intro's Skip button.
 */
export async function flyIntroSequence(map: Map3D, signal: { cancelled: boolean }): Promise<void> {
  map.center = FAR_SIDE_VIEW.center;
  map.range = FAR_SIDE_VIEW.range;
  map.tilt = FAR_SIDE_VIEW.tilt;
  map.heading = FAR_SIDE_VIEW.heading;
  if (signal.cancelled) return;
  await flyToStep(map, JAPAN_VIEW, 2200, signal);
  if (signal.cancelled) return;
  await flyToStep(map, KYOTO_OVERVIEW_VIEW, 1300, signal);
  if (signal.cancelled) return;
  await flyToStep(map, HERO_VIEW, 1500, signal);
}

/** Flies in close and low over the spot (oblique, not top-down) so its
 * surroundings actually read as a place rather than a satellite dot. */
export function flyToPlace(map: Map3D, lat: number, lng: number, durationMillis = 1800): Promise<void> {
  return flyToStep(
    map,
    {
      center: { lat, lng, altitude: 0 },
      range: PLACE_VIEW_RANGE_M,
      tilt: PLACE_VIEW_TILT,
      heading: 0,
    },
    durationMillis,
  );
}

/**
 * Slowly orbits the camera around the spot so the visitor sees where it sits
 * relative to its surroundings. One clockwise round, then it stops.
 * Returns a promise (resolves when the orbit ends or is cancelled) and a
 * cancel function.
 */
export function orbitPlace(
  map: Map3D,
  lat: number,
  lng: number,
  durationMillis = 2000,
): { promise: Promise<void>; cancel: () => void } {
  const signal = { cancelled: false };

  map.flyCameraAround({
    camera: {
      center: { lat, lng, altitude: 0 },
      range: PLACE_VIEW_RANGE_M,
      tilt: PLACE_VIEW_TILT,
    },
    durationMillis,
    repeatCount: 1,
  });

  return {
    promise: awaitAnimation(map, signal),
    cancel: () => {
      signal.cancelled = true;
      map.stopCameraAnimation();
    },
  };
}

// =========================================================================
// §8.1 cost control — the Kamogawa corridor clamp
// =========================================================================

/**
 * Applies the corridor + altitude + tilt constraints to the map. Returns a
 * cleanup that lifts them again — the intro flight and the marker-tap
 * cinematic both legitimately need views the clamp would fight (the flight
 * passes through space; the close-up sits below the min altitude), so
 * MainMap lifts them for those and restores them after.
 */
export function applyKamogawaConstraints(map: Map3D): () => void {
  map.bounds = KAMOGAWA_BOUNDS;
  map.minAltitude = MIN_ALTITUDE_M;
  map.maxAltitude = MAX_ALTITUDE_M;
  map.maxTilt = MAX_TILT_DEGREES;

  return () => {
    map.bounds = null;
    map.minAltitude = null;
    map.maxAltitude = null;
    map.maxTilt = null;
  };
}

// =========================================================================
// §5.3 map style — the two-mode switch
// =========================================================================

/**
 * SATELLITE renders photorealistic 3D with NO labels, names or road text at
 * all; HYBRID is the same imagery with roads and place names on top. That's
 * the whole "hide every label" feature — one property.
 */
export type MapStyle = 'satellite' | 'hybrid';

export function setMapStyle(map: Map3D, style: MapStyle): void {
  map.mode = style === 'satellite' ? 'SATELLITE' : 'HYBRID';
}

/** Reads a color straight from the §4.1 CSS tokens, so map graphics never
 * hardcode a hex value that could drift from tokens.css. */
export function kamoColor(cssVariable: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(cssVariable).trim();
}

// =========================================================================
// §5.3 "you are here"
// =========================================================================

/**
 * Adds the "you are here" marker (§5.3): a labelled pin at the visitor's
 * location. `Marker3DElement` carries the label natively, so this no longer
 * needs the point + background-label pair the Cesium version did.
 */
export function setYouAreHereMarker(
  maps3d: Maps3D,
  map: Map3D,
  longitude: number,
  latitude: number,
  label: string,
): google.maps.maps3d.Marker3DElement {
  const marker = new maps3d.Marker3DElement({
    position: { lat: latitude, lng: longitude, altitude: 0 },
    label,
    altitudeMode: 'CLAMP_TO_GROUND',
    extruded: true,
  });
  map.appendChild(marker);
  return marker;
}

/**
 * Locates the visitor via the Geolocation API and drops the "you are here"
 * marker there, falling back to the Kamogawa default when denied/unavailable
 * (§5.3). Never throws. Geolocation resolves asynchronously and well after
 * this call returns, so both callbacks check `isMounted()` first — the map
 * element may already be torn down by then (React StrictMode's dev-mode
 * double mount/cleanup, or a real unmount before the browser responds).
 */
export function locateAndMarkVisitor(
  maps3d: Maps3D,
  map: Map3D,
  label: string,
  isMounted: () => boolean,
): void {
  const fallback = () => {
    if (!isMounted()) return;
    setYouAreHereMarker(maps3d, map, KAMOGAWA_DELTA.longitude, KAMOGAWA_DELTA.latitude, label);
  };

  if (!('geolocation' in navigator)) {
    fallback();
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (position) => {
      if (!isMounted()) return;
      setYouAreHereMarker(maps3d, map, position.coords.longitude, position.coords.latitude, label);
    },
    fallback,
    { timeout: 8000, maximumAge: 60_000 },
  );
}

// =========================================================================
// §5.3/§4.4 markers -- exclamation (activity places) and duck (duck spots)
// =========================================================================

const MARKER_PIXEL_SIZE = 30;

export interface MarkerPoint {
  id: string;
  lat: number;
  lng: number;
  /** Optional per-marker icon (used by the colored duck markers). */
  iconUrl?: string;
}

export type MarkerKind = 'activity' | 'duckSpot';

export interface MarkerLayers {
  setActivities(points: MarkerPoint[]): void;
  setDuckSpots(points: MarkerPoint[]): void;
  dispose(): void;
}

/**
 * Custom marker art: an `<img>` wrapped in a `<template>` and appended to the
 * marker's default slot. Google rasterizes it into the 3D scene, so the
 * existing `exclamation.svg` and the per-duck `duckIconDataUri()` data URIs
 * both carry over unchanged.
 */
function markerWithIcon(
  maps3d: Maps3D,
  point: MarkerPoint,
  kind: MarkerKind,
  defaultIconUrl: string,
  onTap: (kind: MarkerKind, refId: string) => void,
): google.maps.maps3d.Marker3DInteractiveElement {
  const marker = new maps3d.Marker3DInteractiveElement({
    position: { lat: point.lat, lng: point.lng, altitude: 0 },
    altitudeMode: 'CLAMP_TO_GROUND',
    collisionBehavior: 'REQUIRED',
  });

  const img = document.createElement('img');
  img.src = point.iconUrl ?? defaultIconUrl;
  img.width = MARKER_PIXEL_SIZE;
  img.height = MARKER_PIXEL_SIZE;
  const template = document.createElement('template');
  template.content.append(img);
  marker.append(template);

  marker.addEventListener('gmp-click', () => onTap(kind, point.id));
  return marker;
}

/**
 * Creates the two marker layers: exclamation markers for the fixed activity
 * PLACES (one marker per place, so the map stays uncluttered no matter how
 * many mains a place accrues during a gathering) and colored duck markers for
 * the duck spots (each carries its own recolored icon via
 * `MarkerPoint.iconUrl`). Each marker is individually tappable — tapping runs
 * `onTap(kind, refId)` so the caller can route to that place's own content.
 */
export function createMarkerLayers(
  maps3d: Maps3D,
  map: Map3D,
  onTap: (kind: MarkerKind, refId: string) => void,
): MarkerLayers {
  let activityMarkers: google.maps.maps3d.Marker3DInteractiveElement[] = [];
  let duckMarkers: google.maps.maps3d.Marker3DInteractiveElement[] = [];

  const replace = (
    existing: google.maps.maps3d.Marker3DInteractiveElement[],
    points: MarkerPoint[],
    kind: MarkerKind,
    defaultIconUrl: string,
  ) => {
    existing.forEach((m) => m.remove());
    const next = points.map((p) => markerWithIcon(maps3d, p, kind, defaultIconUrl, onTap));
    next.forEach((m) => map.appendChild(m));
    return next;
  };

  return {
    setActivities: (points) => {
      activityMarkers = replace(activityMarkers, points, 'activity', exclamationIconUrl);
    },
    setDuckSpots: (points) => {
      duckMarkers = replace(duckMarkers, points, 'duckSpot', duckIconUrl);
    },
    dispose: () => {
      activityMarkers.forEach((m) => m.remove());
      duckMarkers.forEach((m) => m.remove());
      activityMarkers = [];
      duckMarkers = [];
    },
  };
}

// =========================================================================
// Marker-tap cinematic: framing highlight -> close fly-in -> slow orbit.
// The corridor clamp is lifted by the caller for the duration (see MainMap),
// since the close-up/orbit view is tighter than the clamp expects and the
// target is inside the corridor anyway.
// =========================================================================

const METERS_PER_DEGREE_LAT = 111_320;

/** A square outline centered on the spot, `halfSizeMeters` to a side, as
 * lat/lng. Longitude degrees shrink with latitude, hence the cos() term. */
function squareOutline(
  lat: number,
  lng: number,
  halfSizeMeters: number,
): google.maps.LatLngAltitudeLiteral[] {
  const dLat = halfSizeMeters / METERS_PER_DEGREE_LAT;
  const dLng = halfSizeMeters / (METERS_PER_DEGREE_LAT * Math.cos((lat * Math.PI) / 180));
  const corners: [number, number][] = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
    [-1, -1],
  ];
  return corners.map(([ex, ey]) => ({
    lat: lat + ey * dLat,
    lng: lng + ex * dLng,
    altitude: 0,
  }));
}

/**
 * A pulsing square outline at the spot -- a camera-viewfinder-style framing
 * highlight, ground-clamped. Calm sine pulse (§4.3: nothing bouncy). Returns
 * a remover.
 */
export function addPlaceFraming(maps3d: Maps3D, map: Map3D, lat: number, lng: number): () => void {
  const polyline = new maps3d.Polyline3DElement({
    path: squareOutline(lat, lng, 22),
    strokeColor: kamoColor('--kamo-sunset'),
    strokeWidth: 3,
    altitudeMode: 'CLAMP_TO_GROUND',
    drawsOccludedSegments: true,
  });
  map.appendChild(polyline);

  const startTime = performance.now();
  let rafId = 0;
  const tick = () => {
    const elapsedSeconds = (performance.now() - startTime) / 1000;
    const pulse = 1 + 0.15 * Math.sin(elapsedSeconds * 3);
    polyline.path = squareOutline(lat, lng, 22 * pulse);
    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);

  return () => {
    cancelAnimationFrame(rafId);
    polyline.remove();
  };
}
