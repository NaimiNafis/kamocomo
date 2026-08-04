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

// =========================================================================
// The ten variants.
//
// The duck objects along the river each carry their own detail, and the point
// of the collection is that finding out which is which is the fun. So the ten
// have to read as different animals rather than ten recolours of one shape.
//
// Each variant is the shared body plus one distinguishing feature, described
// as a path list so the SAME geometry can be rendered two ways: in colour when
// a duck is shown as itself, and as a flat silhouette on a collection entry
// you haven't found yet. Drawing them from one source is what keeps the
// silhouette an honest clue to the thing you're looking for.
//
// Placeholder quality, and deliberately swappable: real illustrations replace
// the bodies here without any caller changing.
// =========================================================================

/** The extra marks that distinguish variant N, as (path, isAccent) pairs. */
function variantDetail(index: number, accent: string): string {
  switch (index % 10) {
    case 0: // plain — the reference duck
      return '';
    case 1: // crest
      return `<path d="M37 16.5c-1.2-4 0.6-7 3.4-8.2-0.8 3 0.4 5 2.2 6.4z" fill="${accent}"/>`;
    case 2: // ribbon at the neck
      return `<path d="M33 30.5l5-2 0.8 3.4-5.2 1.8z" fill="${accent}"/><circle cx="36" cy="31" r="1.6" fill="${SURFACE}"/>`;
    case 3: // flat hat
      return `<path d="M31 15.5h17v2.4H31z" fill="${accent}"/><path d="M35 9.5h9v6h-9z" fill="${accent}"/>`;
    case 4: // speckled back
      return `<circle cx="26" cy="36" r="1.7" fill="${accent}"/><circle cx="33" cy="39.5" r="1.7" fill="${accent}"/><circle cx="39" cy="35.5" r="1.7" fill="${accent}"/>`;
    case 5: // scarf
      return `<path d="M32 29.5c4 2.5 8 2.5 11.5 0.5l1.5 3.5c-4.5 2.5-9.5 2.5-14-0.5z" fill="${accent}"/><path d="M31 33l-4.5 5 3.5 1.5 3-4.5z" fill="${accent}"/>`;
    case 6: // spotted bill
      return `<circle cx="50" cy="23" r="1.5" fill="${SURFACE}"/><circle cx="52.5" cy="24.5" r="1.1" fill="${SURFACE}"/>`;
    case 7: // sitting — a shorter, rounder body reads as a different pose
      return `<ellipse cx="30" cy="45" rx="14" ry="4.5" fill="${accent}" opacity="0.75"/>`;
    case 8: // raised wing
      return `<path d="M24 33c4-5 11-6 15-3-3.5 1-7 3-10 6.5z" fill="${accent}"/>`;
    default: // 9 — ducklings following
      return (
        `<circle cx="14" cy="47" r="4" fill="${accent}"/><circle cx="16.5" cy="44" r="2.4" fill="${accent}"/>` +
        `<circle cx="23" cy="48" r="3.4" fill="${accent}"/><circle cx="25" cy="45.4" r="2" fill="${accent}"/>`
      );
  }
}

/** A lighter shade of the duck's own colour, so a detail reads as part of the
 * same animal rather than as a sticker on top of it. */
function accentOf(color: string): string {
  const v = color.replace('#', '');
  const mix = (c: number) => Math.round(c + (255 - c) * 0.45);
  const part = (i: number) =>
    mix(parseInt(v.slice(i, i + 2), 16))
      .toString(16)
      .padStart(2, '0');
  return `#${part(0)}${part(2)}${part(4)}`;
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
  index: number,
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
    variantDetail(index, accentOf(color)) +
    `</g>` +
    `</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/**
 * Duck N as an unfound collection entry: the same geometry, flat, no colour.
 *
 * It's a clue rather than a reveal — you can see the shape and its detail, and
 * work out what to look for, but what the object actually IS only resolves when
 * you find it and your own photo takes this card's place.
 */
export function duckSilhouetteDataUri(index: number, sizePx = 64): string {
  const ink = '#1C1C1A';
  return svgDataUri(
    `<g opacity="0.28">` +
      duckBody(ink).replaceAll(BEAK, ink).replaceAll(SURFACE, ink) +
      variantDetail(index, ink).replaceAll(SURFACE, ink) +
      `</g>`,
    sizePx,
  );
}
