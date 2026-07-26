// Cross-screen flags for the intro + duck-scan entry flow. A duck-QR scan
// collects the stamp, then routes THROUGH the globe intro and the map before
// opening the duck page (item 3), so a few small flags coordinate the handoff
// between DuckScan, MainMap, and Duck.

/** sessionStorage: the intro has played this session (cleared to replay it). */
export const HAS_SEEN_INTRO_KEY = 'hasSeenIntro';

/** localStorage: duck-scan test mode -- submit the scanned spot's own coords so
 * the geofence passes for any QR without being there (item 2). */
export const TEST_MODE_KEY = 'testModeEnabled';

/** sessionStorage: after the intro lands on the map, open the duck page. */
export const OPEN_DUCK_AFTER_INTRO_KEY = 'openDuckAfterIntro';

/** sessionStorage (JSON): the pending scan result for the duck page's banner. */
export const DUCK_SCAN_RESULT_KEY = 'duckScanResult';

export interface StashedScanResult {
  status: string; // collected | already | too_far | not_found | location | error
  spotNameEn: string;
  spotNameJa: string;
  distance: number;
}
