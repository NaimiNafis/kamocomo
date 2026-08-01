import { useEffect, useRef, useState } from 'react';
import type { NodePosition } from './useForceGraph';

const MIN_SCALE = 0.4;
const MAX_SCALE = 2;
const FIT_PADDING = 90; // room for card size around the extreme nodes

/** How far past the outermost card you may pan, as a fraction of the viewport.
 * Enough slack to drag a node to the edge and work comfortably, not enough to
 * lose the graph off-screen and be unable to find it again. */
const PAN_SLACK = 0.5;

/** How far the opening animation closes in from the fit-everything view. Kept
 * modest: the further in it lands, the less graph is on screen and the more of
 * it a single swipe crosses, which reads as the board being twitchy. */
const INTRO_ZOOM_IN = 1.25;

/**
 * Screen pixels of content movement per pixel of finger movement.
 *
 * 1 is exact tracking, which is what a map does and what direct manipulation
 * normally wants. Slightly under that trades a little of the "stuck to my
 * finger" feel for control on a dense board, where 1:1 at close zoom sends
 * cards off-screen faster than you can follow. Put it back to 1 for exact
 * tracking.
 */
const PAN_SENSITIVITY = 0.8;
/** How long the whole board stays in frame before that move begins. */
const INTRO_HOLD_MS = 900;
/** Duration of the ease-in, mirrored by the CSS transition the caller applies. */
const INTRO_GLIDE_MS = 1400;

export interface ViewTransform {
  tx: number;
  ty: number;
  scale: number;
}

type Gesture =
  | { kind: 'pan'; startX: number; startY: number; startTx: number; startTy: number }
  | { kind: 'node'; id: string }
  | { kind: 'pinch'; startDist: number; startScale: number; worldX: number; worldY: number };

/** The auto-fit transform that frames every node in the viewport, centered.
 * Pure, so it can be derived during render each tick. */
function fitView(positions: Map<string, NodePosition>, size: { w: number; h: number }): ViewTransform {
  const pts = [...positions.values()];
  if (pts.length === 0 || size.w === 0) return { tx: 0, ty: 0, scale: 1 };
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const scale = Math.min(
    MAX_SCALE,
    Math.max(MIN_SCALE, Math.min((size.w - FIT_PADDING) / Math.max(maxX - minX, 1), (size.h - FIT_PADDING) / Math.max(maxY - minY, 1))),
  );
  return { scale, tx: (-(minX + maxX) / 2) * scale, ty: (-(minY + maxY) / 2) * scale };
}

/**
 * Keeps the content within reach. `tx`/`ty` place the graph's origin, so the
 * bounds on them come from the node extents mapped through the current scale;
 * anything further than PAN_SLACK viewports beyond the outermost card is
 * clamped away. Without this the canvas is infinite and it's entirely possible
 * to pan into empty space and never find the cards again.
 */
function clampPan(
  view: ViewTransform,
  positions: Map<string, NodePosition>,
  size: { w: number; h: number },
): ViewTransform {
  const pts = [...positions.values()];
  if (pts.length === 0 || size.w === 0) return view;
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const slackX = size.w * PAN_SLACK;
  const slackY = size.h * PAN_SLACK;
  // Screen position of a node = centre + t + world * scale. Require the extreme
  // nodes to stay within half a viewport (plus slack) of the centre.
  const limit = (min: number, max: number, half: number, slack: number) => ({
    lo: -max * view.scale - half - slack,
    hi: -min * view.scale + half + slack,
  });
  const x = limit(Math.min(...xs), Math.max(...xs), size.w / 2, slackX);
  const y = limit(Math.min(...ys), Math.max(...ys), size.h / 2, slackY);
  return {
    scale: view.scale,
    tx: Math.min(x.hi, Math.max(x.lo, view.tx)),
    ty: Math.min(y.hi, Math.max(y.lo, view.ty)),
  };
}

export interface GraphDragHandlers {
  startDrag: (id: string) => void;
  drag: (id: string, x: number, y: number) => void;
  endDrag: (id: string) => void;
}

/**
 * Shared pan / wheel-zoom / two-finger-pinch / node-drag interaction for a
 * force-graph canvas (the toukou board and the duck graph both use it). All
 * pointer handling is container-level so a second finger starts a pinch even
 * when both fingers are on nodes (item 4): a single pointer on a `button` is
 * left alone (its click fires), on a `[data-node-id]` element drags that node,
 * and on the background pans; a second pointer converts to a pinch about the
 * midpoint and cancels any in-progress node drag.
 *
 * The view auto-fits to frame the whole graph until the user interacts, then
 * `userView` takes over -- derived during render (not via a setState effect)
 * so it doesn't cascade a render on every simulation tick.
 */
