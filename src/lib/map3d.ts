import { importLibrary, setOptions } from '@googlemaps/js-api-loader';
import { KAMOGAWA_DELTA } from './geo';
import { MARKER_PIXEL_SIZE, type ProximityLevel } from './ducks';

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
  south: 34.953, //  34°57'10.8"N
  north: 35.062, //  35°03'43.4"N
  west: 135.7401, // 135°44'24.5"E
  east: 135.8106, // 135°48'38.0"E
};

export const MIN_ALTITUDE_M = 300; // keep the camera from clipping into the ground

/**
 * How far out you can zoom — and, in practice, how much of Japan you can see
 * past the corridor.
 *
 * `bounds` only constrains where the camera's *centre* may sit; at altitude
 * with a tilted camera you still see far beyond it. At the old 20 km this
 * meant a lot of northern Kyoto and the mountains were visible even though
 * you couldn't fly there. 8 km keeps the whole Delta-to-Gojo stretch in frame
 * while cutting that surrounding context — and loads fewer tiles doing it.
 */
export const MAX_ALTITUDE_M = 8_000;

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

declare global {
  interface Window {
    /** Google calls this on auth failures. Not in @types/google.maps. */
    gm_authFailure?: () => void;
  }
}

const authFailureHandlers = new Set<() => void>();

/**
 * Fires when Google rejects the map: `OverQuotaMapError`,
 * `RefererNotAllowedMapError`, `BillingNotEnabledMapError` and friends.
 *
 * This exists because those failures are **not catchable** where you'd expect.
 * `importLibrary()` resolves fine — the library loaded, it's the *map* that was
 * refused — so `loadMaps3d().catch()` never sees them. Google's only signal is
 * the `window.gm_authFailure` global, and without hooking it the app shows
 * Google's grey "Oops!" panel instead of its own error state with a retry.
 *
 * Returns an unsubscriber.
 */
export function onMapsAuthFailure(handler: () => void): () => void {
  authFailureHandlers.add(handler);
  return () => authFailureHandlers.delete(handler);
}

/**
 * Assignments to a map Google refused are unsafe: its internals were never
 * initialised, so setting `bounds` or `center` throws from inside the Maps
 * bundle. That surfaced as `TypeError: can't access property "hi", a.lat is
 * undefined` in the `bounds` setter, on top of the real error.
 *
 * Swallowing is deliberate here. The map is already broken and the auth-failure
 * hook above has told the UI; a second, unhandled exception from camera setup
 * adds nothing and takes the rest of the screen down with it.
 */
function safely(apply: () => void): void {
  try {
    apply();
  } catch {
    /* map never initialised -- see onMapsAuthFailure for what the user sees */
  }
}

/**
 * Loads the `maps3d` library. The Maps JS API is fetched from Google's CDN on
 * first call and cached by the loader, so repeat calls are cheap.
 *
 * Pinned to `weekly`, the stable channel. This briefly ran on `alpha` to get
 * `MapMode.ROADMAP` — the flat cartoonish basemap the style switch offered as
 * "Map" — which is documented as Experimental (pre-GA) and exists on no other
 * channel. That put a live public site on a channel Google explicitly says is
 * for development and may change without notice, which isn't a trade worth
 * making for one extra view.
 *
 * ROADMAP is therefore unavailable, and `MapStyle` no longer offers it. If it
 * ever reaches GA, switching back is this line plus restoring the mode.
 */
