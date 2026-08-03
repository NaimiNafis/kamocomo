import { useEffect, useRef, useState } from 'react';
import type { NodePosition } from './useForceGraph';

/** Hard stops on zoom. The floor only exists so a pathological board can't
 * scale to nothing; the *effective* floor is the fit-everything scale computed
 * below, which is what actually stops a pinch. */
const ABSOLUTE_MIN_SCALE = 0.12;
const MAX_SCALE = 2;

/** Air around the outermost cards, in world units -- the cards live inside the
 * scaled layer, so their size scales with everything else and the margin has to
 * be measured in the same space. Half a main card (88) plus a little. */
const FIT_PADDING = 120;

/** How far past the outermost card you may pan, as a fraction of the viewport.
 * Enough slack to drag a node to the edge and work comfortably, not enough to
 * lose the graph off-screen and be unable to find it again. */
const PAN_SLACK = 0.5;

/** How long a node must be held before its detail opens. Around what iOS uses
 * for its own press-and-hold: long enough not to fire on a tap, short enough
 * that you don't wonder whether it's working. The card shrinking under your
 * finger for the whole of it is what makes the wait legible. */
export const LONG_PRESS_MS = 320;
/** Movement that reclassifies a hold as a drag. Generous, because a finger on
 * glass never truly stops. */
const LONG_PRESS_SLOP = 10;

/** How far the opening animation closes in from the fit-everything view. The
 * move has to be decisive enough to read as "start here" -- too small and it
 * just looks like the board twitched. */
const INTRO_ZOOM_IN = 1.5;
/** ...but a multiplier alone isn't enough on a busy board, where fitting
 * everything can mean a quarter scale and 1.5x of that is still unreadable. The
 * glide lands at least here, so it always ends somewhere you can read. */
const INTRO_MIN_LANDING_SCALE = 0.85;
/** Duration of the glide to an off-screen main you tapped. Shorter than the
 * intro: you asked for it, and you already know where you're going. */
const FOCUS_MS = 600;

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

/**
 * The transform that frames every node in the viewport, centered.
 *
 * The extents are node *centres*, so the span is widened by a card's worth of
 * world units at each edge -- without that, a phone-width board fits its
 * midpoints and clips the cards themselves. Pure, so it can be derived during
 * render rather than stored.
 */
