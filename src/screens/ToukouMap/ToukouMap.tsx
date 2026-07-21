import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useIdentityStore } from '../../store/identityStore';
import {
  createSub,
  fetchPlaceGraph,
  reportContent,
  clearVote,
  setVote,
  subscribeToToukou,
  type ToukouGraph,
  type ToukouNode,
} from '../../lib/toukou';
import { cachedFetch } from '../../lib/cache';
import { LanguageToggle } from '../../components/LanguageToggle';
import { StaleBanner } from '../../components/StaleBanner';
import { NodeCard } from './NodeCard';
import { Composer, type ComposerResult } from './Composer';
import { ReportDialog, type ReportReason } from './ReportDialog';
import { useForceGraph } from './useForceGraph';

const EDGE_OFFSET = 4000;
const MIN_SCALE = 0.4;
const MAX_SCALE = 2;
const FIT_PADDING = 90; // room for card size around the extreme nodes

interface ViewTransform {
  tx: number;
  ty: number;
  scale: number;
}

type DragState =
  | { kind: 'pan'; startX: number; startY: number; startTx: number; startTy: number }
  | { kind: 'node'; id: string }
  | { kind: 'pinch'; startDist: number; startScale: number; worldX: number; worldY: number };

/** The auto-fit transform: scale + translate that frames every node in the
 * viewport, centered. Pure, so it can be derived during render each tick. */
