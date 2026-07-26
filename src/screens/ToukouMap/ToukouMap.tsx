import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useIdentityStore } from '../../store/identityStore';
import {
  clearVote,
  createMain,
  createSub,
  fetchActivityTypes,
  fetchPlaceBoard,
  getActiveEvent,
  reportContent,
  setVote,
  subscribeToToukou,
  type ActivityType,
  type KamoEvent,
  type PlaceBoard,
  type ToukouNode,
} from '../../lib/toukou';
import { cachedFetch } from '../../lib/cache';
import { LanguageToggle } from '../../components/LanguageToggle';
import { StaleBanner } from '../../components/StaleBanner';
import { NodeCard } from './NodeCard';
import { Composer, type ComposerResult } from './Composer';
import { ReportDialog, type ReportReason } from './ReportDialog';
import { useForceGraph, type GraphNode } from './useForceGraph';

const EDGE_OFFSET = 4000;
const MIN_SCALE = 0.4;
const MAX_SCALE = 2;
const FIT_PADDING = 90; // room for card size around the extreme nodes

interface ViewTransform {
  tx: number;
  ty: number;
  scale: number;
}

type Gesture =
  | { kind: 'pan'; startX: number; startY: number; startTx: number; startTy: number }
  | { kind: 'node'; id: string }
  | { kind: 'pinch'; startDist: number; startScale: number; worldX: number; worldY: number };

type ComposerState = { mode: 'main' } | { mode: 'sub'; parentId: string } | null;

const ADD_PREFIX = 'add:';

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
 * One place's board (§C1/item 7): every main happening there today, each in
 * its activity-type color with its subs orbiting in a lighter shade, plus a
 * "+" node beside each main to add a sub and a place-level "post an activity"
 * button. Reached only from a place marker (`?place=<id>`); a bare visit
 * bounces to the map.
 */
