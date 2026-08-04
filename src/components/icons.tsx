/**
 * Shared inline-SVG icons.
 *
 * Marks are drawn on a 24-unit grid with `currentColor` at a 1.6 stroke weight,
 * so anything added here inherits type colour and sits with the rest. Drawn by
 * hand rather than pulled from an icon library: §4 bars stock art, and the set
 * is far too small to justify a dependency.
 */

interface IconProps {
  /** Rendered size in px. Marks stay legible down to 16. */
  size?: number;
  className?: string;
}

function chevron(size: number, className: string | undefined, d: string) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      <path d={d} />
    </svg>
  );
}

export function ChevronLeftIcon({ size = 18, className }: IconProps) {
  return chevron(size, className, 'M15 5.5 8.5 12l6.5 6.5');
}

export function ChevronRightIcon({ size = 18, className }: IconProps) {
  return chevron(size, className, 'M9 5.5 15.5 12 9 18.5');
}

/** Back — the same chevron, at the size the screen headers use. */
export function BackIcon({ size = 20, className }: IconProps) {
  return chevron(size, className, 'M14.5 5.5 8 12l6.5 6.5');
}

/**
 * The two drawn icons, traced from the line art in `img/duck-icons/`.
 *
 * Those drawings are ~1600px wide with an 8px line -- half a percent of their
 * width, which at a 22px button is a tenth of a pixel and simply disappears.
 * So the traced outline is *both* filled and stroked in the same colour: the
 * stroke thickens each line from the outside until it survives the size. It's
 * the only knob that matters here, and it's a compromise -- enough weight to
 * see costs the finest detail, which is why the book below reads the way it
 * does.
 *
 * `evenodd` is what keeps the drawings hollow: each pen line traces as a pair
 * of contours, outer and inner, and even-odd is what turns that pair back into
 * a line rather than a filled slab.
 */
function tracedArt(size: number, className: string | undefined, d: string, weight: number) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      fillRule="evenodd"
      stroke="currentColor"
      strokeWidth={weight}
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      <path d={d} />
    </svg>
  );
}

const DUCK_ART =
  'M6.53 0.33 L8.22 0.29 L8.30 0.53 L6.82 0.45 L5.10 1.03 L4.36 1.52 L3.49 2.38 L2.92 3.37 L2.59 4.52 L2.59 5.26 L3.16 5.84 L3.41 6.33 L3.66 7.15 L3.66 7.97 L3.49 7.89 L3.49 7.40 L3.16 6.25 L3.00 5.92 L2.47 5.47 L1.89 6.12 L0.45 7.15 L0.21 7.56 L0.21 8.05 L0.99 8.42 L2.22 8.42 L3.53 8.18 L3.62 8.34 L5.67 8.75 L8.14 8.75 L9.78 8.59 L11.10 8.26 L11.47 7.56 L11.79 6.49 L11.79 5.84 L11.96 5.18 L11.79 3.78 L11.38 2.63 L10.81 1.73 L9.95 1.11 L8.67 0.58 L8.79 0.45 L9.53 0.70 L10.68 1.36 L11.14 1.81 L11.71 2.88 L12.12 4.36 L12.12 5.42 L11.88 6.99 L10.73 9.53 L10.32 11.42 L12.49 11.14 L15.12 11.14 L15.41 11.34 L13.40 11.30 L11.10 11.47 L10.36 11.63 L9.58 12.49 L8.42 14.88 L7.85 17.01 L7.77 19.81 L8.10 21.21 L9.00 22.68 L9.62 23.30 L9.86 23.38 L13.07 23.38 L15.53 23.14 L16.52 22.89 L18.74 21.99 L20.55 20.75 L22.48 18.66 L22.89 17.75 L23.30 16.19 L23.51 16.15 L23.47 16.60 L22.97 18.08 L22.48 18.99 L20.47 21.08 L19.15 21.99 L17.42 22.81 L15.78 23.30 L12.25 23.63 L9.62 23.55 L8.59 22.44 L7.68 20.63 L7.52 19.07 L7.60 17.34 L7.93 15.78 L8.67 13.73 L9.58 12.16 L10.23 11.42 L10.23 10.44 L10.77 8.84 L9.62 9.08 L7.81 9.25 L5.75 9.25 L4.85 9.08 L4.81 9.62 L4.40 10.44 L2.26 12.66 L1.19 14.14 L0.70 15.45 L0.53 16.60 L0.37 16.60 L0.53 15.29 L1.19 13.73 L1.85 12.82 L4.15 10.44 L4.56 9.70 L4.64 9.29 L4.56 8.96 L4.68 8.84 L5.26 9.00 L8.51 8.96 L5.42 8.92 L4.44 8.75 L3.45 8.42 L2.47 8.59 L0.82 8.59 L0.25 8.34 L-0.04 7.97 L-0.04 7.64 L0.21 7.15 L1.48 6.21 L2.34 5.34 L2.51 3.95 L2.84 3.04 L3.25 2.38 L4.36 1.27 L4.85 0.95 L5.67 0.53Z' +
  'M15.90 11.34 L16.19 11.30 L17.75 11.71 L19.07 12.29 L21.21 12.95 L22.11 13.11 L22.77 12.95 L22.97 13.15 L22.89 13.48 L23.10 13.68 L23.59 13.44 L23.92 13.44 L23.96 13.81 L23.63 15.62 L23.47 15.62 L23.47 15.29 L23.79 13.64 L23.26 13.77 L22.64 14.55 L21.25 16.85 L19.85 18.41 L18.49 19.68 L16.27 20.84 L13.89 21.49 L12.82 21.66 L10.27 21.58 L8.30 21.00 L8.18 20.88 L8.30 20.75 L9.04 21.08 L10.52 21.41 L13.23 21.41 L15.86 20.75 L16.93 20.34 L18.49 19.44 L19.52 18.49 L21.00 16.85 L22.89 13.89 L22.73 13.73 L22.81 13.23 L21.86 13.27 L20.96 13.11 L19.15 12.53 L17.84 11.96 L16.11 11.55Z' +
  'M0.29 17.01 L0.45 17.01 L0.53 18.58 L0.86 19.64 L1.44 20.55 L2.63 21.66 L4.11 22.40 L5.10 22.73 L7.73 23.30 L9.04 23.38 L9.25 23.59 L7.97 23.55 L5.26 22.97 L3.78 22.48 L2.55 21.82 L1.52 20.96 L0.53 19.40 L0.29 18.16Z' +
  'M8.63 8.84 L8.63 8.92 L9.41 8.88ZM9.53 8.75 L9.53 8.84 L9.90 8.79ZM10.11 8.67 L10.11 8.75 L10.32 8.71Z';

