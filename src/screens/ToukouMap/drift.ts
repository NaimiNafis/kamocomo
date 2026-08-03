/**
 * Per-card idle drift, keyed off the node's own id so a card breathes the same
 * way every time you open a board rather than re-rolling on each render.
 *
 * Small numbers on purpose: this is meant to be noticed only as the board not
 * being a still image. The animation itself is `.kamo-drift` in index.css --
 * pure CSS, so it runs on the compositor and never re-renders React.
 *
 * Shared by both force-graph boards (the toukou web and the duck photo wall) so
 * they breathe the same way.
 */
export function driftStyle(id: string): React.CSSProperties {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  const angle = (h % 360) * (Math.PI / 180);
  const distance = 3 + ((h >> 9) % 4); // 3-6px
  return {
    '--drift-x': `${(Math.cos(angle) * distance).toFixed(1)}px`,
    '--drift-y': `${(Math.sin(angle) * distance).toFixed(1)}px`,
    '--drift-dur': `${5 + ((h >> 3) % 5)}s`,
    '--drift-delay': `-${(h >> 6) % 5}s`,
  } as React.CSSProperties;
}
