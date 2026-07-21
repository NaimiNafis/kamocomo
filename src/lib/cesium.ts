import * as Cesium from 'cesium';
import exclamationIconUrl from '../../img/marks/exclamation.svg?url';
import duckIconUrl from '../../img/marks/duck.svg?url';
import { KAMOGAWA_DELTA } from './geo';

/**
 * §8.1 — Cesium cost control. The camera is locked to a bounding rectangle
 * around Kyoto/the Kamogawa and to a min/max zoom distance so a user can
 * never pan away or zoom out far enough to trigger photoreal tile loads
 * outside the area we actually care about.
 * Never remove these limits (CLAUDE.md architecture rule #4).
 */

// Kyoto city, wide enough to cover the full length of the Kamogawa within it.
export const KYOTO_BOUNDS = Cesium.Rectangle.fromDegrees(135.65, 34.9, 135.85, 35.15);

export const MIN_ZOOM_DISTANCE_M = 300; // keep the camera from clipping into the ground
export const MAX_ZOOM_DISTANCE_M = 20_000; // keep it from zooming out to a globe/space view

// A shallow pitch (near horizontal) reveals ground far past the horizon even
// at a modest height, pulling in tiles well outside Kyoto. Cap how flat the
// camera is allowed to tilt so the visible footprint stays roughly local.
const MAX_PITCH_RADIANS = Cesium.Math.toRadians(-35);

export function getCesiumIonToken(): string | undefined {
  return import.meta.env.VITE_CESIUM_ION_TOKEN;
}

/** Call once before creating any Viewer. */
export function configureCesiumIon(): void {
  const token = getCesiumIonToken();
  if (token) {
    Cesium.Ion.defaultAccessToken = token;
  }
}

/** Chrome-free Viewer widget options (Phase 1: "default Cesium UI chrome hidden"). */
export const VIEWER_OPTIONS: Cesium.Viewer.ConstructorOptions = {
  animation: false,
  timeline: false,
  baseLayerPicker: false,
  fullscreenButton: false,
  vrButton: false,
  geocoder: false,
  homeButton: false,
  infoBox: false,
  sceneModePicker: false,
  selectionIndicator: false,
  navigationHelpButton: false,
  navigationInstructionsInitiallyVisible: false,
};

function clampCameraToKyotoBounds(viewer: Cesium.Viewer): void {
  const { camera } = viewer;
  const cartographic = Cesium.Cartographic.fromCartesian(camera.position);
  let { longitude, latitude } = cartographic;
  let changed = false;

  if (longitude < KYOTO_BOUNDS.west) {
    longitude = KYOTO_BOUNDS.west;
    changed = true;
  } else if (longitude > KYOTO_BOUNDS.east) {
    longitude = KYOTO_BOUNDS.east;
    changed = true;
  }

  if (latitude < KYOTO_BOUNDS.south) {
    latitude = KYOTO_BOUNDS.south;
    changed = true;
  } else if (latitude > KYOTO_BOUNDS.north) {
    latitude = KYOTO_BOUNDS.north;
    changed = true;
  }

  let pitch = camera.pitch;
  if (pitch > MAX_PITCH_RADIANS) {
    pitch = MAX_PITCH_RADIANS;
    changed = true;
  }

  if (!changed) return;

  camera.setView({
    destination: Cesium.Cartesian3.fromRadians(longitude, latitude, cartographic.height),
    orientation: {
      heading: camera.heading,
      pitch,
      roll: camera.roll,
    },
  });
}

/**
 * §8.1 mobile performance: render at CSS resolution (not 2-3x retina) and
 * cap the resolution scale, which cuts GPU load a lot on phones -- and, since
 * fewer/coarser tiles load, also trims the photoreal tile billing the §8.1
 * cost control cares about.
 */
export function applyMobilePerfSettings(viewer: Cesium.Viewer): void {
  viewer.useBrowserRecommendedResolution = true;
  viewer.resolutionScale = 1.0;
}

/**
 * Applies the Kyoto bounding-box + zoom-distance constraints to a Viewer.
 * Returns a cleanup function to remove the listener on unmount.
 */
export function applyKyotoCameraConstraints(viewer: Cesium.Viewer): () => void {
  const controller = viewer.scene.screenSpaceCameraController;
  controller.minimumZoomDistance = MIN_ZOOM_DISTANCE_M;
  controller.maximumZoomDistance = MAX_ZOOM_DISTANCE_M;

  // Lock "up" to true north instead of letting free-look roll the horizon.
  viewer.camera.constrainedAxis = Cesium.Cartesian3.UNIT_Z;

  const onPostRender = () => clampCameraToKyotoBounds(viewer);
  viewer.scene.postRender.addEventListener(onPostRender);

  return () => viewer.scene.postRender.removeEventListener(onPostRender);
}