/**
 * The collection: the duck, drawn the way the map markers are, so the button
 * and the things it collects read as the same animal.
 */
export function DuckIcon({ size = 20, className }: IconProps) {
  return tracedArt(size, className, DUCK_ART, 1.2);
}

const BOOK_ART =
  'M5.28 1.25 L6.49 1.28 L7.34 1.54 L8.13 1.93 L9.64 3.05 L10.20 3.61 L10.75 4.36 L11.80 3.51 L12.98 2.79 L14.95 1.93 L16.79 1.41 L18.03 1.21 L19.28 1.21 L19.48 1.67 L20.13 1.74 L20.30 1.84 L20.39 2.13 L20.98 2.00 L21.61 5.18 L22.26 7.61 L23.11 12.39 L23.77 14.82 L23.97 16.00 L23.21 15.97 L22.03 16.10 L19.80 16.62 L17.57 17.41 L14.95 18.72 L14.72 18.56 L14.92 18.10 L15.87 17.08 L16.79 16.36 L17.97 15.64 L19.67 14.85 L20.79 14.52 L22.16 14.33 L22.85 14.43 L22.13 11.28 L20.62 5.57 L20.16 4.00 L19.21 1.41 L19.08 1.34 L17.64 1.41 L15.21 2.00 L14.03 2.46 L12.59 3.18 L11.67 3.77 L10.82 4.56 L10.69 4.56 L10.39 4.07 L9.57 3.18 L8.07 2.07 L6.69 1.48 L5.57 1.34 L4.72 1.48 L4.62 1.57 L4.69 2.23 L6.07 9.25 L6.85 11.80 L8.20 17.08 L8.92 16.69 L9.57 16.56 L11.28 16.69 L12.13 16.89 L13.51 17.41 L14.52 18.16 L13.41 14.49 L13.15 13.18 L12.43 10.89 L11.44 7.08 L10.72 4.98 L10.72 4.79 L10.82 4.75 L11.51 6.75 L12.49 10.56 L13.08 12.33 L13.67 14.89 L13.93 15.54 L14.46 17.57 L14.72 18.16 L14.62 18.26 L14.56 18.20Z' +
  'M0.66 7.05 L0.10 7.34 L1.02 10.89 L1.54 12.33 L3.38 18.95 L4.52 22.52 L5.97 21.80 L7.67 21.21 L11.02 19.84 L13.77 18.92 L14.56 18.72 L14.69 18.72 L14.72 18.82 L12.98 19.31 L10.75 20.10 L7.93 21.28 L5.25 22.26 L4.46 22.72 L3.31 19.28 L2.79 17.18 L2.00 14.69 L1.87 13.97 L0.82 10.75 L0.10 7.67 L-0.03 7.48 L0.07 7.18Z' +
  'M1.44 6.20 L0.82 6.49 L1.28 8.79 L2.79 13.51 L4.16 18.89 L4.98 21.34 L5.90 20.69 L6.75 20.23 L8.85 19.44 L13.93 18.56 L11.93 18.39 L9.84 18.66 L7.34 19.44 L5.77 20.16 L5.57 20.36 L5.34 20.07 L5.15 19.08 L4.49 17.05 L3.57 13.51 L2.92 11.54 L2.66 10.36 L2.52 10.16 L1.67 6.43 L1.61 6.23Z' +
  'M4.92 4.49 L3.74 4.75 L2.82 5.08 L1.61 5.77 L2.98 11.21 L3.57 12.98 L5.54 20.13 L7.93 19.05 L10.10 18.46 L11.54 18.26 L12.79 18.26 L14.43 18.52 L14.39 18.30 L13.64 17.67 L12.66 17.21 L11.80 16.95 L10.16 16.69 L9.64 16.69 L8.46 17.02 L8.13 17.28 L8.03 17.25 L6.72 11.87 L6.39 11.02 L5.93 9.31 L5.15 5.18Z' +
  'M19.54 1.80 L20.36 4.13 L21.21 7.41 L21.41 7.87 L22.66 12.79 L22.98 14.49 L22.89 14.59 L21.64 14.52 L20.85 14.66 L18.82 15.38 L17.90 15.84 L16.59 16.69 L15.25 17.90 L15.05 18.16 L15.08 18.26 L15.61 17.80 L16.72 17.08 L19.21 15.90 L21.64 15.18 L22.82 14.98 L23.38 15.02 L22.79 12.85 L21.87 8.07 L20.95 4.72 L20.82 4.52 L20.23 2.03 L20.13 1.87Z' +
  'M20.66 2.20 L20.46 2.26 L20.43 2.43 L22.00 8.00 L22.79 12.13 L23.51 15.08 L23.41 15.18 L22.89 15.11 L21.44 15.38 L18.62 16.30 L16.46 17.41 L15.67 17.93 L15.15 18.46 L17.05 17.48 L19.28 16.62 L21.90 15.97 L23.77 15.80 L22.79 11.54 L22.66 10.30 L22.20 8.00 L21.21 4.13 L20.95 2.49 L20.89 2.30Z' +
  'M14.46 18.56 L14.43 18.66 L13.57 18.72 L12.85 18.92 L10.10 19.31 L8.52 19.70 L6.43 20.56 L5.57 21.08 L5.05 21.54 L4.92 21.54 L4.75 21.31 L3.97 18.69 L3.97 18.56Z' +
  'M14.52 18.23 L14.66 18.43 L14.62 18.59 L14.49 18.52Z';

