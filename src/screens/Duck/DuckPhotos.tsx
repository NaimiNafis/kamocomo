import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useIdentityStore } from '../../store/identityStore';
import {
  clearDuckVote,
  collectDuckByPhoto,
  fetchDuckGraph,
  fetchDuckPostDetail,
  fetchDuckSpotCoordsById,
  setDuckVote,
  subscribeToDuckPosts,
  type DuckGraph,
  type DuckNode,
  type DuckPostDetail,
} from '../../lib/duck';
import { TEST_MODE_KEY } from '../../lib/entryFlags';
import { LanguageToggle } from '../../components/LanguageToggle';
import { BackIcon } from '../../components/icons';
import { NodeDetail } from '../ToukouMap/NodeDetail';
import { DuckBoard } from './DuckBoard';
import { DuckSheet } from './DuckSheet';

/**
 * Everyone's duck photos, as a board (§C1-style): each duck a main node with
 * the photos people have shared of it orbiting.
 *
 * Secondary to the collection sheet by design — `/duck` is the stamp sheet, and
 * this is where you go to see what everyone else found. It carries the toukou
 * board's interactions: hold a photo for the whole thing plus who took it and
 * when, and vote on it there.
 */
export function DuckPhotos() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const userId = useIdentityStore((s) => s.userId);

  const [graph, setGraph] = useState<DuckGraph | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Whatever is held open: a photo (its detail is fetched) or a duck (all the
  // sheet needs is already on the node).
  const [openId, setOpenId] = useState<string | null>(null);
  const [photoDetail, setPhotoDetail] = useState<DuckPostDetail | null>(null);

  const photoInputRef = useRef<HTMLInputElement>(null);
  const pendingSpotRef = useRef<string | null>(null);

  const refetch = useCallback(async () => {
    if (!userId) return;
    try {
      setGraph(await fetchDuckGraph(userId));
    } catch {
      /* keep the last good board */
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    fetchDuckGraph(userId)
      .then((g) => {
        if (cancelled) return;
        setGraph(g);
        setStatus('ready');
      })
      .catch(() => !cancelled && setStatus('error'));
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Someone else sharing a photo should show up without a reload.
  useEffect(() => {
    if (!userId) return;
    const unsubscribe = subscribeToDuckPosts(() => void refetch());
    return unsubscribe;
  }, [userId, refetch]);

  const openNode: DuckNode | undefined = openId
    ? graph?.nodes.find((n) => n.id === openId)
    : undefined;

  // A held photo needs its author and date fetched; a held duck doesn't.
  useEffect(() => {
    if (!openId || !openNode || openNode.kind !== 'sub') return;
    let cancelled = false;
    fetchDuckPostDetail(openId, openNode.color)
      .then((d) => {
        if (cancelled) return;
        if (d) setPhotoDetail(d);
        else setOpenId(null);
      })
      .catch(() => !cancelled && setOpenId(null));
    return () => {
      cancelled = true;
    };
  }, [openId, openNode]);

  function pickPhotoFor(spotId: string) {
    pendingSpotRef.current = spotId;
    photoInputRef.current?.click();
  }

  async function handlePhotoChosen(file: File | undefined) {
    const spotId = pendingSpotRef.current;
    pendingSpotRef.current = null;
    if (photoInputRef.current) photoInputRef.current.value = '';
    if (!file || !spotId || !userId) return;

    setBusy(true);
    setNotice(null);
    setOpenId(null);
    try {
      const testMode = localStorage.getItem(TEST_MODE_KEY) === 'true';
      const override = testMode ? ((await fetchDuckSpotCoordsById(spotId)) ?? undefined) : undefined;
      const result = await collectDuckByPhoto(userId, file, spotId, override);
      if (result.status !== 'posted') {
        setNotice(t('collection.postFailed'));
      } else if (result.collected) {
        setNotice(result.already ? t('collection.alreadyHad') : t('collection.justCollected'));
      } else {
        // The photo is on the board either way -- say why the stamp didn't come.
        setNotice(
          result.distance === null
            ? t('collection.needLocation')
            : t('collection.tooFar', { distance: result.distance }),
        );
      }
      await refetch();
    } catch {
      setNotice(t('collection.postFailed'));
    } finally {
      setBusy(false);
    }
  }

  async function handleVote(node: DuckNode, value: 1 | -1) {
    if (!userId) return;
    // Applied locally first so the sheet responds to the tap, not to the round
    // trip; the refetch afterwards is what makes it true.
    setGraph((g) =>
      g ? { ...g, nodes: g.nodes.map((n) => (n.id === node.id ? applyVote(n, value) : n)) } : g,
    );
    try {
      if (node.myVote === value) await clearDuckVote(userId, node.id);
      else await setDuckVote(userId, node.id, value);
    } finally {
      void refetch();
    }
  }

  return (
    <div className="relative h-full w-full overflow-hidden bg-kamo-stone">
      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => void handlePhotoChosen(e.target.files?.[0])}
      />

      {status === 'ready' && graph && (
        <DuckBoard
          graph={graph}
          busy={busy}
          openId={openId}
          onCapture={pickPhotoFor}
          onOpen={setOpenId}
        />
      )}

      {/* Top bar: back to the sheet, title, language */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between gap-2 p-4">
        <button
          type="button"
          onClick={() => navigate('/duck')}
          aria-label={t('mainMap.back')}
          className="pointer-events-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-kamo-ink/15 bg-kamo-stone/90 text-kamo-ink shadow-sm backdrop-blur"
        >
          <BackIcon size={18} />
        </button>
        <span className="pointer-events-none truncate rounded-full bg-kamo-stone/90 px-3 py-1.5 font-display text-sm text-kamo-ink shadow-sm backdrop-blur">
          {t('collection.everyonesPhotos')}
        </span>
        <div className="pointer-events-auto shrink-0">
          <LanguageToggle />
        </div>
      </div>

      {notice && (
        <div className="absolute inset-x-0 top-16 z-30 mx-4 flex items-center justify-between gap-2 rounded-xl bg-kamo-indigo px-4 py-2 shadow-lg">
          <span className="font-ui text-sm text-kamo-stone">{notice}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            aria-label={t('common.close')}
            className="shrink-0 font-ui text-sm text-kamo-stone/80"
          >
            ✕
          </button>
        </div>
      )}

      {status === 'loading' && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center font-ui text-sm text-kamo-ink/60">
          {t('collection.loading')}
        </div>
      )}
      {status === 'error' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 font-ui text-sm text-kamo-ink/70">
          {t('collection.error')}
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-full bg-kamo-indigo px-4 py-2 text-kamo-stone"
          >
            {t('common.retry')}
          </button>
        </div>
      )}

      {/* Held a photo: the same sheet the toukou board opens. */}
      {openNode?.kind === 'sub' && photoDetail && photoDetail.id === openId && (
        <NodeDetail
          detail={photoDetail}
          node={openNode}
          onLike={() => void handleVote(openNode, 1)}
          onDislike={() => void handleVote(openNode, -1)}
          onClose={() => setOpenId(null)}
        />
      )}

      {/* Held a duck: your stamp for it, or an invitation to go and get one. */}
      {openNode?.kind === 'main' && (
        <DuckSheet
          node={openNode}
          photoCount={graph?.nodes.filter((n) => n.parentId === openNode.id).length ?? 0}
          busy={busy}
          onCapture={() => pickPhotoFor(openNode.id)}
          onClose={() => setOpenId(null)}
        />
      )}
    </div>
  );
}

/** Mirrors `applyVote` in ToukouMap -- toggling off your own vote clears it. */
function applyVote(node: DuckNode, value: 1 | -1): DuckNode {
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
