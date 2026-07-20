import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useNavigate } from 'react-router-dom';
import { useIdentityStore } from '../../store/identityStore';
import { KAMOGAWA_DELTA } from '../../lib/cesium';
import {
  clearVote,
  createMain,
  createSub,
  fetchActivityTypes,
  fetchToukouGraph,
  getActiveEvent,
  getNextEvent,
  reportContent,
  setVote,
  subscribeToToukou,
  type ActivityType,
  type KamoEvent,
  type ToukouGraph,
  type ToukouNode,
} from '../../lib/toukou';
import { LanguageToggle } from '../../components/LanguageToggle';
import { NodeCard } from './NodeCard';
import { Composer, type ComposerResult } from './Composer';
import { useForceGraph } from './useForceGraph';

const EDGE_OFFSET = 4000;
const MIN_SCALE = 0.4;
const MAX_SCALE = 2;
const FIT_PADDING = 90; // room for card size around the extreme nodes

type ComposerState = { mode: 'main' } | { mode: 'sub'; parentId: string } | null;

interface ViewTransform {
  tx: number;
  ty: number;
  scale: number;
}

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

/** Location for a new main: the visitor's position, or the Kamogawa default. */
function getCreateLocation(): Promise<{ lat: number; lng: number }> {
  const fallback = { lat: KAMOGAWA_DELTA.latitude, lng: KAMOGAWA_DELTA.longitude };
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) return resolve(fallback);
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(fallback),
      { timeout: 6000, maximumAge: 60_000 },
    );
  });
}

/** "Next gathering in Xd Yh" from the upcoming event, localized (Appendix A.1). */
function countdownLabel(next: KamoEvent | null, t: TFunction): string {
  if (!next) return t('toukou.noGathering');
  const diffMs = new Date(next.starts_at).getTime() - Date.now();
  if (diffMs <= 0) return t('toukou.nextGatheringSoon');
  const totalHours = Math.floor(diffMs / 3_600_000);
  return t('toukou.nextGathering', { days: Math.floor(totalHours / 24), hours: totalHours % 24 });
}

export function ToukouMap() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const userId = useIdentityStore((s) => s.session?.user.id ?? null);

  const [graph, setGraph] = useState<ToukouGraph>({ nodes: [], edges: [] });
  const [activityTypes, setActivityTypes] = useState<ActivityType[]>([]);
  const [activeEvent, setActiveEvent] = useState<KamoEvent | null>(null);
  const [nextEvent, setNextEvent] = useState<KamoEvent | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [composer, setComposer] = useState<ComposerState>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(false);
  const [reportedIds, setReportedIds] = useState<Set<string>>(new Set());

  const { positions, startDrag, drag, endDrag } = useForceGraph(graph.nodes, graph.edges);

  const viewportRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  // The view is *derived*: auto-fit frames the whole web to the viewport
  // (recomputed each tick as the layout settles) until the user pans / zooms /
  // drags, which sets userView and takes over. Deriving it during render (vs.
  // a setState effect) avoids cascading renders on every simulation tick.
  const [userView, setUserView] = useState<ViewTransform | null>(null);
  const view = userView ?? fitView(positions, size);
  const dragState = useRef<
    | { kind: 'pan'; startX: number; startY: number; startTx: number; startTy: number }
    | { kind: 'node'; id: string }
    | null
  >(null);

  const refetchGraph = useCallback(async () => {
    if (!userId) return;
    try {
      setGraph(await fetchToukouGraph(userId));
    } catch {
      /* keep the last good graph; realtime will retry on the next change */
    }
  }, [userId]);

  // Initial load.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      try {
        const [g, types, active, next] = await Promise.all([
          fetchToukouGraph(userId),
          fetchActivityTypes(),
          getActiveEvent(),
          getNextEvent(),
        ]);
        if (cancelled) return;
        setGraph(g);
        setActivityTypes(types);
        setActiveEvent(active);
        setNextEvent(next);
        setStatus('ready');
      } catch {
        if (!cancelled) setStatus('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Realtime: debounce a whole-graph refetch on any activity/vote change.
  useEffect(() => {
    if (!userId) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = subscribeToToukou(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void refetchGraph(), 250);
    });
    return () => {
      if (timer) clearTimeout(timer);
      unsubscribe();
    };
  }, [userId, refetchGraph]);

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

  function handlePointerDownBackground(e: React.PointerEvent) {
    setUserView(view); // freeze the current frame; the user is taking control
    dragState.current = {
      kind: 'pan',
      startX: e.clientX,
      startY: e.clientY,
      startTx: view.tx,
      startTy: view.ty,
    };
    viewportRef.current?.setPointerCapture(e.pointerId);
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
    const d = dragState.current;
    if (!d) return;
    if (d.kind === 'pan') {
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
    const d = dragState.current;
    if (d?.kind === 'node') endDrag(d.id);
    dragState.current = null;
    viewportRef.current?.releasePointerCapture(e.pointerId);
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

  async function handleReport(node: ToukouNode) {
    if (!userId || reportedIds.has(node.id)) return;
    setReportedIds((prev) => new Set(prev).add(node.id));
    try {
      await reportContent(userId, 'activity', node.id);
    } catch {
      /* leave it marked reported in the UI regardless */
    }
  }

  async function handleComposerSubmit(result: ComposerResult) {
    if (!userId || !composer) return;
    setSubmitting(true);
    setSubmitError(false);
    try {
      if (composer.mode === 'main') {
        if (!result.activityTypeId || !activeEvent) return;
        const loc = await getCreateLocation();
        await createMain({
          authorId: userId,
          activityTypeId: result.activityTypeId,
          eventId: activeEvent.id,
          phrase: result.phrase,
          photoFile: result.photoFile,
          lat: loc.lat,
          lng: loc.lng,
        });
      } else {
        await createSub({
          authorId: userId,
          parentId: composer.parentId,
          phrase: result.phrase,
          photoFile: result.photoFile,
        });
      }
      setComposer(null);
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
                  onAddSub={() => setComposer({ mode: 'sub', parentId: node.id })}
                  onReport={() => void handleReport(node)}
                  onViewArchived={() => navigate(`/archive?main=${node.id}`)}
                />
              </div>
            );
          })}
        </div>
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

      {/* Empty / loading / error states */}
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
      {status === 'ready' && graph.nodes.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-8 text-center font-ui text-sm text-kamo-ink/60">
          {t('toukou.empty')}
        </div>
      )}

      {/* Bottom bar: event-gated create-main, or the next-gathering countdown */}
      <div className="absolute inset-x-0 bottom-0 flex justify-center p-4">
        {activeEvent ? (
          <button
            type="button"
            onClick={() => {
              setSubmitError(false);
              setComposer({ mode: 'main' });
            }}
            className="rounded-full bg-kamo-indigo px-5 py-2.5 font-ui text-sm font-medium text-kamo-stone shadow-lg"
          >
            + {t('toukou.createMain')}
          </button>
        ) : (
          <div className="rounded-full bg-kamo-sand/90 px-4 py-2 font-ui text-xs text-kamo-ink shadow-sm backdrop-blur">
            {countdownLabel(nextEvent, t)}
          </div>
        )}
      </div>

      {composer && (
        <Composer
          mode={composer.mode}
          activityTypes={activityTypes}
          submitting={submitting}
          error={submitError}
          onSubmit={(result) => void handleComposerSubmit(result)}
          onCancel={() => setComposer(null)}
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
