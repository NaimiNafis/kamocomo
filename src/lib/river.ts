import { kamoColor, type Map3D, type Maps3D } from './map3d';

/**
 * The Kamogawa drawn as a blue line on the map.
 *
 * Why this exists: on photorealistic imagery the river reads as a grey-green
 * ribbon that's easy to lose, and the obvious fix — Google's ROADMAP mode,
 * which paints water a clear blue — is documented as Experimental (pre-GA) and
 * only ships on the `v=alpha` channel. Rather than put a live site on alpha for
 * it, we draw the river ourselves in the §4.1 `--kamo-river` token. It shows in
 * BOTH map modes, so "where is the river?" is answered whether or not labels
 * are on, and it's on-brand instead of generic Google styling.
 *
 * The coordinates are an approximation of the centerline, seeded from the 16
 * activity places (20260727120000_reposition_places_16.sql), which were chosen
 * to trace the river's shape. Static rather than read from `places` on purpose:
 * this is fixed geography, and a place can be renamed or deactivated without
 * the river moving. Refine with real river geometry any time — nothing else
 * depends on these numbers.
 */

type Point = google.maps.LatLngAltitudeLiteral;

const p = (lat: number, lng: number): Point => ({ lat, lng, altitude: 0 });

/** 高野川 — the eastern branch, coming down from the north to the Delta. */
const TAKANO_BRANCH: Point[] = [
  p(35.048381, 135.785238),
  p(35.045061, 135.78144),
  p(35.040212, 135.777738),
  p(35.036058, 135.775477),
  p(35.031443, 135.772671),
];

/** 賀茂川 — the western branch, coming down from the north to the Delta. */
const KAMO_BRANCH: Point[] = [
  p(35.047785, 135.760139),
  p(35.044305, 135.762643),
  p(35.040283, 135.765281),
  p(35.035668, 135.767987),
  p(35.031443, 135.770417),
  p(35.031443, 135.772671),
];

/** 鴨川 — the main stretch south from the Delta confluence past the bridges. */
const MAIN_STRETCH: Point[] = [
  p(35.031443, 135.772671),
  p(35.022069, 135.771467),
  p(35.017374, 135.771542),
  p(35.013018, 135.771704),
  p(35.009325, 135.771837),
  p(35.004573, 135.771736),
  p(34.996621, 135.76845),
];

const STRANDS = [TAKANO_BRANCH, KAMO_BRANCH, MAIN_STRETCH];

const STROKE_WIDTH = 6;

/**
 * Draws the three river strands (they meet at the Delta) onto the map. Added
 * once on mount and never toggled — it's meant to be there in both modes.
 * Returns a remover.
 */
export function addRiverOverlay(maps3d: Maps3D, map: Map3D): () => void {
  const color = kamoColor('--kamo-river');
  const polylines = STRANDS.map((path) => {
    const line = new maps3d.Polyline3DElement({
      path,
      strokeColor: color,
      strokeWidth: STROKE_WIDTH,
      altitudeMode: 'CLAMP_TO_GROUND',
      geodesic: true,
      drawsOccludedSegments: true,
    });
    map.appendChild(line);
    return line;
  });

  return () => polylines.forEach((line) => line.remove());
}
