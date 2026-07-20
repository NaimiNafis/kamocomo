import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useIdentityStore } from '../../store/identityStore';
import {
  createDuckPost,
  fetchCertificate,
  fetchDuckPosts,
  fetchStampCard,
  reportDuckPost,
  type DuckPost,
  type StampCardSlot,
} from '../../lib/duck';
import { cachedFetch } from '../../lib/cache';
import { LanguageToggle } from '../../components/LanguageToggle';
import { StaleBanner } from '../../components/StaleBanner';
import { StampCard } from './StampCard';
import { Certificate } from './Certificate';

type Status = 'loading' | 'ready' | 'error';

/** §5.7 duck page: the cookpad-style photo feed (social, hidden-filtered) plus
 * the stamp card and, once complete, the certificate. */
export function Duck() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const userId = useIdentityStore((s) => s.userId);

  const [status, setStatus] = useState<Status>('loading');
  const [posts, setPosts] = useState<DuckPost[]>([]);
  const [slots, setSlots] = useState<StampCardSlot[]>([]);
  const [certIssuedAt, setCertIssuedAt] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const [reportedIds, setReportedIds] = useState<Set<string>>(new Set());
  const [showCertificate, setShowCertificate] = useState(false);
  const [stale, setStale] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    cachedFetch(`duck:${userId}`, () =>
      Promise.all([fetchDuckPosts(), fetchStampCard(userId), fetchCertificate(userId)]),
    )
      .then(({ data: [feed, card, cert], stale }) => {
        if (cancelled) return;
        setPosts(feed);
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

  async function handlePhotoChosen(file: File | undefined) {
    if (!file || !userId) return;
    setPosting(true);
    try {
      await createDuckPost(userId, file);
      setPosts(await fetchDuckPosts());
    } catch {
      /* swallow; the feed just won't update */
    } finally {
      setPosting(false);
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
    <div className="h-full w-full overflow-y-auto bg-kamo-stone">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-kamo-ink/10 bg-kamo-stone/95 p-4 backdrop-blur">
        <button type="button" onClick={() => navigate('/')} className="font-ui text-xs text-kamo-ink">
          ‹ {t('mainMap.back')}
        </button>
        <LanguageToggle />
      </div>

      <StaleBanner show={stale} />

      <div className="p-4">
        <h1 className="mb-3 font-display text-xl text-kamo-ink">{t('duck.title')}</h1>

        {status === 'loading' && <p className="font-ui text-sm text-kamo-ink/60">{t('duck.loading')}</p>}
        {status === 'error' && (
          <div className="flex flex-col items-start gap-3">
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
            <StampCard
              slots={slots}
              hasCertificate={hasCert}
              onViewCertificate={() => setShowCertificate(true)}
            />
            <p className="mt-2 font-ui text-xs text-kamo-ink/50">{t('duck.stampHint')}</p>

            <div className="mt-6 flex items-center justify-between">
              <h2 className="font-display text-base text-kamo-ink">{t('duck.feedTab')}</h2>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => void handlePhotoChosen(e.target.files?.[0])}
              />
              <button
                type="button"
                disabled={posting}
                onClick={() => fileInputRef.current?.click()}
                className="rounded-full bg-kamo-indigo px-4 py-2 font-ui text-xs font-medium text-kamo-stone disabled:opacity-50"
              >
                {posting ? t('duck.posting') : `+ ${t('duck.addPhoto')}`}
              </button>
            </div>

            {posts.length === 0 ? (
              <p className="mt-4 font-ui text-sm text-kamo-ink/50">{t('duck.empty')}</p>
            ) : (
              <div className="mt-3 grid grid-cols-2 gap-3">
                {posts.map((post) => (
                  <div key={post.id} className="overflow-hidden rounded-xl bg-white/60 shadow-sm">
                    <img
                      src={post.photoUrl}
                      alt=""
                      className="aspect-square w-full object-cover"
                      draggable={false}
                    />
                    <button
                      type="button"
                      onClick={() => void handleReport(post.id)}
                      className="w-full px-2 py-1.5 text-right font-ui text-[10px] text-kamo-ink/50"
                    >
                      {reportedIds.has(post.id) ? t('duck.reported') : `⚑ ${t('duck.report')}`}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {showCertificate && (
        <Certificate issuedAt={certIssuedAt} onClose={() => setShowCertificate(false)} />
      )}
    </div>
  );
}
