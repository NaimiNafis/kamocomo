import * as Cesium from 'cesium';

/**
 * §8.1 — Cesium cost control. The camera is locked to a bounding rectangle
 * around Kyoto/the Kamogawa and to a min/max zoom distance so a user can
 * never pan away or zoom out far enough to trigger photoreal tile loads
 * outside the area we actually care about.
 * Never remove these limits (CLAUDE.md architecture rule #4).
 */

// Kyoto city, wide enough to cover the full length of the Kamogawa within it.
export const KYOTO_BOUNDS = Cesium.Rectangle.fromDegrees(135.65, 34.9, 135.85, 35.15);

// Kamogawa Delta — the hero viewpoint (§5.1), used as the default/home camera target.
export const KAMOGAWA_DELTA = { longitude: 135.772, latitude: 35.03 };

export const MIN_ZOOM_DISTANCE_M = 300; // keep the camera from clipping into the ground
export const MAX_ZOOM_DISTANCE_M = 20_000; // keep it from zooming out to a globe/space view

// A shallow pitch (near horizontal) reveals ground far past the horizon even
// at a modest height, pulling in tiles well outside Kyoto. Cap how flat the
// camera is allowed to tilt so the visible footprint stays roughly local.
const MAX_PITCH_RADIANS = Cesium.Math.toRadians(-35);

export function getCesiumIonToken(): string | undefined {
  return import.meta.env.VITE_CESIUM_ION_TOKEN as string | undefined;
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

/** The default/home camera view: an overview of Kyoto centered on the Kamogawa. */
export function setKyotoHomeView(viewer: Cesium.Viewer): void {
  viewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(
      KAMOGAWA_DELTA.longitude,
      KAMOGAWA_DELTA.latitude - 0.05,
      15000,
    ),
    orientation: {
      heading: 0,
      pitch: Cesium.Math.toRadians(-55),
      roll: 0,
    },
  });
}

/** Flies from the current view to the Kamogawa hero viewpoint (§5.1 intro sequence). */
export function flyToKamogawaHero(viewer: Cesium.Viewer, durationSeconds = 4): void {
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(
      KAMOGAWA_DELTA.longitude,
      KAMOGAWA_DELTA.latitude - 0.02,
      4000,
    ),
    orientation: {
      heading: 0,
      pitch: Cesium.Math.toRadians(-50),
      roll: 0,
    },
    duration: durationSeconds,
    easingFunction: Cesium.EasingFunction.QUADRATIC_IN_OUT,
  });
}