interface CameraView {
  destination: Cesium.Cartesian3;
  orientation: {
    heading: number;
    pitch: number;
    roll: number;
  };
}

/** The resting/home view: arrived at the Kamogawa Delta (§5.1's flight destination). */
const HERO_VIEW: CameraView = {
  destination: Cesium.Cartesian3.fromDegrees(
    KAMOGAWA_DELTA.longitude,
    KAMOGAWA_DELTA.latitude - 0.02,
    4500,
  ),
  orientation: { heading: 0, pitch: Cesium.Math.toRadians(-50), roll: 0 },
};

/** Whole-Earth view — the intro's starting point, on the hemisphere OPPOSITE
 * Japan (mid-Atlantic/South America side), so the flight visibly sweeps
 * across the globe to reveal Japan rather than starting already facing it. */
const FAR_SIDE_VIEW: CameraView = {
  destination: Cesium.Cartesian3.fromDegrees(-42, 10, 20_000_000),
  orientation: { heading: 0, pitch: Cesium.Math.toRadians(-90), roll: 0 },
};

/** Japan-scale overview — first stop of the intro flight. */
const JAPAN_VIEW: CameraView = {
  destination: Cesium.Cartesian3.fromDegrees(137.5, 36.5, 1_600_000),
  orientation: { heading: 0, pitch: Cesium.Math.toRadians(-90), roll: 0 },
};

/** Kyoto-scale overview — second stop of the intro flight. */
const KYOTO_OVERVIEW_VIEW: CameraView = {
  destination: Cesium.Cartesian3.fromDegrees(
    KAMOGAWA_DELTA.longitude,
    KAMOGAWA_DELTA.latitude,
    80_000,
  ),
  orientation: { heading: 0, pitch: Cesium.Math.toRadians(-90), roll: 0 },
};

/** Instantly places the camera at the resting home view (no animation). */
export function setHomeView(viewer: Cesium.Viewer): void {
  viewer.camera.setView(HERO_VIEW);
}

function flyToStep(viewer: Cesium.Viewer, view: CameraView, duration: number): Promise<void> {
  return new Promise((resolve) => {
    viewer.camera.flyTo({
      ...view,
      duration,
      easingFunction: Cesium.EasingFunction.QUADRATIC_IN_OUT,
      complete: () => resolve(),
      cancel: () => resolve(),
    });
  });
}

/**
 * Flies back to the resting home view (e.g. after closing a marker-tap
 * cinematic) so the visitor can see and tap other markers again, instead of
 * being left zoomed into wherever the cinematic ended.
 */
export function flyToHomeView(viewer: Cesium.Viewer, durationSeconds = 1.2): Promise<void> {
  return flyToStep(viewer, HERO_VIEW, durationSeconds);
}

/**
 * §5.1 intro flight: the far side of Earth -> Japan -> Kyoto -> Kamogawa
 * Delta, ~5s total. Starts from FAR_SIDE_VIEW instantly (the reveal happens
 * in the overlay, not here) so the first leg visibly sweeps across the whole
 * globe to bring Japan into view -- more dramatic than starting already
 * facing it. Pass a `signal` and flip `signal.cancelled = true` (alongside
 * `viewer.camera.cancelFlight()`) to stop the sequence early, e.g. for the
 * intro's Skip button.
 */
export async function flyIntroSequence(
  viewer: Cesium.Viewer,
  signal: { cancelled: boolean },
): Promise<void> {
  viewer.camera.setView(FAR_SIDE_VIEW);
  if (signal.cancelled) return;
  await flyToStep(viewer, JAPAN_VIEW, 2.2);
  if (signal.cancelled) return;
  await flyToStep(viewer, KYOTO_OVERVIEW_VIEW, 1.3);
  if (signal.cancelled) return;
  await flyToStep(viewer, HERO_VIEW, 1.5);
}

// =========================================================================
// §5.3 main map overlay chrome
// =========================================================================

export type MapStyle = 'photoreal' | 'flat';

/** Swaps the base imagery layer between Cesium ion's photoreal aerial imagery
 * and a plain OpenStreetMap layer (§5.3: "photoreal <-> flat imagery for now"). */
export function setMapStyle(viewer: Cesium.Viewer, style: MapStyle): void {
  viewer.imageryLayers.removeAll();
  const layer =
    style === 'photoreal'
      ? Cesium.ImageryLayer.fromWorldImagery({})
      : new Cesium.ImageryLayer(new Cesium.OpenStreetMapImageryProvider({}));
  viewer.imageryLayers.add(layer);
}

