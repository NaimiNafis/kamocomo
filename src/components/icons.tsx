/**
 * Shared inline-SVG icons.
 *
 * Marks are drawn on a 24-unit grid with `currentColor` at a 1.6 stroke weight,
 * so anything added here inherits type colour and sits with the rest. Drawn by
 * hand rather than pulled from an icon library: §4 bars stock art, and the set
 * is far too small to justify a dependency.
 *
 * Two exceptions are the artist's drawings rather than marks drawn here:
 * `DuckIcon` and `LibraryIcon`, documented where they're defined.
 */
import kamoCollectionIcon from '../../img/icons/transparent/kamo-collection.png?url';
import kamogawaLogIcon from '../../img/icons/transparent/kamogawa-log.png?url';

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
 * The two drawn button icons, rendered from the artist's PNGs.
 *
 * These are the drawings as delivered, at the weight they were drawn at -- no
 * thickening. `img/icons/` holds the originals on their opaque white
 * background; `npm run icons` keys that white out and writes the transparent
 * copies imported below, which is why these point at `transparent/` and not at
 * the source files. To swap in new art: replace the PNG in `img/icons/`, run
 * `npm run icons`, done. Nothing here changes.
 *
 * That script also reports whether the lines are thick enough to survive being
 * shrunk to a 22px button, and says by how much they miss. As of the current
 * art both still fall well short, so expect them to read faint -- the fix is a
 * thicker drawing, not code.
 */
function drawnIcon(size: number, className: string | undefined, src: string, label: string) {
  return (
    <img
      src={src}
      alt=""
      aria-hidden
      draggable={false}
      data-icon={label}
      className={className}
      style={{ width: size, height: size, objectFit: 'contain' }}
    />
  );
}

/** The collection: the duck, the same animal the map markers use. */
export function DuckIcon({ size = 20, className }: IconProps) {
  return drawnIcon(size, className, kamoCollectionIcon, 'collection');
}

/** The log: an open book, from the same drawn set as the duck. */
export function LibraryIcon({ size = 20, className }: IconProps) {
  return drawnIcon(size, className, kamogawaLogIcon, 'log');
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
