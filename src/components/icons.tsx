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
 * The collection: a duck, matching the shape of the map markers so the button
 * and the things it collects read as the same animal.
 */
export function DuckIcon({ size = 20, className }: IconProps) {
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
      <path d="M4 14.5c0-3.6 3.2-6.2 7.2-5.8 3.3.3 5.6 2.5 5.2 5-.4 2.6-3.7 4-7.2 3.6C6.6 17 4.2 16.3 4 14.5Z" />
      <circle cx="15.4" cy="7.6" r="3" />
      <path d="M18.2 7.2 21.5 6l-.2 2.6Z" fill="currentColor" stroke="none" />
      <circle cx="16.1" cy="6.9" r="0.7" fill="currentColor" stroke="none" />
    </svg>
  );
}

/**
 * The library: a bound volume seen spine-on, with its ribs. Chosen over a box
 * or a folder because the archive is a *record* of how the river has been used
 * — it should read as a reference book on a shelf, not as storage.
 */
export function LibraryIcon({ size = 20, className }: IconProps) {
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
      <path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H17a1.5 1.5 0 0 1 1.5 1.5v15A1.5 1.5 0 0 1 17 21H6.5A1.5 1.5 0 0 1 5 19.5Z" />
      <path d="M8.5 3v18" />
      <path d="M11 7.5h4.5M11 10.5h4.5" />
    </svg>
  );
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