function fitView(positions: Map<string, NodePosition>, size: { w: number; h: number }): ViewTransform {
  const pts = [...positions.values()];
  if (pts.length === 0 || size.w === 0) return { tx: 0, ty: 0, scale: 1 };
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = maxX - minX + FIT_PADDING * 2;
  const spanY = maxY - minY + FIT_PADDING * 2;
  const scale = Math.min(MAX_SCALE, Math.max(ABSOLUTE_MIN_SCALE, Math.min(size.w / spanX, size.h / spanY)));
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
 * On open it holds the whole graph in frame, then eases in on `focusId`.
 *
 * The view auto-fits to frame the whole graph until the user interacts, then
 * `userView` takes over -- derived during render (not via a setState effect)
 * so it doesn't cascade a render on every simulation tick.
 */
export function useGraphViewport(
  positions: Map<string, NodePosition>,
  drag: GraphDragHandlers,
  options: {
    /** Node the opening glide settles on. Omitted, it closes in on the centre. */
    focusId?: string;
    /** Fired when a node is held without being dragged. Opens its detail. */
    onLongPress?: (nodeId: string) => void;
  } = {},
) {
  const { focusId, onLongPress } = options;
  const viewportRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [userView, setUserView] = useState<ViewTransform | null>(null);
  // The opening move: hold the whole board in frame so you can see how much is
  // here, then ease in on the focus node.
  //
  // Interpolated in JS rather than handed to a CSS transition. The force
  // simulation re-renders this component on every tick and rewrites the inline
  // transform with it, which restarts or swallows a CSS transition -- the
  // earlier attempts snapped for exactly that reason. Owning the value means
  // the animation is unaffected by how often the graph re-renders underneath.
  const [introT, setIntroT] = useState(0); // 0 = whole board, 1 = settled on focus
  const introCancelled = useRef(false);

  const fitted = fitView(positions, size);
  const focus = focusId ? positions.get(focusId) : undefined;

  // Where the glide lands. Placing a world point at the viewport centre means
  // tx = -x * scale, since a point renders at (centre + t + world * scale).
  // The frame you can zoom within. Out stops at "the whole board is on screen"
  // -- there is nothing beyond it but empty canvas, and being able to shrink
  // the graph to a speck in the middle of nowhere is what made the board feel
  // boundless. In stops at MAX_SCALE.
  const minScale = Math.min(fitted.scale, MAX_SCALE);
  const clampScale = (s: number) => Math.min(MAX_SCALE, Math.max(minScale, s));

  const targetScale = clampScale(Math.max(fitted.scale * INTRO_ZOOM_IN, INTRO_MIN_LANDING_SCALE));
  const target: ViewTransform = focus
    ? { scale: targetScale, tx: -focus.x * targetScale, ty: -focus.y * targetScale }
    : { ...fitted, scale: targetScale };

  const view =
    userView ??
    (introT === 0
      ? fitted
      : {
          scale: fitted.scale + (target.scale - fitted.scale) * introT,
          tx: fitted.tx + (target.tx - fitted.tx) * introT,
          ty: fitted.ty + (target.ty - fitted.ty) * introT,
        });
  /** Is the board already framed exactly as "show everything" would frame it?
   * When it is, the control that does so has nothing to offer and hides. */
  const atFitView =
    Math.abs(view.scale - fitted.scale) < fitted.scale * 0.02 &&
    Math.abs(view.tx - fitted.tx) < 8 &&
    Math.abs(view.ty - fitted.ty) < 8;

  const gesture = useRef<Gesture | null>(null);
  /** The node currently under a finger, so it can shrink while you hold it. */
  const [pressedId, setPressedId] = useState<string | null>(null);
  // Long-press has to share pointerdown with drag and pan, so it's a timer the
  // first real movement cancels: hold still and it fires, move and you're
  // dragging. LONG_PRESS_SLOP is what separates a held finger from a shaky one.
  const longPress = useRef<{ timer: ReturnType<typeof setTimeout>; x: number; y: number } | null>(
    null,
  );

  function cancelLongPress() {
    setPressedId(null);
    if (!longPress.current) return;
    clearTimeout(longPress.current.timer);
    longPress.current = null;
  }
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const focusRaf = useRef(0);

  /** Any touch on the board wins over a glide in progress. */
  function cancelFocus() {
    if (!focusRaf.current) return;
    cancelAnimationFrame(focusRaf.current);
    focusRaf.current = 0;
  }

  // Starts once the graph has laid out and been measured -- not on mount, or it
  // would animate away from an empty board before any card had a position.
  const ready = size.w > 0 && positions.size > 0;
  useEffect(() => {
    if (!ready || introCancelled.current) return;
    let raf = 0;
    let startedAt = 0;
    const hold = setTimeout(() => {
      const step = (now: number) => {
        if (introCancelled.current) return;
        if (!startedAt) startedAt = now;
        const t = Math.min((now - startedAt) / INTRO_GLIDE_MS, 1);
        // easeInOutCubic -- matches the calm motion the rest of the app uses.
        setIntroT(t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
        if (t < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    }, INTRO_HOLD_MS);
    return () => {
      clearTimeout(hold);
      cancelAnimationFrame(raf);
    };
  }, [ready]);

  // Leaving the board mid-glide shouldn't leave a frame callback running.
  useEffect(() => cancelFocus, []);

  /**
   * Stop Safari zooming the *page* when two fingers land on the board.
   *
   * iOS fires its own non-standard `gesture*` events for a pinch and acts on
   * them regardless of `touch-action`, so a two-finger pinch meant to zoom the
   * graph zoomed the whole app instead -- and a swipe that briefly grazed a
   * second finger did it mid-drag. They have to be registered non-passively or
   * preventDefault is ignored.
   */
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const swallow = (e: Event) => e.preventDefault();
    const events = ['gesturestart', 'gesturechange', 'gestureend'];
    for (const name of events) el.addEventListener(name, swallow, { passive: false });
    return () => {
      for (const name of events) el.removeEventListener(name, swallow);
    };
  }, []);

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
    // A finger on the board outranks any animation in progress.
    introCancelled.current = true;
    cancelFocus();
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size === 2) {
      cancelLongPress(); // a second finger means pinch, not hold
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
      const nodeId = nodeEl.dataset.nodeId;
      gesture.current = { kind: 'node', id: nodeId };
      drag.startDrag(nodeId);
      if (onLongPress) {
        setPressedId(nodeId);
        longPress.current = {
          x: e.clientX,
          y: e.clientY,
          timer: setTimeout(() => {
            longPress.current = null;
            setPressedId(null);
            // A tick of haptics where the platform has it -- the moment the
            // press "takes" is the one thing a screen can't convey on its own.
            navigator.vibrate?.(12);
            // Release the node first, or it stays pinned to the finger behind
            // the detail sheet that's about to open over it.
            drag.endDrag(nodeId);
            gesture.current = null;
            onLongPress(nodeId);
          }, LONG_PRESS_MS),
        };
      }
    } else {
      setUserView(view);
      gesture.current = { kind: 'pan', startX: e.clientX, startY: e.clientY, startTx: view.tx, startTy: view.ty };
    }
    viewportRef.current?.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const held = longPress.current;
    if (held && Math.hypot(e.clientX - held.x, e.clientY - held.y) > LONG_PRESS_SLOP) {
      cancelLongPress();
    }
    const g = gesture.current;
    if (!g) return;

    if (g.kind === 'pinch') {
      if (pointers.current.size < 2) return;
      const { dist, midX, midY } = pinchMetrics();
      const rect = viewportRef.current!.getBoundingClientRect();
      const scale = clampScale(g.startScale * (dist / g.startDist));
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
    cancelLongPress(); // let go before it fired -- that was a tap
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
    cancelFocus();
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    setUserView((v) => {
      const base = v ?? view;
      // Re-clamped after the zoom: zooming out shrinks the content, so a pan
      // that was legal at the old scale can be well outside the frame at the
      // new one.
      return clampPan({ ...base, scale: clampScale(base.scale * factor) }, positions, size);
    });
  }

  /**
   * Glide the view until `nodeId` sits in the middle, at the scale you're
   * already using. This is what the off-screen markers call: a main you can see
   * the edge of should be one tap away, not a hunt across the canvas.
   *
   * Interpolated in JS for the same reason the intro is -- a CSS transition on
   * the transform loses every time the board re-renders underneath it.
   */
  function focusOn(nodeId: string) {
    const p = positions.get(nodeId);
    if (!p || size.w === 0) return;
    cancelFocus();
    introCancelled.current = true;
    const from = view;
    const scale = clampScale(from.scale);
    const to = clampPan({ scale, tx: -p.x * scale, ty: -p.y * scale }, positions, size);
    let startedAt = 0;
    const step = (now: number) => {
      if (!startedAt) startedAt = now;
      const t = Math.min((now - startedAt) / FOCUS_MS, 1);
      const e = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
      setUserView({
        scale: from.scale + (to.scale - from.scale) * e,
        tx: from.tx + (to.tx - from.tx) * e,
        ty: from.ty + (to.ty - from.ty) * e,
      });
      if (t < 1) focusRaf.current = requestAnimationFrame(step);
    };
    focusRaf.current = requestAnimationFrame(step);
  }

  /** Drop back to the auto-fit transform, framing every node. `fitView()` is
   * already what renders before the first interaction, so this is just letting
   * it take over again. */
  function resetView() {
    // "Show me everything" is the fitted view, and it must not re-trigger the
    // opening glide afterwards.
    cancelFocus();
    introCancelled.current = true;
    setIntroT(0);
    setUserView(null);
  }

  return {
    viewportRef,
    size,
    cx,
    cy,
    view,
    resetView,
    atFitView,
    focusOn,
    pressedId,
    minScale,
    containerHandlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
      onWheel,
    },
  };
}
