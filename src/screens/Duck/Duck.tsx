import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useIdentityStore } from '../../store/identityStore';
import {
  createDuckPost,
  fetchCertificate,
  fetchDuckGraph,
  fetchStampCard,
  reportDuckPost,
  subscribeToDuckPosts,
  type DuckGraph as DuckGraphData,
  type StampCardSlot,
} from '../../lib/duck';
import { cachedFetch } from '../../lib/cache';
import { LanguageToggle } from '../../components/LanguageToggle';
import { StaleBanner } from '../../components/StaleBanner';
import { StampCard } from './StampCard';
import { Certificate } from './Certificate';
import { DuckGraph } from './DuckGraph';

type Status = 'loading' | 'ready' | 'error';

/**
 * §5.7 / item 6 duck page: the 10-slot stamp card (kept) plus a toukou-style
 * graph of the 10 ducks that people post photos onto. The old flat photo feed
 * is replaced by the graph -- a photo now belongs to a specific duck.
 */
export function Duck() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const userId = useIdentityStore((s) => s.userId);

  const [status, setStatus] = useState<Status>('loading');
  const [graph, setGraph] = useState<DuckGraphData>({ nodes: [], edges: [] });
  const [slots, setSlots] = useState<StampCardSlot[]>([]);
  const [certIssuedAt, setCertIssuedAt] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [reportedIds, setReportedIds] = useState<Set<string>>(new Set());
  const [showCertificate, setShowCertificate] = useState(false);
  const [stale, setStale] = useState(false);

  const refetchGraph = useCallback(async () => {
    if (!userId) return;
    try {
      setGraph(await fetchDuckGraph(userId));
    } catch {
      /* keep the last good graph; realtime retries */
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    cachedFetch(`duck:${userId}`, () =>
      Promise.all([fetchDuckGraph(userId), fetchStampCard(userId), fetchCertificate(userId)]),
    )
      .then(({ data: [g, card, cert], stale }) => {
        if (cancelled) return;
        setGraph(g);
        setSlots(card);
        setCertIssuedAt(cert?.issuedAt ?? null);
        setStale(stale);
        setStatus('ready');
      })
      .catch(() => !cancelled && setStatus('error'));
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Realtime: new duck photos appear in the graph without a reload.
  useEffect(() => {
    if (!userId) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = subscribeToDuckPosts(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void refetchGraph(), 250);
    });
    return () => {
      if (timer) clearTimeout(timer);
      unsubscribe();
    };
  }, [userId, refetchGraph]);

  async function handleUpload(duckSpotId: string, file: File) {
    if (!userId) return;
    setUploading(true);
    try {
      await createDuckPost(userId, file, duckSpotId);
      await refetchGraph();
    } catch {
      /* swallow; the graph just won't update */
    } finally {
      setUploading(false);
    }
  }

  async function handleReport(postId: string) {
    if (!userId || reportedIds.has(postId)) return;
    setReportedIds((prev) => new Set(prev).add(postId));
    try {
      await reportDuckPost(userId, postId);
    } catch {
      /* keep it marked reported regardless */
    }
  }

  const hasCert = certIssuedAt !== null;

  return (
    <div className="flex h-full w-full flex-col bg-kamo-stone">
      <div className="flex items-center justify-between border-b border-kamo-ink/10 p-4">
        <button type="button" onClick={() => navigate('/')} className="font-ui text-xs text-kamo-ink">
          ‹ {t('mainMap.back')}
        </button>
        <LanguageToggle />
      </div>

      <StaleBanner show={stale} />

      {status === 'loading' && (
        <p className="p-4 font-ui text-sm text-kamo-ink/60">{t('duck.loading')}</p>
      )}
      {status === 'error' && (
        <div className="flex flex-col items-start gap-3 p-4">
          <p className="font-ui text-sm text-kamo-ink/60">{t('duck.error')}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-full bg-kamo-indigo px-4 py-2 font-ui text-sm text-kamo-stone"
          >
            {t('common.retry')}
          </button>
        </div>
      )}

      {status === 'ready' && (
        <>
          {/* Stamp card (kept) */}
          <div className="p-4">
            <h1 className="mb-3 font-display text-xl text-kamo-ink">{t('duck.title')}</h1>
            <StampCard
              slots={slots}
              hasCertificate={hasCert}
              onViewCertificate={() => setShowCertificate(true)}
            />
            <p className="mt-2 font-ui text-xs text-kamo-ink/50">{t('duck.graphHint')}</p>
          </div>

          {/* Duck graph fills the rest; tap a duck's + to add a photo */}
          <div className="relative flex-1 overflow-hidden border-t border-kamo-ink/10">
            <DuckGraph
              graph={graph}
              reportedIds={reportedIds}
              uploading={uploading}
              onUpload={(spotId, file) => void handleUpload(spotId, file)}
              onReport={(postId) => void handleReport(postId)}
            />
            {uploading && (
              <div className="pointer-events-none absolute inset-x-0 top-2 z-10 flex justify-center">
                <span className="rounded-full bg-kamo-ink/80 px-3 py-1 font-ui text-xs text-kamo-stone">
                  {t('duck.posting')}
                </span>
              </div>
            )}
          </div>
        </>
      )}

      {showCertificate && (
        <Certificate issuedAt={certIssuedAt} onClose={() => setShowCertificate(false)} />
      )}
    </div>
  );
}
