// The 10 ducks. Each duck spot (stamp location) IS a duck, and its color is
// shared everywhere it appears: its map marker, its stamp-card slot, and its
// node on the duck toukou graph. These are muted, on-brand PLACEHOLDER colors
// for the current recolored-duck icon -- they get replaced wholesale once the
// real 10-duck artwork is drawn (just swap `duckIconDataUri` for the art).
//
// Consistency rule: everything that shows the 10 ducks must order the spots
// the SAME way (lat descending, north-to-south) so duck N is always the same
// color across the map, the stamp card, and the graph.

export const DUCK_PALETTE = [
  '#E0885E', // sunset
  '#6E8CA0', // river
  '#7C8C5A', // moss
  '#C08552', // amber clay
  '#8E6E8C', // muted plum
  '#5B8A8A', // muted teal
  '#A9834E', // ochre
  '#6E7FA0', // slate blue
  '#9C8C5A', // olive gold
  '#B5705E', // terracotta
] as const;

/** Stable duck color for the Nth spot in the canonical (lat-desc) ordering. */
export function duckColor(index: number): string {
  return DUCK_PALETTE[index % DUCK_PALETTE.length];
}

const BEAK = '#2E3A59';
const SURFACE = '#E9E4D8';

/** The duck body/head/beak/eye, shared by every variant. */
function duckBody(color: string): string {
  return (
    `<path d="M17 39c-0.6-9 7.6-16 17.4-15 8 0.8 13.4 6.4 12.4 12.6-1 6.3-9 9.6-17.6 8.7-6-0.6-11.8-2-12.2-6.3z" fill="${color}"/>` +
    `<circle cx="39.5" cy="23.5" r="7.6" fill="${color}"/>` +
    `<path d="M46.5 23 L54.5 20.5 L54 26.5 Z" fill="${BEAK}"/>` +
    `<circle cx="41.5" cy="21.5" r="1.5" fill="${SURFACE}"/>`
  );
}

/**
 * `width`/`height` here are load-bearing, not decoration. Google rasterizes
 * marker SVGs and explicitly ignores CSS applied to the `<img>` ("CSS classes
 * added to images won't be applied"), so the *intrinsic* size is the only
 * thing that controls how big a marker draws. A viewBox-only SVG has no
 * intrinsic size and browsers fall back to ~300px — which is exactly how these
 * ended up swallowing the map.
 */
function svgDataUri(inner: string, sizePx: number): string {
  const svg =
    `<svg viewBox="0 0 64 64" width="${sizePx}" height="${sizePx}" xmlns="http://www.w3.org/2000/svg">` +
    inner +
    `</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/**
 * The plain duck mark recolored to `color` — used wherever the duck is being
 * shown as itself (stamp card slots, the duck graph), with no claim about
 * activity happening there.
 */
export function duckIconDataUri(color: string, sizePx = 64): string {
  return svgDataUri(
    `<circle cx="32" cy="32" r="29" fill="${SURFACE}" stroke="${color}" stroke-width="2.5"/>` +
      duckBody(color),
    sizePx,
  );
}