/** Reads a color straight from the §4.1 CSS tokens, so Cesium graphics never
 * hardcode a hex value that could drift from tokens.css. */
function kamoColor(cssVariable: string): Cesium.Color {
  const hex = getComputedStyle(document.documentElement).getPropertyValue(cssVariable).trim();
  return Cesium.Color.fromCssColorString(hex);
}

/**
 * Adds the "you are here" marker (§5.3) -- a plain Cesium point, not an
 * image, so it needs no asset and can't run afoul of the "no stock imagery"
 * rule. Called once per Viewer lifetime (on mount), so it never needs to
 * find/update a previous marker.
 */
export function setYouAreHereMarker(
  viewer: Cesium.Viewer,
  longitude: number,
  latitude: number,
): Cesium.Entity {
  return viewer.entities.add({
    position: Cesium.Cartesian3.fromDegrees(longitude, latitude),
    point: {
      pixelSize: 14,
      color: kamoColor('--kamo-sunset'),
      outlineColor: kamoColor('--kamo-stone'),
      outlineWidth: 3,
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  });
}

/**
 * Locates the visitor via the Geolocation API and drops the "you are here"
 * marker there, falling back to the Kamogawa default when denied/unavailable
 * (§5.3). Never throws. Geolocation resolves asynchronously and well after
 * this call returns, so both callbacks guard against the Viewer already
 * having been destroyed by then (e.g. React StrictMode's dev-mode double
 * mount/cleanup, or a real unmount before the browser responds).
 */
export function locateAndMarkVisitor(viewer: Cesium.Viewer): void {
  const fallback = () => {
    if (viewer.isDestroyed()) return;
    setYouAreHereMarker(viewer, KAMOGAWA_DELTA.longitude, KAMOGAWA_DELTA.latitude);
  };

  if (!('geolocation' in navigator)) {
    fallback();
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (position) => {
      if (viewer.isDestroyed()) return;
      setYouAreHereMarker(viewer, position.coords.longitude, position.coords.latitude);
    },
    fallback,
    { timeout: 8000, maximumAge: 60_000 },
  );
}

// =========================================================================
// §5.3/§4.4 markers -- exclamation (main activities) and duck (duck spots)
// =========================================================================

const MARKER_PIXEL_SIZE = 30;

export interface MarkerPoint {
  id: string;
  lat: number;
  lng: number;
}

export type MarkerKind = 'activity' | 'duckSpot';

function setMarkerPoints(
  dataSource: Cesium.CustomDataSource,
  kind: MarkerKind,
  iconUrl: string,
  points: MarkerPoint[],
): void {
  dataSource.entities.removeAll();
  for (const point of points) {
    dataSource.entities.add({
      position: Cesium.Cartesian3.fromDegrees(point.lng, point.lat),
      billboard: {
        image: iconUrl,
        width: MARKER_PIXEL_SIZE,
        height: MARKER_PIXEL_SIZE,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      properties: { markerKind: kind, refId: point.id },
    });
  }
}

export interface MarkerLayers {
  setActivities(points: MarkerPoint[]): void;
  setDuckSpots(points: MarkerPoint[]): void;
  dispose(): void;
}

/**
 * Creates the two marker layers for a Viewer (§5.3: exclamation markers from
 * main activities, duck markers from duck spots). Unclustered: each marker
 * needs to be individually tappable so it can open its own place's cinematic
 * + toukou web, and the seeded set is small enough that overlap at the
 * Kyoto-locked zoom range is minor.
 */
export function createMarkerLayers(viewer: Cesium.Viewer): MarkerLayers {
  const activitySource = new Cesium.CustomDataSource('activities');
  const duckSource = new Cesium.CustomDataSource('duckSpots');
  viewer.dataSources.add(activitySource);
  viewer.dataSources.add(duckSource);

  return {
    setActivities: (points) => setMarkerPoints(activitySource, 'activity', exclamationIconUrl, points),
    setDuckSpots: (points) => setMarkerPoints(duckSource, 'duckSpot', duckIconUrl, points),
    dispose: () => {
      viewer.dataSources.remove(activitySource, true);
      viewer.dataSources.remove(duckSource, true);
    },
  };
}

/**
 * Wires marker taps to a handler keyed by kind + which specific marker was
 * tapped (its refId), so the caller can route to that place's own content
 * rather than a single shared destination.
 */
export function setupMarkerTapHandler(
  viewer: Cesium.Viewer,
  onTap: (kind: MarkerKind, refId: string) => void,
): () => void {
  const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);

  handler.setInputAction((event: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
    const picked: unknown = viewer.scene.pick(event.position);
    if (!Cesium.defined(picked)) return;

    const entity = (picked as { id?: Cesium.Entity }).id;
    const properties = entity?.properties;
    if (!properties) return;

    const kind = properties.markerKind?.getValue() as MarkerKind | undefined;
    const refId = properties.refId?.getValue() as string | undefined;
    if (kind && refId) onTap(kind, refId);
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

  return () => handler.destroy();
}

// =========================================================================
// Marker-tap cinematic: framing highlight -> close fly-in -> slow orbit.
// The Kyoto camera-bounds clamp is lifted by the caller for the duration
// (see MainMap), since the close-up/orbit view is tighter than the clamp
// expects and the target is inside Kyoto anyway.
// =========================================================================

function squareOutlineCorners(center: Cesium.Cartesian3, halfSizeMeters: number): Cesium.Cartesian3[] {
  const enuTransform = Cesium.Transforms.eastNorthUpToFixedFrame(center);
  const corners: [number, number][] = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
    [-1, -1],
  ];
  return corners.map(([ex, ey]) =>
    Cesium.Matrix4.multiplyByPoint(
      enuTransform,
      new Cesium.Cartesian3(ex * halfSizeMeters, ey * halfSizeMeters, 0),
      new Cesium.Cartesian3(),
    ),
  );
}

/**
 * A pulsing square outline at the spot -- a camera-viewfinder-style framing
 * highlight, ground-clamped. Calm sine pulse (§4.3: nothing bouncy). Returns
 * a remover.
 */
export function addPlaceFraming(viewer: Cesium.Viewer, lat: number, lng: number): () => void {
  const center = Cesium.Cartesian3.fromDegrees(lng, lat);
  const startTime = performance.now();

  const positions = new Cesium.CallbackProperty(() => {
    const elapsedSeconds = (performance.now() - startTime) / 1000;
    const pulse = 1 + 0.15 * Math.sin(elapsedSeconds * 3);
    return squareOutlineCorners(center, 22 * pulse);
  }, false);

  const entity = viewer.entities.add({
    polyline: {
      positions,
      width: 3,
      material: kamoColor('--kamo-sunset'),
      clampToGround: true,
    },
  });

  return () => viewer.entities.remove(entity);
}

const PLACE_VIEW_HEIGHT_M = 350;
const PLACE_VIEW_PITCH_RADIANS = Cesium.Math.toRadians(-38);

/** Flies in close and low over the spot (oblique, not top-down) so its
 * surroundings actually read as a place rather than a satellite dot. */
export function flyToPlace(
  viewer: Cesium.Viewer,
  lat: number,
  lng: number,
  durationSeconds = 1.8,
): Promise<void> {
  return new Promise((resolve) => {
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(lng, lat - 0.002, PLACE_VIEW_HEIGHT_M),
      orientation: { heading: 0, pitch: PLACE_VIEW_PITCH_RADIANS, roll: 0 },
      duration: durationSeconds,
      easingFunction: Cesium.EasingFunction.QUADRATIC_IN_OUT,
      complete: () => resolve(),
      cancel: () => resolve(),
    });
  });
}

