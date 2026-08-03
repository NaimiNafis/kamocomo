import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useIdentityStore } from '../../store/identityStore';
import {
  clearVote,
  createMain,
  createSub,
  fetchActivityDetail,
  fetchActivityTypes,
  fetchPlaceBoard,
  getActiveEvent,
  setVote,
  subscribeToToukou,
  type ActivityDetail,
  type ActivityType,
  type KamoEvent,
  type PlaceBoard,
  type ToukouNode,
} from '../../lib/toukou';
import { cachedFetch } from '../../lib/cache';
import { LanguageToggle } from '../../components/LanguageToggle';
import { StaleBanner } from '../../components/StaleBanner';
import { NodeCard } from './NodeCard';
import { NodeDetail } from './NodeDetail';
import { OffscreenMains } from './OffscreenMains';
import { driftStyle } from './drift';
import { AddCard } from './AddCard';
import { Composer, type ComposerResult } from './Composer';
import { BackIcon, RecenterIcon } from '../../components/icons';
import { useForceGraph, type GraphNode } from './useForceGraph';
import { useGraphViewport } from './useGraphViewport';

const EDGE_OFFSET = 4000;
const ADD_PREFIX = 'add:';


type ComposerState = { mode: 'main' } | { mode: 'sub'; parentId: string } | null;

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
  // The long-press sheet. `detailId` is set the instant the hold fires so the
  // held card can dim straight away, and the fetched post arrives after.
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ActivityDetail | null>(null);

  // Layout: one cluster per main activity -- the main, its subs, and a "+" to
  // add another. The full card data lives in `nodeById`; the layout only needs
  // id+kind.
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

  // Where the opening glide lands: the main that drew the most people. On a
  // board you've never seen, the busiest cluster is the most useful thing to be
  // shown first -- and it's stable, so returning to a place lands you in the
  // same spot rather than somewhere arbitrary.
  const busiestMain = mains.reduce<ToukouNode | null>(
    (best, m) => (!best || m.subCount > best.subCount ? m : best),
    null,
  );

  const { positions, startDrag, drag, endDrag } = useForceGraph(layoutNodes, layoutEdges);
  const {
    viewportRef,
    size,
    cx,
    cy,
    view,
    resetView,
    atFitView,
    focusOn,
    pressedId,
    containerHandlers,
  } = useGraphViewport(
      positions,
      { startDrag, drag, endDrag },
      { focusId: busiestMain?.id, onLongPress: (id) => setDetailId(id) },
    );

  // Every place marker passes ?place=; a bare /toukou visit has nowhere to go.
  useEffect(() => {
    if (!placeId) navigate('/', { replace: true });
  }, [placeId, navigate]);

  const refetchBoard = useCallback(async () => {
    if (!userId || !placeId) return;
    try {
      setBoard(await fetchPlaceBoard(userId, placeId));
    } catch {
      /* keep the last good board; realtime retries on the next change */
    }
  }, [userId, placeId]);

  // Initial load: this place's board (all its activities, not just today's --
  // cached by place so it still shows offline). The active event is loaded
  // separately, best-effort, only for the "post an activity" composer.
  useEffect(() => {
    if (!userId || !placeId) return;
    let cancelled = false;
    (async () => {
      void getActiveEvent().then((ev) => !cancelled && setEvent(ev)).catch(() => {});
      try {
        const res = await cachedFetch(`toukou:place:${placeId}:${userId}`, () =>
          fetchPlaceBoard(userId, placeId),
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
      void fetchActivityTypes(userId).then((v) => !cancelled && setActivityTypes(v)).catch(() => {});
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

  // Held a card: pull the full post. A failure just closes the sheet again --
  // it's an extra look at something already on screen, so an error state here
  // would be more interruption than the feature is worth.
  useEffect(() => {
    if (!detailId) return;
    let cancelled = false;
    fetchActivityDetail(detailId)
      .then((d) => {
        if (cancelled) return;
        if (d) setDetail(d);
        else setDetailId(null);
      })
      .catch(() => !cancelled && setDetailId(null));
    return () => {
      cancelled = true;
    };
  }, [detailId]);

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
      <div ref={viewportRef} className="kamo-board absolute inset-0 touch-none" {...containerHandlers}>
        <div
          className="absolute left-0 top-0 origin-top-left"
          style={{
            // No CSS transition here on purpose: the opening glide is
            // interpolated in the hook, and easing this would also lag every
            // drag behind the finger.
            transform: `translate(${cx + view.tx}px, ${cy + view.ty}px) scale(${view.scale})`,
          }}
        >
          <svg
            className="pointer-events-none absolute overflow-visible"
            style={{ left: -EDGE_OFFSET, top: -EDGE_OFFSET, width: EDGE_OFFSET * 2, height: EDGE_OFFSET * 2 }}
          >
            {/* Every node -- subs and the add card -- gets a string to its main. */}
            {layoutEdges.map((edge) => {
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
            // `data-node-id` is what useGraphViewport looks for to start a
            // node drag -- without it a pointer-down here falls through to
            // panning the whole board, which is why the duck and its photos
            // couldn't be moved. Add cards are <button>s, and the handler
            // short-circuits on those, so they still click rather than drag.
            const wrap = (children: React.ReactNode, extra?: string) => (
              <div
                key={ln.id}
                data-node-id={ln.id}
                className={`absolute -translate-x-1/2 -translate-y-1/2 ${extra ?? ''}`}
                style={{ left: pos.x, top: pos.y }}
              >
                <div className="kamo-drift" style={driftStyle(ln.id)}>{children}</div>
              </div>
            );

            if (ln.kind === 'addsub') {
              const targetId = ln.id.slice(ADD_PREFIX.length);
              const main = nodeById.get(targetId);
              return wrap(
                <AddCard
                  color={main?.color ?? '#2E3A59'}
                  label={t('toukou.addSub')}
                  testId="add-sub"
                  onClick={() => setComposer({ mode: 'sub', parentId: targetId })}
                />,
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
                <div className="kamo-drift" style={driftStyle(ln.id)}>
                  <NodeCard
                    node={node}
                    pressed={pressedId === node.id}
                    dimmed={detailId === node.id}
                    onLike={() => void handleVote(node, 1)}
                    onDislike={() => void handleVote(node, -1)}
                    onViewArchived={() => navigate(`/archive?main=${node.id}`)}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Off-screen mains, as tappable markers on the edge of the frame. */}
      {status === 'ready' && !detailId && (
        <div className="pointer-events-none absolute inset-0">
          <OffscreenMains
            mains={mains}
            positions={positions}
            view={view}
            size={size}
            onSelect={focusOn}
          />
        </div>
      )}

      <div className="absolute inset-x-0 top-0 z-20">
        <StaleBanner show={stale} />
      </div>

      {/* Top bar: back + place name + language */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between gap-2 p-4">
        {/* The chevron alone: "back" is the most universally understood control
            on a phone, and the words were the longest string in the bar. */}
        <button
          type="button"
          onClick={() => navigate('/')}
          aria-label={t('mainMap.back')}
          className="pointer-events-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-kamo-ink/15 bg-kamo-stone/90 text-kamo-ink shadow-sm backdrop-blur"
        >
          <BackIcon size={18} />
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

      {/* Press-and-hold has no affordance of its own, so the board says so
          once, quietly, and only while there's something to hold. */}
      {status === 'ready' && mains.length > 0 && !detailId && (
        <p className="pointer-events-none absolute inset-x-0 bottom-[4.5rem] text-center font-ui text-[11px] text-kamo-ink/45">
          {t('toukou.holdHint')}
        </p>
      )}

      {/* Place-level "post an activity" (the daily gathering is always live) */}
      {status === 'ready' && (
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-2 p-4">
          {/* Says what it does, and only turns up once there's something to
              undo. An icon-only circle sitting there permanently read as
              decoration -- people didn't know what it was for until they'd
              already got lost, which is the one moment it can't explain
              itself. Appearing the instant you move is the explanation. */}
          {!atFitView && (
            <button
              type="button"
              onClick={resetView}
              className="flex shrink-0 items-center gap-1.5 rounded-full border border-kamo-ink/15 bg-kamo-stone/90 py-2.5 pl-3 pr-4 font-ui text-sm font-medium text-kamo-ink shadow-lg backdrop-blur transition-transform duration-150 active:scale-[0.97]"
              style={{ animation: 'fadeIn 220ms ease-out' }}
            >
              <RecenterIcon size={16} />
              {t('toukou.recenter')}
            </button>
          )}
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

      {/* Matched on id rather than cleared on close, so a stale post can never
          flash when the next card is held. */}
      {detail && detail.id === detailId && (
        <NodeDetail
          detail={detail}
          node={nodeById.get(detail.id)}
          onLike={() => {
            const n = nodeById.get(detail.id);
            if (n) void handleVote(n, 1);
          }}
          onDislike={() => {
            const n = nodeById.get(detail.id);
            if (n) void handleVote(n, -1);
          }}
          onClose={() => setDetailId(null)}
        />
      )}

      {composer && (
        <Composer
          mode={composer.mode}
          activityTypes={activityTypes}
          onTypeCreated={(type) => setActivityTypes((prev) => [...prev, type])}
          onTypeRemoved={(id) => setActivityTypes((prev) => prev.filter((x) => x.id !== id))}
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
  if (node.myVote === 1) likes -= 1;
  if (node.myVote === -1) dislikes -= 1;
  const nextVote = toggledOff ? null : value;
  if (nextVote === 1) likes += 1;
  if (nextVote === -1) dislikes += 1;
  return { ...node, myVote: nextVote, likes, dislikes };
}
