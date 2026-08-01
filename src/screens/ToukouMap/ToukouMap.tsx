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
  setVote,
  subscribeToToukou,
  type ActivityType,
  type KamoEvent,
  type PlaceBoard,
  type ToukouNode,
} from '../../lib/toukou';
import { createDuckPost } from '../../lib/duck';
import { duckIconDataUri } from '../../lib/ducks';
import { cachedFetch } from '../../lib/cache';
import { LanguageToggle } from '../../components/LanguageToggle';
import { StaleBanner } from '../../components/StaleBanner';
import { NodeCard } from './NodeCard';
import { AddCard } from './AddCard';
import { Composer, type ComposerResult } from './Composer';
import { RecenterIcon } from '../../components/icons';
import { useForceGraph, type GraphNode } from './useForceGraph';
import { useGraphViewport } from './useGraphViewport';

const EDGE_OFFSET = 4000;
const ADD_PREFIX = 'add:';
// The duck and its photos share the graph with the activities, so their ids
// are namespaced — an activity id and a duck_post id could otherwise collide
// in the same position map.
const DUCK_ID = 'duck';
const DUCK_PHOTO_PREFIX = 'duckphoto:';

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
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  // Layout: two kinds of cluster, deliberately NOT wired to each other. The
  // duck sits with its own shared photos, and each main activity sits with its
  // own subs. Stringing every main to the duck (as this first did) made one
  // tangled hairball where the duck looked like the parent of activities it has
  // nothing to do with. The full card data lives in `nodeById`; the layout only
  // needs id+kind.
  const cards = board?.nodes ?? [];
  const nodeById = new Map(cards.map((n) => [n.id, n]));
  const mains = cards.filter((n) => n.kind === 'main');
  const duck = board?.duck ?? null;
  const duckPhotos = duck?.photos ?? [];

  const layoutNodes: GraphNode[] = [
    ...(duck ? [{ id: DUCK_ID, kind: 'main' as const }] : []),
    ...cards.map((n) => ({ id: n.id, kind: n.kind })),
    ...mains.map((m) => ({ id: `${ADD_PREFIX}${m.id}`, kind: 'addsub' as const })),
    ...duckPhotos.map((p) => ({ id: `${DUCK_PHOTO_PREFIX}${p.id}`, kind: 'sub' as const })),
    ...(duck ? [{ id: `${ADD_PREFIX}${DUCK_ID}`, kind: 'addsub' as const }] : []),
  ];
  const layoutEdges = [
    ...(board?.edges ?? []),
    ...mains.map((m) => ({ source: `${ADD_PREFIX}${m.id}`, target: m.id })),
    ...(duck
      ? [
          ...duckPhotos.map((p) => ({ source: `${DUCK_PHOTO_PREFIX}${p.id}`, target: DUCK_ID })),
          { source: `${ADD_PREFIX}${DUCK_ID}`, target: DUCK_ID },
        ]
      : []),
  ];

  const { positions, startDrag, drag, endDrag } = useForceGraph(layoutNodes, layoutEdges);
  const { viewportRef, cx, cy, view, resetView, containerHandlers } = useGraphViewport(positions, {
    startDrag,
    drag,
    endDrag,
  });

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

  /** Post a photo onto this place's duck — the same thing the duck page's "+"
   * did, now that the duck lives at the centre of this board. */
  async function handlePhotoChosen(file: File | undefined) {
    if (photoInputRef.current) photoInputRef.current.value = '';
    if (!file || !userId || !duck) return;
    setUploadingPhoto(true);
    try {
      await createDuckPost(userId, file, duck.id);
      await refetchBoard();
    } catch {
      /* swallow; the board just won't gain the photo */
    } finally {
      setUploadingPhoto(false);
    }
  }

  const positionOf = (id: string) => positions.get(id) ?? { x: 0, y: 0 };
  const placeName = board ? (isJa ? board.placeNameJa : board.placeNameEn) : '';

  return (
    <div className="relative h-full w-full overflow-hidden bg-kamo-stone">
      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => void handlePhotoChosen(e.target.files?.[0])}
      />
      <div ref={viewportRef} className="absolute inset-0 touch-none" {...containerHandlers}>
        <div
          className="absolute left-0 top-0 origin-top-left"
          style={{ transform: `translate(${cx + view.tx}px, ${cy + view.ty}px) scale(${view.scale})` }}
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
            const wrap = (children: React.ReactNode, extra?: string) => (
              <div
                key={ln.id}
                className={`absolute -translate-x-1/2 -translate-y-1/2 ${extra ?? ''}`}
                style={{ left: pos.x, top: pos.y }}
              >
                {children}
              </div>
            );

            // The duck at the centre.
            if (ln.id === DUCK_ID && duck) {
              return wrap(
                <div
                  className="flex w-32 flex-col items-center gap-1 rounded-2xl px-2 py-3 shadow-lg"
                  style={{ backgroundColor: duck.color, color: readableOn(duck.color) }}
                >
                  <img
                    src={duckIconDataUri(duck.color)}
                    alt=""
                    className="h-14 w-14"
                    draggable={false}
                  />
                  <span className="line-clamp-1 text-center font-display text-sm">
                    {isJa ? duck.nameJa : duck.nameEn}
                  </span>
                  <span className="font-ui text-[10px] opacity-80">
                    {duck.earned ? `✓ ${t('duck.stamped')}` : t('duck.notStamped')}
                  </span>
                </div>,
              );
            }

            // One of the duck's shared photos.
            if (ln.id.startsWith(DUCK_PHOTO_PREFIX)) {
              const photo = duckPhotos.find(
                (p) => p.id === ln.id.slice(DUCK_PHOTO_PREFIX.length),
              );
              if (!photo) return null;
              return wrap(
                <div
                  className="w-24 overflow-hidden rounded-2xl shadow-lg"
                  style={{ backgroundColor: duck?.color }}
                >
                  <img
                    src={photo.photoUrl}
                    alt=""
                    className="block aspect-square w-full object-cover"
                    draggable={false}
                  />
                </div>,
                'cursor-grab active:cursor-grabbing',
              );
            }

            if (ln.kind === 'addsub') {
              const targetId = ln.id.slice(ADD_PREFIX.length);
              // The duck's "+" adds a photo; a main's "+" adds a sub.
              if (targetId === DUCK_ID) {
                return wrap(
                  <AddCard
                    color={duck?.color ?? '#E0885E'}
                    label={t('duck.addPhoto')}
                    testId="duck-add"
                    disabled={uploadingPhoto}
                    onClick={() => photoInputRef.current?.click()}
                  />,
                );
              }
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
                <NodeCard
                  node={node}
                  onLike={() => void handleVote(node, 1)}
                  onDislike={() => void handleVote(node, -1)}
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
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-2 p-4">
          {/* The pan clamp stops you leaving the graph behind; this puts it all
              back in frame in one tap when you've wandered. */}
          <button
            type="button"
            onClick={resetView}
            aria-label={t('toukou.recenter')}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-kamo-ink/15 bg-kamo-stone/90 text-kamo-ink shadow-lg backdrop-blur"
          >
            <RecenterIcon />
          </button>
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
          onTypeCreated={(type) => setActivityTypes((prev) => [...prev, type])}
          submitting={submitting}
          error={submitError}
          onSubmit={(result) => void handleComposerSubmit(result)}
          onCancel={() => setComposer(null)}
        />
      )}

    </div>
  );
}

/** Dark or light text depending on the background's luminance, so the duck's
 * name stays legible on both the pale and the saturated duck colors. */
function readableOn(hex: string): string {
  const v = hex.replace('#', '');
  const r = parseInt(v.slice(0, 2), 16);
  const g = parseInt(v.slice(2, 4), 16);
  const b = parseInt(v.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? '#1C1C1A' : '#E9E4D8';
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