export function loadMaps3d(): Promise<Maps3D> {
  if (!optionsSet) {
    // Installed before the API script loads, which is the only time Google
    // reliably picks it up.
    window.gm_authFailure = () => authFailureHandlers.forEach((handler) => handler());
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
/** The resting view over the Delta, shared with the flat map so both surfaces
 * agree on where "home" is. */
export const HOME_LOOK = {
  lat: KAMOGAWA_DELTA.latitude,
  lng: KAMOGAWA_DELTA.longitude,
  range: 4500,
};

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

/** The camera the map is constructed with, so it renders already at the right
 * place instead of jumping there on the first frame. */
export function initialCamera(playIntro: boolean): Partial<google.maps.maps3d.Map3DElementOptions> {
  const view = playIntro ? FAR_SIDE_VIEW : HERO_VIEW;
  return { center: view.center, range: view.range, tilt: view.tilt, heading: view.heading };
}

const PLACE_VIEW_RANGE_M = 350;
const PLACE_VIEW_TILT = 52; // was Cesium pitch -38°

/** Instantly places the camera at the resting home view (no animation). */
export function setHomeView(map: Map3D): void {
  safely(() => {
    map.center = HERO_VIEW.center;
    map.range = HERO_VIEW.range;
    map.tilt = HERO_VIEW.tilt;
    map.heading = HERO_VIEW.heading;
  });
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

/** How long the whole Earth-to-Kamogawa flight takes. It's one continuous
 * move, so this is the only timing knob — raise it for a slower, statelier
 * sweep, lower it to get to the map faster. */
/** Exported so the main screen can bring its controls up as the flight lands,
 * rather than waiting on `gmp-animationend`, which fires after the camera has
 * already visibly stopped. */
export const INTRO_FLIGHT_MS = 7000;

/**
 * §5.1 intro flight: the far side of Earth straight down to the Kamogawa
 * Delta, as ONE `flyCameraTo`.
 *
 * This used to be three chained legs (Earth -> Japan -> Kyoto -> Delta), which
 * read as jerky: `flyCameraTo` eases out to a complete stop at the end of each
 * leg, so the viewer got accelerate/halt/accelerate/halt, plus a frame or two
 * of dead air per leg while the `gmp-animationend` round-trip resolved. Google
 * moves the camera *parabolically*, which already arcs up and over the globe on
 * its own, so a single long flight gives the sweep the three legs were trying
 * to fake — and it never stops halfway.
 *
 * The map is constructed already at FAR_SIDE_VIEW (see `initialCamera`), so
 * there's no jump before the flight starts. Pass a `signal` and flip
 * `signal.cancelled = true` (alongside `map.stopCameraAnimation()`) to stop
 * early, e.g. for the intro's Skip button.
 */
export async function flyIntroSequence(map: Map3D, signal: { cancelled: boolean }): Promise<void> {
  if (signal.cancelled) return;
  await flyToStep(map, HERO_VIEW, INTRO_FLIGHT_MS, signal);
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

/** How far the camera swings around a tapped place — a hint of parallax to
 * show how the spot sits in its surroundings, not a tour of it. */
const PLACE_SWEEP_DEGREES = 45;

/**
 * Swings the camera partway around the spot so the visitor sees where it sits
 * relative to its surroundings, then stops.
 *
 * Deliberately NOT `flyCameraAround`: its `repeatCount` counts *whole*
 * revolutions, so the smallest thing it can do is a full 360° spin — which is
 * both longer than this wants and disorienting on a phone. Nudging `heading`
 * with `flyCameraTo` gives an arbitrary arc and, because Google eases that
 * move in and out, a noticeably smoother start than a constant-rate orbit.
 *
 * Returns a promise (resolves when the sweep ends or is cancelled) and a
 * cancel function.
 */
export function orbitPlace(
  map: Map3D,
  lat: number,
  lng: number,
  durationMillis = 1300,
): { promise: Promise<void>; cancel: () => void } {
  const signal = { cancelled: false };

  map.flyCameraTo({
    endCamera: {
      center: { lat, lng, altitude: 0 },
      range: PLACE_VIEW_RANGE_M,
      tilt: PLACE_VIEW_TILT,
      heading: (map.heading ?? 0) + PLACE_SWEEP_DEGREES,
    },
    durationMillis,
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
  safely(() => {
    map.bounds = KAMOGAWA_BOUNDS;
    map.minAltitude = MIN_ALTITUDE_M;
    map.maxAltitude = MAX_ALTITUDE_M;
    map.maxTilt = MAX_TILT_DEGREES;
  });

  return () =>
    safely(() => {
      map.bounds = null;
      map.minAltitude = null;
      map.maxAltitude = null;
      map.maxTilt = null;
    });
}

// =========================================================================
// §5.3 map style — the two-mode switch
// =========================================================================

/**
 * Which of the two map surfaces is showing. `'3d'` is `Map3DElement`'s
 * photorealistic imagery; `'2d'` is the classic flat Google map (see
 * `lib/map2d.ts` for why that's a separate API rather than `MapMode.ROADMAP`).
 */
export type MapStyle = '3d' | '2d';

/**
 * §5.3 labels over the 3D imagery. `SATELLITE` is natively label-free and
 * `HYBRID` adds road and place names, so this needs no Cloud-styled Map ID —
 * the 2D map handles its own labels with inline styles.
 */
export function applyMapView(map: Map3D, showLabels: boolean): void {
  map.mapId = null;
  map.mode = showLabels ? 'HYBRID' : 'SATELLITE';
}

/** Reads a color straight from the §4.1 CSS tokens, so map graphics never
 * hardcode a hex value that could drift from tokens.css. */
export function kamoColor(cssVariable: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(cssVariable).trim();
}

// =========================================================================
// §5.3 the visitor's own location — a Google-Maps-style dot with a heading cone
// =========================================================================

// Sized against the ducks rather than in isolation: the dot's core is ~40% of
// its box, so this lands it in the same visual weight class as a duck. It was
// previously small enough to lose among them.
const USER_MARKER_SIZE = 72;

/** Redraw thresholds. `Marker3DElement` rasterizes its art on append and has no
 * rotation property, so "turning" the cone means rebuilding the marker — cheap,
 * but not something to do on every sensor tick. A few degrees of compass jitter
 * is normal even standing still. */
const HEADING_STEP_DEGREES = 6;
const POSITION_STEP_METERS = 2;

/**
 * The location dot: a white-ringed disc with a translucent wedge showing which
 * way the device is facing, the way Google Maps draws it. `heading` is degrees
 * clockwise from north, or null when the device can't report one — in which
 * case the wedge is omitted rather than left pointing at an arbitrary bearing.
 *
 * Uses --kamo-river rather than Google's #4285F4: CLAUDE.md's design rules
 * allow only the kamo tokens and explicitly bar saturated "tech" colors.
 */
export function userLocationIcon(heading: number | null): string {
  const blue = kamoColor('--kamo-river') || '#6E8CA0';
  const ring = kamoColor('--kamo-stone') || '#E9E4D8';
  const cone =
    heading === null
      ? ''
      : `<g transform="rotate(${heading.toFixed(0)} 32 32)">` +
        `<path d="M32 32 L19.3 4.8 A30 30 0 0 1 44.7 4.8 Z" fill="${blue}" opacity="0.3"/>` +
        `</g>`;
  // Concentric rings around the dot -- the ripple look, drawn at rest.
  //
  // It does NOT pulse, and can't: Marker3DElement rasterizes its art to a
  // bitmap on append, so there's no live DOM to animate and SMIL inside the SVG
  // never runs. A real pulse would mean destroying and rebuilding the marker
  // every frame, which is a lot of churn for decoration. Three rings at falling
  // opacity read as the same idea held still.
  // Rings sit further out and the core is bigger than the first attempt, where
  // the rings ate the budget and left a dot smaller than a duck marker.
  const ripples = [
    { r: 17, a: 0.4 },
    { r: 23, a: 0.2 },
    { r: 29, a: 0.09 },
  ]
    .map(
      (w) =>
        `<circle cx="32" cy="32" r="${w.r}" fill="none" stroke="${blue}" stroke-width="2" opacity="${w.a}"/>`,
    )
    .join('');
  const svg =
    `<svg viewBox="0 0 64 64" width="${USER_MARKER_SIZE}" height="${USER_MARKER_SIZE}" xmlns="http://www.w3.org/2000/svg">` +
    cone +
    ripples +
    `<circle cx="32" cy="32" r="13" fill="${ring}"/>` +
    `<circle cx="32" cy="32" r="9.5" fill="${blue}"/>` +
    `</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/** Rough metres between two nearby points — good enough to decide whether the
 * dot moved enough to be worth redrawing. */
function roughMeters(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const dy = (aLat - bLat) * 111_320;
  const dx = (aLng - bLng) * 111_320 * Math.cos((aLat * Math.PI) / 180);
  return Math.hypot(dx, dy);
}

function headingFromEvent(event: DeviceOrientationEvent): number | null {
  // iOS reports a true compass heading directly; everyone else gives `alpha`,
  // which counts anticlockwise from north and is only meaningful when the
  // reading is absolute (otherwise it's relative to wherever the page started).
  const webkit = (event as DeviceOrientationEvent & { webkitCompassHeading?: number })
    .webkitCompassHeading;
  if (typeof webkit === 'number' && !Number.isNaN(webkit)) return webkit;
  if (event.absolute && typeof event.alpha === 'number') return (360 - event.alpha) % 360;
  return null;
}

/**
 * Whether a fix is somewhere this app can show. The camera is clamped to the
 * Kamogawa corridor, so a dot outside it is off-screen and no duck is
 * meaningfully "nearest" — which is exactly what a visitor testing from another
 * city sees.
 */
export function isWithinCorridor(lat: number, lng: number): boolean {
  return (
    lat >= KAMOGAWA_BOUNDS.south &&
    lat <= KAMOGAWA_BOUNDS.north &&
    lng >= KAMOGAWA_BOUNDS.west &&
    lng <= KAMOGAWA_BOUNDS.east
  );
}

export interface UserLocationOptions {
  /** Called whenever the fix moves, so the caller can react to where the
   * visitor is -- lighting up the duck they're closest to. */
  onPositionChange?: (lat: number, lng: number) => void;
  /** Pin the dot here and ignore the device's real fix. Used by test mode so
   * the proximity effect is demonstrable away from the river. */
  fixedPosition?: { lat: number; lng: number };
}

export interface UserLocationMarker {
  /** iOS 13+ gates compass access behind a permission prompt that only works
   * from a user gesture, so the caller has to invoke this from one. A no-op
   * everywhere else. */
  requestHeadingPermission(): Promise<void>;
  dispose(): void;
}

/**
 * Tracks the visitor and draws their location on the map, following them as
 * they move and swinging the cone as they turn. Falls back to the Kamogawa
 * Delta when geolocation is denied or unavailable, so there's always a dot.
 *
 * Never throws. Every callback fires asynchronously and long after this
 * returns, so each one re-checks that it hasn't been disposed — the map element
 * may already be gone (React StrictMode's dev double mount/cleanup, or a real
 * unmount before the browser answers).
 */
export function createUserLocationMarker(
  maps3d: Maps3D,
  map: Map3D,
  options: UserLocationOptions = {},
): UserLocationMarker {
  let disposed = false;
  let marker: google.maps.maps3d.Marker3DElement | null = null;
  let lat = options.fixedPosition?.lat ?? KAMOGAWA_DELTA.latitude;
  let lng = options.fixedPosition?.lng ?? KAMOGAWA_DELTA.longitude;
  let heading: number | null = null;
  let drawnHeading: number | null = null;
  let drawnLat: number | null = null;
  let drawnLng: number | null = null;

  function draw() {
    if (disposed) return;
    marker?.remove();
    const next = new maps3d.Marker3DElement({
      position: { lat, lng, altitude: 0 },
      altitudeMode: 'CLAMP_TO_GROUND',
      sizePreserved: true,
    });
    const img = document.createElement('img');
    img.src = userLocationIcon(heading);
    const template = document.createElement('template');
    template.content.append(img);
    next.append(template);
    map.appendChild(next);
    marker = next;
    drawnHeading = heading;
    drawnLat = lat;
    drawnLng = lng;
  }

  function maybeRedraw() {
    if (disposed) return;
    const movedFar =
      drawnLat === null || drawnLng === null || roughMeters(lat, lng, drawnLat, drawnLng) >= POSITION_STEP_METERS;
    const turnedFar =
      heading !== null &&
      (drawnHeading === null || Math.abs(((heading - drawnHeading + 540) % 360) - 180) >= HEADING_STEP_DEGREES);
    if (movedFar || turnedFar) draw();
  }

  draw(); // show the fallback dot immediately; sensors refine it below

  options.onPositionChange?.(lat, lng);

  let watchId: number | null = null;
  // A pinned position outranks the device: test mode is explicitly "pretend I'm
  // at the river", so a real fix would defeat it.
  if (!options.fixedPosition && 'geolocation' in navigator) {
    watchId = navigator.geolocation.watchPosition(
      (position) => {
        if (disposed) return;
        // A fix outside the corridor is discarded rather than shown: the camera
        // can't reach it, so the dot would sit off-screen and the app would
        // look broken. The fallback keeps it somewhere the map can display.
        if (!isWithinCorridor(position.coords.latitude, position.coords.longitude)) return;
        lat = position.coords.latitude;
        lng = position.coords.longitude;
        maybeRedraw();
        options.onPositionChange?.(lat, lng);
      },
      () => {
        /* keep the Kamogawa fallback */
      },
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 15_000 },
    );
  }

  const onOrientation = (event: DeviceOrientationEvent) => {
    if (disposed) return;
    const next = headingFromEvent(event);
    if (next === null) return;
    heading = next;
    maybeRedraw();
  };

  function listen() {
    window.addEventListener('deviceorientationabsolute', onOrientation as EventListener);
    window.addEventListener('deviceorientation', onOrientation as EventListener);
  }

  type OrientationPermission = { requestPermission?: () => Promise<PermissionState> };
  const orientationApi = window.DeviceOrientationEvent as unknown as OrientationPermission | undefined;
  if (orientationApi && typeof orientationApi.requestPermission !== 'function') listen();

  return {
    requestHeadingPermission: async () => {
      if (disposed || !orientationApi || typeof orientationApi.requestPermission !== 'function') return;
      try {
        if ((await orientationApi.requestPermission()) === 'granted') listen();
      } catch {
        /* denied or not called from a gesture -- the dot just has no cone */
      }
    },
    dispose: () => {
      disposed = true;
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      window.removeEventListener('deviceorientationabsolute', onOrientation as EventListener);
      window.removeEventListener('deviceorientation', onOrientation as EventListener);
      marker?.remove();
      marker = null;
    },
  };
}

// =========================================================================
// §5.3/§4.4 markers -- exclamation (activity places) and duck (duck spots)
// =========================================================================



export interface MarkerPoint {
  id: string;
  lat: number;
  lng: number;
  /** This place's duck, recolored — every marker carries its own. */
  iconUrl: string;
  /** Redraws this duck lit to `level`. Kept as a callback rather than a
   * pre-rendered set so the layer doesn't need to know how ducks are drawn. */
  litIcon?: (level: ProximityLevel) => string;
}

export interface MarkerLayer {
  setMarkers(points: MarkerPoint[]): void;
  /** Light one marker by how close the visitor is. Only the markers whose level
   * actually changed are rebuilt, never the whole set. */
  setProximity(placeId: string | null, level: ProximityLevel): void;
  dispose(): void;
}

/**
 * Custom marker art: an `<img>` wrapped in a `<template>` and appended to the
 * marker's default slot. Google rasterizes it into the 3D scene, so the
 * per-duck `duckMarkerDataUri()` data URIs carry over unchanged.
 */
function markerWithIcon(
  maps3d: Maps3D,
  point: MarkerPoint,
  level: ProximityLevel,
  onTap: (refId: string) => void,
): google.maps.maps3d.Marker3DInteractiveElement {
  const marker = new maps3d.Marker3DInteractiveElement({
    position: { lat: point.lat, lng: point.lng, altitude: 0 },
    altitudeMode: 'CLAMP_TO_GROUND',
    collisionBehavior: 'REQUIRED',
    // Without this the marker is sized in WORLD space, so it grows as the
    // camera closes in -- during the place cinematic (350 m) the icons ended
    // up swallowing the screen. Keeps them a constant on-screen size instead.
    sizePreserved: true,
  });

  const img = document.createElement('img');
  img.src = level > 0 && point.litIcon ? point.litIcon(level) : point.iconUrl;
  // Both marks are `viewBox="0 0 64 64"` with no intrinsic width/height, so a
  // rasterizer is free to pick its own size. Pin it in CSS as well as in the
  // attributes, or the SVG comes out far larger than MARKER_PIXEL_SIZE.
  img.width = MARKER_PIXEL_SIZE;
  img.height = MARKER_PIXEL_SIZE;
  img.style.width = `${MARKER_PIXEL_SIZE}px`;
  img.style.height = `${MARKER_PIXEL_SIZE}px`;
  img.style.display = 'block';
  const template = document.createElement('template');
  template.content.append(img);
  marker.append(template);

  marker.addEventListener('gmp-click', () => onTap(point.id));
  return marker;
}

/**
 * The map's single marker layer: one duck per place.
 *
 * There used to be two overlapping layers — exclamation markers for activity
 * places and duck markers for stamp spots. Once a place became a duck spot
 * those sat at identical coordinates, so a tap hit whichever happened to be on
 * top and the app would sometimes open the board and sometimes the duck page.
 * One layer, one destination.
 */
export function createMarkerLayer(
  maps3d: Maps3D,
  map: Map3D,
  onTap: (placeId: string) => void,
): MarkerLayer {
  let markers = new Map<string, google.maps.maps3d.Marker3DInteractiveElement>();
  let points: MarkerPoint[] = [];
  let litId: string | null = null;
  let litLevel: ProximityLevel = 0;

  function build(point: MarkerPoint) {
    const level = point.id === litId ? litLevel : 0;
    const marker = markerWithIcon(maps3d, point, level, onTap);
    map.appendChild(marker);
    markers.set(point.id, marker);
  }

  function rebuild(id: string) {
    const point = points.find((p) => p.id === id);
    if (!point) return;
    markers.get(id)?.remove();
    build(point);
  }

  return {
    setMarkers: (next) => {
      markers.forEach((m) => m.remove());
      markers = new Map();
      points = next;
      points.forEach(build);
    },
    setProximity: (placeId, level) => {
      if (placeId === litId && level === litLevel) return;
      const affected = new Set([litId, placeId].filter((id): id is string => id !== null));
      litId = placeId;
      litLevel = level;
      // Only the markers whose state changed; a fresh fix shouldn't rebuild all
      // eight every few seconds.
      affected.forEach(rebuild);
    },
    dispose: () => {
      markers.forEach((m) => m.remove());
      markers = new Map();
      points = [];
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
