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
