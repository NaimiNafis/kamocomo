// The 10 ducks. Each duck spot (stamp location) IS a duck, and its color is
// shared everywhere it appears: its map marker, its stamp-card slot, and its
// node on the duck toukou graph.
//
// The first eight are read straight off the artwork in `img/duck-icons/`, one
// PNG per active spot, named for the place it belongs to. Those eight files are
// the same duck drawn eight times in eight flat colors, so the color IS the
// artwork -- taking the hexes from the files is what keeps a duck's body, its
// marker ring and its card exactly the same color instead of nearly.
//
// The last two are the earlier placeholder colors, kept because `duckColor`
// wraps: spots 9 and 10 (Shichijo, Jujo) are inactive, so nothing draws them
// today, but leaving ten entries means reactivating one picks up a color of its
// own rather than silently sharing the Delta's. A tenth spot would want its own
// PNG here too.
//
// Consistency rule: everything that shows the 10 ducks must order the spots
// the SAME way (lat descending, north-to-south) so duck N is always the same
// color across the map, the stamp card, and the graph.

export const DUCK_PALETTE = [
  '#E5916B', // kamogawa-delta
  '#568B9F', // demachiyanagi-bridge
  '#689169', // kojin-bridge
  '#B49861', // marutamachi-bridge
  '#776485', // nijo-bridge
  '#76A598', // sanjo-bridge
  '#A6776F', // shijo-bridge
  '#8C92B9', // gojo-bridge
  '#9C8C5A', // olive gold -- no artwork; inactive spot
  '#B5705E', // terracotta -- no artwork; inactive spot
] as const;

/** Stable duck color for the Nth spot in the canonical (lat-desc) ordering. */
export function duckColor(index: number): string {
  return DUCK_PALETTE[index % DUCK_PALETTE.length];
}

const SURFACE = '#E9E4D8';

/**
 * The duck, traced from the artwork in `img/duck-icons/`.
 *
 * The eight PNGs there are one drawing in eight flat colors, so only the
 * outline carries information -- hence a path rather than eight embedded
 * images. It stays a fraction of the size, scales to any marker, and can be
 * filled with the spot's own color, which is what lets one shape serve the map
 * marker, the board node and the empty-slot silhouette alike.
 *
 * Five subpaths: body, breast, head, tail, beak. The gaps between them are the
 * white dividing lines of the original drawing, so they have to stay unfilled
 * -- `evenodd` and the fact that they don't overlap both keep them that way.
 *
 * Authored on the same 64-unit box as everything else here, centred on (32,32)
 * and sized so no point sits more than 25 units out -- inside the r=29 ring
 * with room to spare. Regenerate rather than hand-edit if the art changes.
 */