export function ToukouMap() {
  const { t, i18n } = useTranslation();
  const isJa = i18n.language.startsWith('ja');
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const placeId = searchParams.get('place');
  const userId = useIdentityStore((s) => s.userId);

  const [board, setBoard] = useState<PlaceBoard | null>(null);
  const [event, setEvent] = useState<KamoEvent | null>(null);
  const [activityTypes, setActivityTypes] = useState<ActivityType[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'notfound' | 'error'>('loading');
  const [stale, setStale] = useState(false);
  const [composer, setComposer] = useState<ComposerState>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(false);
  const [reportedIds, setReportedIds] = useState<Set<string>>(new Set());
  const [reportTarget, setReportTarget] = useState<string | null>(null);

  // Layout: the board's mains + subs, plus a synthetic "+" (addsub) node per
  // main. The full card data lives in `nodeById`; the layout only needs id+kind.
  const cards = board?.nodes ?? [];
  const nodeById = new Map(cards.map((n) => [n.id, n]));
  const mains = cards.filter((n) => n.kind === 'main');
  const layoutNodes: GraphNode[] = [
    ...cards.map((n) => ({ id: n.id, kind: n.kind })),
    ...mains.map((m) => ({ id: `${ADD_PREFIX}${m.id}`, kind: 'addsub' as const })),
  ];
  const layoutEdges = [
    ...(board?.edges ?? []),
    ...mains.map((m) => ({ source: `${ADD_PREFIX}${m.id}`, target: m.id })),
  ];

  const { positions, startDrag, drag, endDrag } = useForceGraph(layoutNodes, layoutEdges);

  const viewportRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [userView, setUserView] = useState<ViewTransform | null>(null);
  const view = userView ?? fitView(positions, size);
  const gesture = useRef<Gesture | null>(null);
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());

  // Every place marker passes ?place=; a bare /toukou visit has nowhere to go.
  useEffect(() => {
    if (!placeId) navigate('/', { replace: true });
  }, [placeId, navigate]);

  const refetchBoard = useCallback(async () => {
    if (!userId || !placeId || !event) return;
    try {
      setBoard(await fetchPlaceBoard(userId, placeId, event.id));
    } catch {
      /* keep the last good board; realtime retries on the next change */
    }
  }, [userId, placeId, event]);

  // Initial load: today's event (always live), then this place's board (cached
  // by place so it still shows offline), plus the activity types for the
  // "post an activity" composer.
  useEffect(() => {
    if (!userId || !placeId) return;
    let cancelled = false;
    (async () => {
      try {
        const ev = await getActiveEvent();
        if (cancelled) return;
        setEvent(ev);
        const res = await cachedFetch(`toukou:place:${placeId}:${userId}`, () =>
          fetchPlaceBoard(userId, placeId, ev.id),
        );
        if (cancelled) return;
        if (!res.data) {
          setStatus('notfound');
          return;
        }
        setBoard(res.data);
        setStale(res.stale);
        setStatus('ready');
      } catch {
        if (!cancelled) setStatus('error');
        return;
      }
      void fetchActivityTypes().then((v) => !cancelled && setActivityTypes(v)).catch(() => {});
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, placeId]);

  // Realtime: debounce a board refetch on any activity/vote change.
  useEffect(() => {
    if (!userId || !placeId || !event) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = subscribeToToukou(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void refetchBoard(), 250);
    });
    return () => {
      if (timer) clearTimeout(timer);
      unsubscribe();
    };
  }, [userId, placeId, event, refetchBoard]);

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

  // All pointer handling is container-level so a second finger can start a
  // pinch even when both fingers are on nodes (item 4). A single pointer on a
  // card body drags that node; on a button, nothing (the button's click
  // fires); on the background, it pans.
  function handlePointerDown(e: React.PointerEvent) {
    const target = e.target as HTMLElement;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size === 2) {
      if (gesture.current?.kind === 'node') endDrag(gesture.current.id);
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
      startDrag(nodeEl.dataset.nodeId);
    } else {
      setUserView(view);
      gesture.current = { kind: 'pan', startX: e.clientX, startY: e.clientY, startTx: view.tx, startTy: view.ty };
    }
    viewportRef.current?.setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (!g) return;

    if (g.kind === 'pinch') {
      if (pointers.current.size < 2) return;
      const { dist, midX, midY } = pinchMetrics();
      const rect = viewportRef.current!.getBoundingClientRect();
      const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, g.startScale * (dist / g.startDist)));
      setUserView({ scale, tx: midX - rect.left - cx - g.worldX * scale, ty: midY - rect.top - cy - g.worldY * scale });
    } else if (g.kind === 'pan') {
      setUserView((v) => ({
        scale: v?.scale ?? view.scale,
        tx: g.startTx + (e.clientX - g.startX),
        ty: g.startTy + (e.clientY - g.startY),
      }));
    } else {
      const world = toWorld(e.clientX, e.clientY);
      drag(g.id, world.x, world.y);
    }
  }

  function handlePointerUp(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId);
    releaseCapture(e.pointerId);
    const g = gesture.current;

    if (g?.kind === 'pinch' && pointers.current.size === 1) {
      // One finger lifted mid-pinch -> keep going as a pan with the other.
      const [rem] = [...pointers.current.values()];
      gesture.current = { kind: 'pan', startX: rem.x, startY: rem.y, startTx: view.tx, startTy: view.ty };
      return;
    }
    if (pointers.current.size === 0) {
      if (g?.kind === 'node') endDrag(g.id);
      gesture.current = null;
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
    setBoard((b) => (b ? { ...b, nodes: b.nodes.map((n) => (n.id === node.id ? applyVote(n, value) : n)) } : b));
    try {
      if (node.myVote === value) await clearVote(userId, node.id);
      else await setVote(userId, node.id, value);
    } finally {
      void refetchBoard();
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
    if (!userId || !composer || !board) return;
    setSubmitting(true);
    setSubmitError(false);
    try {
      if (composer.mode === 'main') {
        if (!result.activityTypeId || !event || !placeId) return;
        await createMain({
          authorId: userId,
          activityTypeId: result.activityTypeId,
          eventId: event.id,
          placeId,
          phrase: result.phrase,
          photoFile: result.photoFile,
          lat: board.placeLat,
          lng: board.placeLng,
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
      await refetchBoard();
    } catch {
      setSubmitError(true);
    } finally {
      setSubmitting(false);
    }
  }

  const positionOf = (id: string) => positions.get(id) ?? { x: 0, y: 0 };
  const placeName = board ? (isJa ? board.placeNameJa : board.placeNameEn) : '';

  return (
    <div className="relative h-full w-full overflow-hidden bg-kamo-stone">
      <div
        ref={viewportRef}
        className="absolute inset-0 touch-none"
        onPointerDown={handlePointerDown}
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
            {(board?.edges ?? []).map((edge) => {
              const s = positionOf(edge.source);
              const tp = positionOf(edge.target);
              return (
                <line
                  key={`${edge.source}-${edge.target}`}
                  x1={s.x + EDGE_OFFSET}
                  y1={s.y + EDGE_OFFSET}
                  x2={tp.x + EDGE_OFFSET}
                  y2={tp.y + EDGE_OFFSET}
                  stroke="#6E8CA0"
                  strokeWidth={1.5}
                  strokeOpacity={0.5}
                />
              );
            })}
          </svg>

          {layoutNodes.map((ln) => {
            const pos = positionOf(ln.id);
            if (ln.kind === 'addsub') {
              const mainId = ln.id.slice(ADD_PREFIX.length);
              const main = nodeById.get(mainId);
              return (
                <div
                  key={ln.id}
                  className="absolute -translate-x-1/2 -translate-y-1/2"
                  style={{ left: pos.x, top: pos.y }}
                >
                  <button
                    type="button"
                    data-testid="add-sub"
                    aria-label={t('toukou.addSub')}
                    onClick={() => setComposer({ mode: 'sub', parentId: mainId })}
                    className="flex h-9 w-9 items-center justify-center rounded-full text-lg font-medium text-kamo-stone shadow-md"
                    style={{ backgroundColor: main?.color ?? '#2E3A59' }}
                  >
                    +
                  </button>
                </div>
              );
            }
            const node = nodeById.get(ln.id);
            if (!node) return null;
            return (
              <div
                key={ln.id}
                data-testid="toukou-node"
                data-node-id={ln.id}
                data-node-kind={node.kind}
                className="absolute -translate-x-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing"
                style={{ left: pos.x, top: pos.y }}
              >
                <NodeCard
                  node={node}
                  reported={reportedIds.has(node.id)}
                  onLike={() => void handleVote(node, 1)}
                  onDislike={() => void handleVote(node, -1)}
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

      <div className="absolute inset-x-0 top-0 z-20">
        <StaleBanner show={stale} />
      </div>

      {/* Top bar: back + place name + language */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between gap-2 p-4">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="pointer-events-auto shrink-0 rounded-full border border-kamo-ink/15 bg-kamo-stone/90 px-3 py-1.5 font-ui text-xs text-kamo-ink shadow-sm backdrop-blur"
        >
          ‹ {t('mainMap.back')}
        </button>
        {placeName && (
          <span className="pointer-events-none truncate rounded-full bg-kamo-stone/90 px-3 py-1.5 font-display text-sm text-kamo-ink shadow-sm backdrop-blur">
            {placeName}
          </span>
        )}
        <div className="pointer-events-auto shrink-0">
          <LanguageToggle />
        </div>
      </div>

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
      {status === 'ready' && mains.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-8 text-center font-ui text-sm text-kamo-ink/60">
          {t('toukou.placeEmpty')}
        </div>
      )}

      {/* Place-level "post an activity" (the daily gathering is always live) */}
      {status === 'ready' && (
        <div className="absolute inset-x-0 bottom-0 flex justify-center p-4">
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
        </div>
      )}

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
  if (node.myVote === 1) likes -= 1;
  if (node.myVote === -1) dislikes -= 1;
  const nextVote = toggledOff ? null : value;
  if (nextVote === 1) likes += 1;
  if (nextVote === -1) dislikes += 1;
  return { ...node, myVote: nextVote, likes, dislikes };
}