export function useGraphViewport(positions: Map<string, NodePosition>, drag: GraphDragHandlers) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [userView, setUserView] = useState<ViewTransform | null>(null);
  // The opening move: hold the whole board in frame for a beat so you can see
  // how much is here, then ease in to the middle.
  //
  // Four phases, and 'arming' is the one that isn't obvious. A CSS transition
  // only animates a property that changes while the transition is ALREADY
  // declared on the element; mount the transition and the new transform in the
  // same render and the browser simply paints the end state. So 'arming' puts
  // the transition on for one frame with the transform untouched, and only then
  // does 'gliding' move it. 'done' takes the easing back off, so nothing the
  // user does afterwards is animated.
  const [introPhase, setIntroPhase] = useState<'hold' | 'arming' | 'gliding' | 'done'>('hold');
  const fitted = fitView(positions, size);
  // Zoomed only from 'gliding' onward -- 'arming' must still render the fitted
  // transform, or there's nothing left to animate from.
  const zoomedIn = introPhase === 'gliding' || introPhase === 'done';
  const view =
    userView ??
    (zoomedIn ? { ...fitted, scale: Math.min(fitted.scale * INTRO_ZOOM_IN, MAX_SCALE) } : fitted);
  const gesture = useRef<Gesture | null>(null);
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());

  // Starts once the graph has laid out and been measured -- not on mount, or it
  // would animate away from an empty board before any card had a position.
  const ready = size.w > 0 && positions.size > 0;
  useEffect(() => {
    if (!ready || introPhase !== 'hold') return;
    const timer = setTimeout(() => setIntroPhase('arming'), INTRO_HOLD_MS);
    return () => clearTimeout(timer);
  }, [ready, introPhase]);

  // Let the browser paint one frame with the transition declared and the
  // transform unchanged, then move it. Two rAFs rather than one: a single frame
  // isn't reliably enough for the style to have been committed.
  useEffect(() => {
    if (introPhase !== 'arming') return;
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setIntroPhase('gliding'));
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [introPhase]);

  // Retire the easing once the glide has played.
  useEffect(() => {
    if (introPhase !== 'gliding') return;
    const timer = setTimeout(() => setIntroPhase('done'), INTRO_GLIDE_MS);
    return () => clearTimeout(timer);
  }, [introPhase]);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const update = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const cx = size.w / 2;
  const cy = size.h / 2;

  function toWorld(clientX: number, clientY: number) {
    const rect = viewportRef.current!.getBoundingClientRect();
    return {
      x: (clientX - rect.left - cx - view.tx) / view.scale,
      y: (clientY - rect.top - cy - view.ty) / view.scale,
    };
  }

  function pinchMetrics() {
    const [a, b] = [...pointers.current.values()];
    return { dist: Math.hypot(a.x - b.x, a.y - b.y), midX: (a.x + b.x) / 2, midY: (a.y + b.y) / 2 };
  }

  function releaseCapture(pointerId: number) {
    try {
      viewportRef.current?.releasePointerCapture(pointerId);
    } catch {
      /* not captured -- fine */
    }
  }

  function onPointerDown(e: React.PointerEvent) {
    const target = e.target as HTMLElement;
    // Touching the board hands control over immediately: no easing should be
    // left on the transform while a finger is moving it.
    setIntroPhase('done');
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size === 2) {
      if (gesture.current?.kind === 'node') drag.endDrag(gesture.current.id);
      setUserView(view);
      const { dist, midX, midY } = pinchMetrics();
      const world = toWorld(midX, midY);
      gesture.current = { kind: 'pinch', startDist: dist, startScale: view.scale, worldX: world.x, worldY: world.y };
      viewportRef.current?.setPointerCapture(e.pointerId);
      return;
    }
    if (pointers.current.size > 2) return;

    if (target.closest('button')) return; // let the tapped button handle it

    const nodeEl = target.closest('[data-node-id]') as HTMLElement | null;
    if (nodeEl?.dataset.nodeId) {
      setUserView(view);
      gesture.current = { kind: 'node', id: nodeEl.dataset.nodeId };
      drag.startDrag(nodeEl.dataset.nodeId);
    } else {
      setUserView(view);
      gesture.current = { kind: 'pan', startX: e.clientX, startY: e.clientY, startTx: view.tx, startTy: view.ty };
    }
    viewportRef.current?.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (!g) return;

    if (g.kind === 'pinch') {
      if (pointers.current.size < 2) return;
      const { dist, midX, midY } = pinchMetrics();
      const rect = viewportRef.current!.getBoundingClientRect();
      const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, g.startScale * (dist / g.startDist)));
      setUserView(
        clampPan(
          { scale, tx: midX - rect.left - cx - g.worldX * scale, ty: midY - rect.top - cy - g.worldY * scale },
          positions,
          size,
        ),
      );
    } else if (g.kind === 'pan') {
      setUserView((v) =>
        clampPan(
          {
            scale: v?.scale ?? view.scale,
            tx: g.startTx + (e.clientX - g.startX) * PAN_SENSITIVITY,
            ty: g.startTy + (e.clientY - g.startY) * PAN_SENSITIVITY,
          },
          positions,
          size,
        ),
      );
    } else {
      const world = toWorld(e.clientX, e.clientY);
      drag.drag(g.id, world.x, world.y);
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId);
    releaseCapture(e.pointerId);
    const g = gesture.current;

    if (g?.kind === 'pinch' && pointers.current.size === 1) {
      const [rem] = [...pointers.current.values()];
      gesture.current = { kind: 'pan', startX: rem.x, startY: rem.y, startTx: view.tx, startTy: view.ty };
      return;
    }
    if (pointers.current.size === 0) {
      if (g?.kind === 'node') drag.endDrag(g.id);
      gesture.current = null;
    }
  }

  function onWheel(e: React.WheelEvent) {
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    setUserView((v) => {
      const base = v ?? view;
      return { ...base, scale: Math.min(MAX_SCALE, Math.max(MIN_SCALE, base.scale * factor)) };
    });
  }

  /** Drop back to the auto-fit transform, framing every node. `fitView()` is
   * already what renders before the first interaction, so this is just letting
   * it take over again. */
  function resetView() {
    setUserView(null);
    setIntroPhase('done'); // recentre means "show me everything", not "replay the intro"
  }

  return {
    viewportRef,
    size,
    cx,
    cy,
    view,
    /** True only for the duration of the opening glide, so the caller eases the
     * transform for exactly that long and never during interaction. */
    introGliding: introPhase === 'arming' || introPhase === 'gliding',
    introGlideMs: INTRO_GLIDE_MS,
    resetView,
    containerHandlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
      onWheel,
    },
  };
}
