import { useTranslation } from 'react-i18next';
import type { NodePosition } from './useForceGraph';
import type { ViewTransform } from './useGraphViewport';
import { examplePhoto, thumb } from '../../lib/photos';

/** All a marker needs. Declared structurally so both boards' node types fit. */
export interface EdgeMarkerNode {
  id: string;
  color: string;
  photoUrl: string | null;
}

const DOT = 44;
/** Keeps the markers clear of the top bar and the bottom controls. */
const INSET = { top: 68, right: 12, bottom: 116, left: 12 };
/** A main has to be this far outside the frame before it gets a marker --
 * without it, one edging past the border flickers a marker on and off. */
const MARGIN = 40;

interface OffscreenMainsProps {
  mains: EdgeMarkerNode[];
  positions: Map<string, NodePosition>;
  view: ViewTransform;
  size: { w: number; h: number };
  onSelect: (id: string) => void;
  /** What to show when a main has no photo of its own. The duck board passes
   * its duck mark; the toukou board falls back to a riverbank shot. */
  imageFor?: (node: EdgeMarkerNode) => string;
}

/**
 * Round photo markers pinned to the edge of the screen, one for each main
 * that's currently off it. Tap one and the board glides until that main is in
 * the middle.
 *
 * The board is bigger than a phone, and hunting for a cluster by swiping means
 * knowing which way to swipe. These say which way, say what's over there (the
 * post's own photo, so it's recognisable rather than a generic pin), and skip
 * the journey entirely when tapped.
 *
 * Mains only. A marker per sub would ring the screen with a dozen dots and
 * mains are what you navigate between.
 */
export function OffscreenMains({
  mains,
  positions,
  view,
  size,
  onSelect,
  imageFor,
}: OffscreenMainsProps) {
  const { t } = useTranslation();
  if (size.w === 0) return null;

  const cx = size.w / 2;
  const cy = size.h / 2;

  const offscreen = mains
    .map((node) => {
      const p = positions.get(node.id);
      if (!p) return null;
      const x = cx + view.tx + p.x * view.scale;
      const y = cy + view.ty + p.y * view.scale;
      const out =
        x < -MARGIN || x > size.w + MARGIN || y < -MARGIN || y > size.h + MARGIN;
      return out ? { node, x, y } : null;
    })
    .filter((v): v is { node: EdgeMarkerNode; x: number; y: number } => v !== null);

  if (offscreen.length === 0) return null;

  return (
    <>
      {offscreen.map(({ node, x, y }) => {
        // Park the marker where the line from the middle of the screen to the
        // node crosses the edge, so its position alone points the way.
        const left = Math.min(size.w - INSET.right - DOT / 2, Math.max(INSET.left + DOT / 2, x));
        const top = Math.min(size.h - INSET.bottom - DOT / 2, Math.max(INSET.top + DOT / 2, y));
        const angle = (Math.atan2(y - cy, x - cx) * 180) / Math.PI;

        return (
          <button
            key={node.id}
            type="button"
            onClick={() => onSelect(node.id)}
            aria-label={t('toukou.jumpToMain')}
            className="pointer-events-auto absolute z-20 -translate-x-1/2 -translate-y-1/2 rounded-full shadow-lg transition-transform duration-150 active:scale-90"
            style={{ left, top, width: DOT, height: DOT }}
          >
            <span
              className="block h-full w-full overflow-hidden rounded-full border-2"
              style={{ borderColor: node.color, backgroundColor: node.color }}
            >
              <img
                src={node.photoUrl ? thumb(node.photoUrl, DOT * 2) : (imageFor?.(node) ?? examplePhoto(node.id))}
                alt=""
                className="h-full w-full object-cover"
                decoding="async"
                draggable={false}
              />
            </span>
            {/* Small arrow riding just outside the circle, pointing off-screen. */}
            <span
              className="pointer-events-none absolute left-1/2 top-1/2 h-0 w-0"
              style={{ transform: `rotate(${angle}deg) translateX(${DOT / 2 + 6}px)` }}
            >
              <span
                className="absolute -translate-x-1/2 -translate-y-1/2"
                style={{
                  width: 0,
                  height: 0,
                  borderTop: '5px solid transparent',
                  borderBottom: '5px solid transparent',
                  borderLeft: `7px solid ${node.color}`,
                }}
              />
            </span>
          </button>
        );
      })}
    </>
  );
}
