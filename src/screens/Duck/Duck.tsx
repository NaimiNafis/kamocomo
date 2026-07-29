import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
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
import { DUCK_SCAN_RESULT_KEY, TEST_MODE_KEY, type StashedScanResult } from '../../lib/entryFlags';
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
  const { t, i18n } = useTranslation();
  const isJa = i18n.language.startsWith('ja');
  const navigate = useNavigate();
  const userId = useIdentityStore((s) => s.userId);

  const [status, setStatus] = useState<Status>('loading');
  const [graph, setGraph] = useState<DuckGraphData>({ nodes: [], edges: [] });
  const [slots, setSlots] = useState<StampCardSlot[]>([]);
  const [certIssuedAt, setCertIssuedAt] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [reportedIds, setReportedIds] = useState<Set<string>>(new Set());
  const [showCertificate, setShowCertificate] = useState(false);
  const [showStampCard, setShowStampCard] = useState(false);
  const [stale, setStale] = useState(false);
  // A duck-QR scan collects the stamp before routing here (item 3) and stashes
  // its result. Read it once on mount (lazy init, so it survives StrictMode's
  // double-mount); the effect below clears the stash without a setState.
  const [scanBanner, setScanBanner] = useState<StashedScanResult | null>(() => {
    const raw = sessionStorage.getItem(DUCK_SCAN_RESULT_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as StashedScanResult;
    } catch {
      return null;
    }
  });
  const [testMode, setTestMode] = useState(() => localStorage.getItem(TEST_MODE_KEY) === 'true');

  useEffect(() => {
    if (scanBanner) sessionStorage.removeItem(DUCK_SCAN_RESULT_KEY);
    // Clear the one-shot stash after it's been read into state (runs once).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleTestMode() {
    setTestMode((prev) => {
      const next = !prev;
      localStorage.setItem(TEST_MODE_KEY, String(next));
      return next;
    });
  }

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
  const earned = slots.filter((s) => s.earned).length;

  return (
    <div className="flex h-full w-full flex-col bg-kamo-stone">
      <div className="flex items-center justify-between gap-2 border-b border-kamo-ink/10 p-4">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="shrink-0 font-ui text-xs text-kamo-ink"
        >
          ‹ {t('mainMap.back')}
        </button>
        <span className="truncate font-display text-base text-kamo-ink">{t('duck.title')}</span>
        <div className="shrink-0">
          <LanguageToggle />
        </div>
      </div>

      <StaleBanner show={stale} />

      {scanBanner && (
        <div className="flex items-center justify-between gap-2 bg-kamo-sunset/90 px-4 py-2">
          <span className="font-ui text-sm text-kamo-stone">
            {scanBannerText(scanBanner, isJa, t)}
          </span>
          <button
            type="button"
            onClick={() => setScanBanner(null)}
            aria-label={t('common.close')}
            className="shrink-0 font-ui text-sm text-kamo-stone/80"
          >
            ✕
          </button>
        </div>
      )}

      <button
        type="button"
        onClick={toggleTestMode}
        aria-pressed={testMode}
        className="mx-4 mt-3 flex items-center justify-between gap-2 rounded-full border border-kamo-ink/15 bg-kamo-sand/40 px-3 py-1.5 font-ui text-xs text-kamo-ink/70"
      >
        {t('duck.testMode')}
        <span
          className="flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors"
          style={{ backgroundColor: testMode ? '#2E3A59' : 'rgba(28,28,26,0.2)' }}
        >
          <span
            className="h-4 w-4 rounded-full bg-kamo-stone transition-transform"
            style={{ transform: testMode ? 'translateX(16px)' : 'translateX(0)' }}
          />
        </span>
      </button>

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
        // The duck graph fills the screen; tap a duck's + to add a photo. The
        // stamp card lives behind the floating button (opens a centered popup).
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
          <div className="pointer-events-none absolute inset-x-0 bottom-4 z-10 flex justify-center px-4">
            <button
              type="button"
              onClick={() => setShowStampCard(true)}
              className="pointer-events-auto flex items-center gap-2 rounded-full bg-kamo-indigo px-5 py-2.5 font-ui text-sm font-medium text-kamo-stone shadow-lg"
            >
              <span aria-hidden>🦆</span>
              {t('duck.stampButton')} · {earned}/10
            </button>
          </div>
        </div>
      )}

      {showStampCard && (
        <div
          className="absolute inset-0 z-40 flex items-center justify-center bg-kamo-ink/50 p-4"
          onClick={() => setShowStampCard(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-kamo-stone p-3 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <StampCard
              slots={slots}
              hasCertificate={hasCert}
              onViewCertificate={() => setShowCertificate(true)}
            />
            <button
              type="button"
              onClick={() => setShowStampCard(false)}
              className="mx-auto mt-3 block rounded-full border border-kamo-ink/20 px-4 py-1.5 font-ui text-sm text-kamo-ink"
            >
              {t('common.close')}
            </button>
          </div>
        </div>
      )}

      {showCertificate && (
        <Certificate issuedAt={certIssuedAt} onClose={() => setShowCertificate(false)} />
      )}
    </div>
  );
}

function scanBannerText(r: StashedScanResult, isJa: boolean, t: TFunction): string {
  const name = isJa ? r.spotNameJa : r.spotNameEn;
  switch (r.status) {
    case 'collected':
      return `${t('scan.collected')} · ${name}`;
    case 'already':
      return `${t('scan.alreadyCollected')} · ${name}`;
    case 'too_far':
      return t('scan.tooFarDetail', { distance: r.distance });
    case 'location':
      return t('scan.locationNeeded');
    default:
      return t('scan.notFound');
  }
}