/**
 * Slowly sweeps the camera heading partway around the spot (not a full
 * spin) so the visitor sees where it sits relative to its surroundings, then
 * releases the lookAt lock. Cesium has no continuous-orbit API, so this
 * drives `camera.lookAt` per frame -- the standard technique for it.
 * Returns a promise (resolves when the sweep ends or is cancelled) and a
 * cancel function.
 */
export function orbitPlace(
  viewer: Cesium.Viewer,
  lat: number,
  lng: number,
  durationMs = 2000,
): { promise: Promise<void>; cancel: () => void } {
  const center = Cesium.Cartesian3.fromDegrees(lng, lat);
  const startHeading = viewer.camera.heading;
  const totalRotation = Cesium.Math.toRadians(75);
  const startTime = performance.now();
  let cancelled = false;
  let rafId = 0;

  function release() {
    if (!viewer.isDestroyed()) viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
  }

  const promise = new Promise<void>((resolve) => {
    function tick() {
      if (cancelled || viewer.isDestroyed()) {
        resolve();
        return;
      }
      const t = Math.min((performance.now() - startTime) / durationMs, 1);
      const eased = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
      const heading = startHeading + totalRotation * eased;
      viewer.camera.lookAt(
        center,
        new Cesium.HeadingPitchRange(heading, PLACE_VIEW_PITCH_RADIANS, PLACE_VIEW_HEIGHT_M),
      );
      if (t >= 1) {
        release();
        resolve();
        return;
      }
      rafId = requestAnimationFrame(tick);
    }
    rafId = requestAnimationFrame(tick);
  });

  return {
    promise,
    cancel: () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      release();
    },
  };
}