/**
 * The log: an open book, from the same drawn set as the duck.
 *
 * A caveat worth knowing before this is reused anywhere smaller: the original
 * draws its pages as lines about 1% of the image apart, which at 22px is a
 * fifth of a pixel. Thickened enough to be visible they close up, so the left
 * page reads as filled rather than as an outline. It reads as an open book at
 * button size; it would not survive being shrunk further.
 */
export function LibraryIcon({ size = 20, className }: IconProps) {
  return tracedArt(size, className, BOOK_ART, 0.6);
}

/**
 * Map labels: lines of text, struck through when they're hidden.
 *
 * The slash is doing the real work. A bare glyph (this started life as the
 * letter "A") says nothing about whether labels are currently on, and putting a
 * letter in a button that exists to work in two languages is self-defeating.
 * Struck-through-means-hidden is the same convention as muted audio or a
 * crossed-out eye, so the state reads without a caption.
 */
export function LabelsIcon({ size = 20, className, off }: IconProps & { off?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      <path d="M4.5 7h15M4.5 12h10M4.5 17h6.5" />
      {off && <path d="M20 5 5.5 19.5" strokeWidth={1.9} />}
    </svg>
  );
}

/** Tutorial / help. */
export function HelpIcon({ size = 20, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9.7 9.4a2.4 2.4 0 0 1 4.6.9c0 1.6-2.3 2-2.3 3.4" />
      <circle cx="12" cy="17" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Recenter: a viewfinder closing on a point — "bring everything back into
 * frame", which is exactly what it does to a force graph. */
export function RecenterIcon({ size = 20, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      <path d="M4 9V5.5A1.5 1.5 0 0 1 5.5 4H9" />
      <path d="M15 4h3.5A1.5 1.5 0 0 1 20 5.5V9" />
      <path d="M20 15v3.5a1.5 1.5 0 0 1-1.5 1.5H15" />
      <path d="M9 20H5.5A1.5 1.5 0 0 1 4 18.5V15" />
      <circle cx="12" cy="12" r="2.4" />
    </svg>
  );
}