function fitView(positions: Map<string, { x: number; y: number }>, size: { w: number; h: number }): ViewTransform {
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
 * One place's toukou web (§5.5/§C1): the main a visitor tapped from the map,
 * plus its subs. Every marker links here via `?main=<id>`, so this screen
 * always needs that id -- a direct visit without one bounces back to the map.
 */
export function ToukouMap() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const mainId = searchParams.get('main');
  const userId = useIdentityStore((s) => s.userId);

  const [graph, setGraph] = useState<ToukouGraph>({ nodes: [], edges: [] });
  const [status, setStatus] = useState<'loading' | 'ready' | 'notfound' | 'error'>('loading');
  const [stale, setStale] = useState(false);
  const [composerParentId, setComposerParentId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(false);
  const [reportedIds, setReportedIds] = useState<Set<string>>(new Set());
  const [reportTarget, setReportTarget] = useState<string | null>(null);

  const { positions, startDrag, drag, endDrag } = useForceGraph(graph.nodes, graph.edges);

  const viewportRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  // The view is *derived*: auto-fit frames the whole web to the viewport
  // (recomputed each tick as the layout settles) until the user pans / zooms /
  // drags, which sets userView and takes over. Deriving it during render (vs.
  // a setState effect) avoids cascading renders on every simulation tick.
  const [userView, setUserView] = useState<ViewTransform | null>(null);
  const view = userView ?? fitView(positions, size);
  const dragState = useRef<DragState | null>(null);
  // Every currently-down pointer, keyed by id -- lets a second finger turn a
  // one-finger pan into a pinch (§C3), which Cesium-style single-pointer
  // handling didn't support before.
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());

  // Every marker passes a main id; a bare /toukou visit has nowhere to go.
  useEffect(() => {
    if (!mainId) navigate('/', { replace: true });
  }, [mainId, navigate]);

  const refetchGraph = useCallback(async () => {
    if (!userId || !mainId) return;
    try {
      setGraph(await fetchPlaceGraph(userId, mainId));
    } catch {
      /* keep the last good graph; realtime will retry on the next change */
    }
  }, [userId, mainId]);

  // Initial load. Cached (falls back to the last good copy when offline,
  // flagged stale), scoped to this one place.
  useEffect(() => {
    if (!userId || !mainId) return;
    let cancelled = false;
    (async () => {
      try {
        const graphRes = await cachedFetch(`toukou:${mainId}:${userId}`, () => fetchPlaceGraph(userId, mainId));
        if (cancelled) return;
        setGraph(graphRes.data);
        setStale(graphRes.stale);
        setStatus(graphRes.data.nodes.length === 0 ? 'notfound' : 'ready');
      } catch {
        if (!cancelled) setStatus('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, mainId]);

  // Realtime: debounce a whole-graph refetch on any activity/vote change.
  useEffect(() => {
    if (!userId || !mainId) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = subscribeToToukou(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void refetchGraph(), 250);
    });
    return () => {
      if (timer) clearTimeout(timer);
      unsubscribe();
    };
  }, [userId, mainId, refetchGraph]);

  // Track viewport size so (0,0) world sits at its center.
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
    const [a, b] = [...pointersRef.current.values()];
    return {
      dist: Math.hypot(a.x - b.x, a.y - b.y),
      midX: (a.x + b.x) / 2,
      midY: (a.y + b.y) / 2,
    };
  }

  function handlePointerDownBackground(e: React.PointerEvent) {
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    viewportRef.current?.setPointerCapture(e.pointerId);

    if (pointersRef.current.size === 2) {
      // A second finger landed -- switch to a pinch (zoom about the midpoint,
      // panning with it if the fingers also drift together).
      const { dist, midX, midY } = pinchMetrics();
      setUserView(view);
      const world = toWorld(midX, midY);
      dragState.current = { kind: 'pinch', startDist: dist, startScale: view.scale, worldX: world.x, worldY: world.y };
    } else if (pointersRef.current.size === 1) {
      setUserView(view); // freeze the current frame; the user is taking control
      dragState.current = {
        kind: 'pan',
        startX: e.clientX,
        startY: e.clientY,
        startTx: view.tx,
        startTy: view.ty,
      };
    }
  }

  function handleNodePointerDown(e: React.PointerEvent, id: string) {
    e.stopPropagation();
    // A tap on a card's button (vote/report/+/archive) must act, not drag --
    // otherwise every button press would reheat the simulation and jiggle the
    // whole web.
    if ((e.target as HTMLElement).closest('button')) return;
    setUserView(view); // stop auto-fit from reframing while dragging a node
    dragState.current = { kind: 'node', id };
    startDrag(id);
    viewportRef.current?.setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (pointersRef.current.has(e.pointerId)) {
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
    const d = dragState.current;
    if (!d) return;

    if (d.kind === 'pinch') {
      if (pointersRef.current.size < 2) return;
      const { dist, midX, midY } = pinchMetrics();
      const rect = viewportRef.current!.getBoundingClientRect();
      const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, d.startScale * (dist / d.startDist)));
      setUserView({
        scale,
        tx: midX - rect.left - cx - d.worldX * scale,
        ty: midY - rect.top - cy - d.worldY * scale,
      });
    } else if (d.kind === 'pan') {
      setUserView((v) => ({
        scale: v?.scale ?? view.scale,
        tx: d.startTx + (e.clientX - d.startX),
        ty: d.startTy + (e.clientY - d.startY),
      }));
    } else {
      const world = toWorld(e.clientX, e.clientY);
      drag(d.id, world.x, world.y);
    }
  }

  function handlePointerUp(e: React.PointerEvent) {
    pointersRef.current.delete(e.pointerId);
    const d = dragState.current;
    if (d?.kind === 'node') endDrag(d.id);
    viewportRef.current?.releasePointerCapture(e.pointerId);

    if (d?.kind === 'pinch' && pointersRef.current.size === 1) {
      // One finger lifted mid-pinch -- keep going as a plain pan with the
      // remaining finger instead of dropping the gesture.
      const [remaining] = [...pointersRef.current.values()];
      dragState.current = {
        kind: 'pan',
        startX: remaining.x,
        startY: remaining.y,
        startTx: view.tx,
        startTy: view.ty,
      };
    } else if (pointersRef.current.size === 0) {
      dragState.current = null;
    }
  }

  function handleWheel(e: React.WheelEvent) {
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    setUserView((v) => {
      const base = v ?? view;
      return { ...base, scale: Math.min(MAX_SCALE, Math.max(MIN_SCALE, base.scale * factor)) };
    });
  }

  async function handleVote(node: ToukouNode, value: 1 | -1) {
    if (!userId) return;
    // Optimistic: reflect the switch immediately, then reconcile from the server.
    setGraph((g) => ({
      ...g,
      nodes: g.nodes.map((n) => (n.id === node.id ? applyVote(n, value) : n)),
    }));
    try {
      if (node.myVote === value) await clearVote(userId, node.id);
      else await setVote(userId, node.id, value);
    } finally {
      void refetchGraph();
    }
  }

  async function handleReportSubmit(reason: ReportReason) {
    if (!userId || !reportTarget) return;
    const id = reportTarget;
    setReportTarget(null);
    setReportedIds((prev) => new Set(prev).add(id));
    try {
      await reportContent(userId, 'activity', id, reason);
    } catch {
      /* leave it marked reported in the UI regardless */
    }
  }

  async function handleComposerSubmit(result: ComposerResult) {
    if (!userId || !composerParentId) return;
    setSubmitting(true);
    setSubmitError(false);
    try {
      await createSub({
        authorId: userId,
        parentId: composerParentId,
        phrase: result.phrase,
        photoFile: result.photoFile,
      });
      setComposerParentId(null);
      await refetchGraph();
    } catch {
      setSubmitError(true);
    } finally {
      setSubmitting(false);
    }
  }

  const positionOf = (id: string) => positions.get(id) ?? { x: 0, y: 0 };

  return (
    <div className="relative h-full w-full overflow-hidden bg-kamo-stone">
      {/* Graph viewport */}
      <div
        ref={viewportRef}
        className="absolute inset-0 touch-none"
        onPointerDown={handlePointerDownBackground}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onWheel={handleWheel}
      >
        <div
          className="absolute left-0 top-0 origin-top-left"
          style={{ transform: `translate(${cx + view.tx}px, ${cy + view.ty}px) scale(${view.scale})` }}
        >
          <svg
            className="pointer-events-none absolute overflow-visible"
            style={{ left: -EDGE_OFFSET, top: -EDGE_OFFSET, width: EDGE_OFFSET * 2, height: EDGE_OFFSET * 2 }}
          >
            {graph.edges.map((edge) => {
              const s = positionOf(edge.source);
              const tPos = positionOf(edge.target);
              return (
                <line
                  key={`${edge.source}-${edge.target}`}
                  x1={s.x + EDGE_OFFSET}
                  y1={s.y + EDGE_OFFSET}
                  x2={tPos.x + EDGE_OFFSET}
                  y2={tPos.y + EDGE_OFFSET}
                  stroke="#6E8CA0"
                  strokeWidth={1.5}
                  strokeOpacity={0.5}
                />
              );
            })}
          </svg>

          {graph.nodes.map((node) => {
            const pos = positionOf(node.id);
            return (
              <div
                key={node.id}
                data-testid="toukou-node"
                data-node-kind={node.kind}
                className="absolute -translate-x-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing"
                style={{ left: pos.x, top: pos.y }}
                onPointerDown={(e) => handleNodePointerDown(e, node.id)}
              >
                <NodeCard
                  node={node}
                  reported={reportedIds.has(node.id)}
                  onLike={() => void handleVote(node, 1)}
                  onDislike={() => void handleVote(node, -1)}
                  onAddSub={() => setComposerParentId(node.id)}
                  onReport={() => {
                    if (!reportedIds.has(node.id)) setReportTarget(node.id);
                  }}
                  onViewArchived={() => navigate(`/archive?main=${node.id}`)}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Offline/stale banner */}
      <div className="absolute inset-x-0 top-0 z-20">
        <StaleBanner show={stale} />
      </div>

      {/* Top bar */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between p-4">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="pointer-events-auto rounded-full border border-kamo-ink/15 bg-kamo-stone/90 px-3 py-1.5 font-ui text-xs text-kamo-ink shadow-sm backdrop-blur"
        >
          ‹ {t('mainMap.back')}
        </button>
        <div className="pointer-events-auto">
          <LanguageToggle />
        </div>
      </div>

      {/* Loading / not-found / error states */}
      {status === 'loading' && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center font-ui text-sm text-kamo-ink/60">
          {t('toukou.loading')}
        </div>
      )}
      {status === 'error' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 font-ui text-sm text-kamo-ink/70">
          {t('toukou.error')}
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-full bg-kamo-indigo px-4 py-2 text-kamo-stone"
          >
            {t('common.retry')}
          </button>
        </div>
      )}
      {status === 'notfound' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-8 text-center font-ui text-sm text-kamo-ink/60">
          {t('archive.notFound')}
          <button
            type="button"
            onClick={() => navigate('/')}
            className="rounded-full bg-kamo-indigo px-4 py-2 text-kamo-stone"
          >
            {t('mainMap.back')}
          </button>
        </div>
      )}

      {composerParentId && (
        <Composer
          mode="sub"
          activityTypes={[]}
          submitting={submitting}
          error={submitError}
          onSubmit={(result) => void handleComposerSubmit(result)}
          onCancel={() => setComposerParentId(null)}
        />
      )}

      {reportTarget && (
        <ReportDialog
          onSubmit={(reason) => void handleReportSubmit(reason)}
          onCancel={() => setReportTarget(null)}
        />
      )}
    </div>
  );
}

function applyVote(node: ToukouNode, value: 1 | -1): ToukouNode {
  const toggledOff = node.myVote === value;
  let likes = node.likes;
  let dislikes = node.dislikes;
  // Remove the previous vote's effect.
  if (node.myVote === 1) likes -= 1;
  if (node.myVote === -1) dislikes -= 1;
  // Apply the new one (unless we're toggling the same vote off).
  const nextVote = toggledOff ? null : value;
  if (nextVote === 1) likes += 1;
  if (nextVote === -1) dislikes += 1;
  return { ...node, myVote: nextVote, likes, dislikes };
}