const DUCK_PATH =
  'M32.16 25.91 L35.43 25.93 L39.89 26.56 L42.55 27.15 L47.25 28.41 L48.33 28.59 L49.50 28.59 L49.93 28.93 L50.13 29.27 L50.52 29.52 L50.60 29.74 L50.60 31.50 L50.47 32.49 L49.80 36.01 L49.30 37.77 L49.07 39.44 L48.53 41.20 L48.12 43.05 L47.27 45.31 L46.68 46.48 L46.32 46.93 L45.31 47.81 L43.64 48.94 L40.43 50.65 L38.09 51.51 L33.08 52.55 L31.73 52.77 L27.80 53.09 L24.24 53.00 L22.25 52.63 L21.40 52.59 L20.61 51.76 L19.53 50.04 L18.76 48.33 L18.08 45.85 L17.59 42.87 L17.54 41.47 L17.72 39.48 L18.18 37.45 L18.89 35.34 L19.79 33.71 L20.93 32.18 L24.06 28.91 L25.01 28.14 L26.36 27.29 L28.08 26.47 L28.57 26.47 L30.74 26.02 L32.14 25.93Z' +
  'M17.09 25.55 L17.29 25.52 L18.55 25.98 L23.93 26.39 L25.37 26.61 L26.23 26.61 L26.39 26.72 L26.31 27.06 L25.32 27.47 L23.79 28.55 L21.60 30.69 L20.66 31.78 L18.76 34.39 L18.08 35.84 L17.27 38.32 L16.96 40.03 L16.82 42.06 L16.96 43.95 L17.27 45.58 L17.90 47.79 L18.71 49.54 L20.11 51.49 L20.74 52.12 L20.79 52.43 L20.40 52.50 L19.91 52.41 L17.16 51.47 L15.26 50.43 L13.91 49.25 L12.40 47.51 L11.54 46.21 L10.78 44.54 L10.23 42.15 L10.01 39.80 L10.01 38.14 L10.42 35.34 L11.09 33.31 L11.54 32.36 L12.58 30.69 L13.84 28.98 L15.15 27.49 L17.07 25.57Z' +
  'M23.32 10.93 L24.60 10.91 L25.46 11.05 L27.45 11.86 L28.48 12.58 L29.50 13.55 L30.03 14.22 L30.40 14.91 L30.80 16.25 L31.03 17.74 L30.98 18.79 L30.72 20.50 L29.95 22.80 L29.40 23.83 L28.59 24.83 L27.49 25.93 L26.76 26.43 L26.54 26.25 L21.76 25.93 L19.24 25.66 L17.65 25.30 L17.34 25.34 L17.27 25.19 L17.72 24.65 L17.77 24.10 L17.34 23.77 L16.73 23.65 L16.68 22.75 L16.15 21.17 L15.38 19.68 L14.43 18.55 L14.38 18.15 L15.01 16.80 L15.92 15.26 L16.78 14.18 L17.97 13.03 L19.01 12.27 L20.13 11.68 L21.72 11.18 L23.30 10.95Z' +
  'M50.74 30.74 L51.08 30.72 L51.39 30.98 L52.16 31.21 L55.09 31.75 L55.21 31.91 L55.21 33.49 L54.71 36.01 L54.26 37.05 L52.68 39.44 L52.41 40.57 L51.96 41.43 L49.62 44.50 L47.47 46.41 L47.29 46.41 L47.22 46.21 L47.67 45.62 L48.17 44.68 L48.75 42.96 L49.66 38.00 L49.84 36.29 L50.38 34.39 L50.70 32.49 L50.72 30.76Z' +
  'M14.16 18.79 L14.36 18.81 L14.70 19.24 L15.60 20.77 L16.19 22.35 L16.41 23.34 L16.37 23.70 L15.94 23.90 L13.59 24.44 L11.16 24.62 L9.81 24.36 L9.08 23.90 L8.79 23.47 L8.88 23.02 L9.31 22.59 L11.79 20.97 L13.28 19.71 L14.14 18.81Z';

/**
 * How much of its own box the duck takes up, scaled about the centre of the
 * 64-unit box.
 *
 * `DUCK_PATH` is traced at the largest size that still clears the r=29 ring, so
 * 1 is "as big as it can be" rather than "the right size" — at that size the
 * duck crowds the ring it sits in. Kept as one number here, applied in
 * `duckBody`, so the marker, the board node and the silhouette can't drift out
 * of proportion with each other.
 */
const DUCK_SCALE = 0.85;

/** The duck in one flat color, exactly as the artwork draws it. */
function duckBody(color: string): string {
  return (
    `<g transform="translate(32 32) scale(${DUCK_SCALE}) translate(-32 -32)">` +
    `<path d="${DUCK_PATH}" fill="${color}" fill-rule="evenodd"/>` +
    `</g>`
  );
}

// =========================================================================
// One duck, eight colours.
//
// There used to be ten hand-drawn variants here -- a crest, a ribbon, a hat --
// so that each duck read as a different animal and an unfound collection slot
// could show its silhouette as a clue to what you were looking for. The real
// artwork settled that differently: it is one duck drawn eight times, and the
// colour is the whole distinction. The variants went with it, since a clue
// that promised a crest the duck doesn't have is worse than no clue.
//
// What this costs: an unfound slot can no longer say WHICH duck is missing,
// only that one is. Colour still carries it everywhere the duck is shown as
// itself, which is everywhere except that one silhouette.
// =========================================================================

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
 * shown as itself, with no claim about activity happening there.
 */
/**
 * Ink or stone, whichever stays readable on `hex`.
 *
 * The duck palette runs from pale sand to deep indigo, so anything that puts
 * text on a place's own colour has to ask rather than assume. Plain relative
 * luminance, which is enough for a palette this small.
 */
