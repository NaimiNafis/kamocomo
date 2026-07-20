export type GeoFailure = 'unsupported' | 'denied' | 'unavailable' | 'timeout';

export interface GeoPoint {
  lat: number;
  lng: number;
}

export class GeoError extends Error {
  reason: GeoFailure;
  constructor(reason: GeoFailure) {
    super(reason);
    this.name = 'GeoError';
    this.reason = reason;
  }
}

/**
 * Resolves the device's current position, or rejects with a GeoError whose
 * `reason` distinguishes a denied permission from an unavailable/timed-out
 * fix -- the duck scan (§A.2b) needs that distinction for its messaging.
 */
export function getPosition(): Promise<GeoPoint> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new GeoError('unsupported'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => {
        const reason: GeoFailure =
          err.code === err.PERMISSION_DENIED
            ? 'denied'
            : err.code === err.TIMEOUT
              ? 'timeout'
              : 'unavailable';
        reject(new GeoError(reason));
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 },
    );
  });
}
