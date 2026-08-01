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

/** Duck N as itself: the shared body in its colour, plus its own detail. */
export function duckVariantDataUri(index: number, color: string, sizePx = 64): string {
  return svgDataUri(
    `<circle cx="32" cy="32" r="29" fill="${SURFACE}" stroke="${color}" stroke-width="2.5"/>` +
      duckBody(color) +
      variantDetail(index, accentOf(color)),
    sizePx,
  );
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