export function readableOn(hex: string): string {
  const v = hex.replace('#', '');
  const r = parseInt(v.slice(0, 2), 16);
  const g = parseInt(v.slice(2, 4), 16);
  const b = parseInt(v.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? '#1C1C1A' : '#E9E4D8';
}

/** How much of the colour survives when it's used as a surface. */
const SOFT_FILL_ALPHA = 0.25;
const STONE = [0xe9, 0xe4, 0xd8];

/**
 * A place's colour as a soft surface: the colour laid over stone at a quarter
 * strength, composited rather than made translucent so it sits on any
 * background.
 *
 * This is how a duck reads on the map -- a stone body with the colour as the
 * marking, not a block of saturated paint -- and colouring a whole card in the
 * raw palette broke that: mid-tones are the worst case for text, so the first
 * attempt had to be darkened almost to brown before stone text was legible,
 * which made the page heavier than anything else in the app.
 *
 * Pair with ink text: every colour in the palette lands above 10:1 this way,
 * against the 4.5:1 the darkened version was scraping.
 */
export function softFill(hex: string): string {
  const v = hex.replace('#', '');
  const mix = (i: number, stone: number) =>
    Math.round(parseInt(v.slice(i, i + 2), 16) * SOFT_FILL_ALPHA + stone * (1 - SOFT_FILL_ALPHA));
  const [r, g, b] = [mix(0, STONE[0]), mix(2, STONE[1]), mix(4, STONE[2])];
  return `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}`;
}

export function duckIconDataUri(color: string, sizePx = 64): string {
  return svgDataUri(
    `<circle cx="32" cy="32" r="29" fill="${SURFACE}" stroke="${color}" stroke-width="2.5"/>` +
      duckBody(color),
    sizePx,
  );
}

/**
 * How strongly a duck marker is lit, from how close the visitor is. 0 is the
 * ordinary mark.
 *
 * Stepped rather than continuous on purpose. `Marker3DElement` rasterizes its
 * art when it's appended and has no way to restyle it in place, so every change
 * costs a marker rebuild — a value that slid smoothly with distance would
 * rebuild on every GPS tick. Steps mean it only redraws when you cross a band,
 * which is also the only time the change is worth noticing.
 */
export type ProximityLevel = 0 | 1 | 2 | 3;

/**
 * On-screen size of a duck marker's whole box. The duck itself is about 60% of
 * it; the rest is the ring the proximity halo grows into.
 *
 * It lives here, with the artwork, because on the 3D map the SVG's **intrinsic**
 * size is the only thing that controls how big a marker draws — Google
 * rasterizes the image and ignores width/height set on the `<img>`. Owning it
 * at the layer instead is how the markers stayed 40px after being "doubled":
 * the 2D map honoured its `scaledSize` and grew, the 3D map kept rendering the
 * 40 baked into the SVG.
 */
export const MARKER_PIXEL_SIZE = 80;

/**
 * Duck N as a map marker, optionally lit by how close the visitor is.
 *
 * Drawn on a **96-unit box rather than 64**, with the duck itself sitting in the
 * middle at exactly the size it has everywhere else. The extra ring of space is
 * always reserved, empty at level 0, and the halo grows into it.
 *
 * That reservation is the whole point. The first version grew the marker's
 * pixel size when lit and scaled the artwork down to compensate; the two didn't
 * cancel, so a lit duck came out a different size from its neighbours — and by
 * a different amount on each map, because the two render markers differently.
 * With a fixed box the duck is pixel-identical at every level and only the
 * rings change, so nothing can drift.
 */
export function duckMarkerDataUri(
  color: string,
  level: ProximityLevel = 0,
  sizePx = MARKER_PIXEL_SIZE,
): string {
  const halo = '#E0885E'; // --kamo-sunset
  // Alpha and reach both climb with the level; the outermost ring stays faint so
  // even the strongest state reads as a glow rather than a border.
  const rings = [
    { r: 34, w: 3, a: [0, 0.2, 0.34, 0.5][level] },
    { r: 39, w: 4, a: [0, 0.09, 0.18, 0.3][level] },
    { r: 44, w: 5, a: [0, 0, 0.08, 0.16][level] },
  ]
    .filter((ring) => ring.a > 0)
    .map(
      (ring) =>
        `<circle cx="48" cy="48" r="${ring.r}" fill="none" stroke="${halo}" stroke-width="${ring.w}" opacity="${ring.a}"/>`,
    )
    .join('');

  // The duck art is authored on a 64 box, so shift it to sit centred in the 96.
  const svg =
    `<svg viewBox="0 0 96 96" width="${sizePx}" height="${sizePx}" xmlns="http://www.w3.org/2000/svg">` +
    rings +
    `<g transform="translate(16 16)">` +
    `<circle cx="32" cy="32" r="29" fill="${SURFACE}" stroke="${color}" stroke-width="2.5"/>` +
    duckBody(color) +
    `</g>` +
    `</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/**
 * An unfound collection entry: the duck flat, with no colour.
 *
 * A placeholder rather than a clue. While the ducks had per-variant details it
 * hinted at WHICH one was missing; now that they share a shape it can only say
 * that one is, and the answer arrives when you find it and your own photo takes
 * this card's place.
 */
export function duckSilhouetteDataUri(sizePx = 64): string {
  const ink = '#1C1C1A';
  return svgDataUri(`<g opacity="0.28">${duckBody(ink)}</g>`, sizePx);
}
