import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useIdentityStore } from '../../store/identityStore';
import {
  collectDuckByPhoto,
  fetchCertificate,
  fetchCollection,
  fetchDuckSpotCoordsById,
  type CollectionEntry,
} from '../../lib/duck';
import { duckSilhouetteDataUri } from '../../lib/ducks';
import { cachedFetch } from '../../lib/cache';
import { DUCK_SCAN_RESULT_KEY, TEST_MODE_KEY, type StashedScanResult } from '../../lib/entryFlags';
import { LanguageToggle } from '../../components/LanguageToggle';
import { StaleBanner } from '../../components/StaleBanner';
import { BackIcon } from '../../components/icons';
import { Certificate } from './Certificate';

type Status = 'loading' | 'ready' | 'error';
type Filter = 'all' | 'collected' | 'missing';

/**
 * 図鑑 — the duck collection.
 *
 * The rally used to be a 10-slot stamp card of identical icons. The duck
 * objects along the river each carry their own detail, so this is a field guide
 * instead: an entry you haven't found shows only a **silhouette**, enough to
 * know what shape to look for, and one you have found shows **your own photo**
 * of it, dated. What's being collected is a record of what you actually saw.
 *
 * Collecting happens by photographing the object where it stands (see
 * `collectDuckByPhoto`). The photo posts either way; only being within range
 * fills the entry.
 */
export function Duck() {
  const { t, i18n } = useTranslation();
  const isJa = i18n.language.startsWith('ja');
  const navigate = useNavigate();
  const userId = useIdentityStore((s) => s.userId);

  const [status, setStatus] = useState<Status>('loading');
  const [entries, setEntries] = useState<CollectionEntry[]>([]);
  const [certIssuedAt, setCertIssuedAt] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [showCertificate, setShowCertificate] = useState(false);

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [newestFirst, setNewestFirst] = useState(false);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const pendingSpotRef = useRef<string | null>(null);

  const [testMode, setTestMode] = useState(() => localStorage.getItem(TEST_MODE_KEY) === 'true');

  // A duck-QR scan still routes through here and stashes its result.
  const [scanBanner, setScanBanner] = useState<StashedScanResult | null>(() => {
    const raw = sessionStorage.getItem(DUCK_SCAN_RESULT_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as StashedScanResult;
    } catch {
      return null;
    }
  });
  useEffect(() => {
    if (scanBanner) sessionStorage.removeItem(DUCK_SCAN_RESULT_KEY);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refetch = useCallback(async () => {
    if (!userId) return;
    try {
      setEntries(await fetchCollection(userId));
    } catch {
      /* keep the last good collection */
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    cachedFetch(`collection:${userId}`, () =>
      Promise.all([fetchCollection(userId), fetchCertificate(userId)]),
    )
      .then(({ data: [list, cert], stale }) => {
        if (cancelled) return;
        setEntries(list);
        setCertIssuedAt(cert?.issuedAt ?? null);
        setStale(stale);
        setStatus('ready');
      })
      .catch(() => !cancelled && setStatus('error'));
    return () => {
      cancelled = true;
    };
  }, [userId]);

  function toggleTestMode() {
    setTestMode((prev) => {
      const next = !prev;
      localStorage.setItem(TEST_MODE_KEY, String(next));
      return next;
    });
  }

  function pickPhotoFor(spotId: string) {
    pendingSpotRef.current = spotId;
    photoInputRef.current?.click();
  }

  async function handlePhotoChosen(file: File | undefined) {
    const spotId = pendingSpotRef.current;
    pendingSpotRef.current = null;
    if (photoInputRef.current) photoInputRef.current.value = '';
    if (!file || !spotId || !userId) return;

    setBusyId(spotId);
    setNotice(null);
    try {
      // Test mode submits the spot's own coordinates so the flow can be shown
      // without standing at the river -- no easier to abuse than spoofing GPS.
      const override = testMode ? ((await fetchDuckSpotCoordsById(spotId)) ?? undefined) : undefined;
      const result = await collectDuckByPhoto(userId, file, spotId, override);
      if (result.status !== 'posted') {
        setNotice(t('collection.postFailed'));
      } else if (result.collected) {
        setNotice(result.already ? t('collection.alreadyHad') : t('collection.justCollected'));
      } else {
        // The photo is up either way -- say why the entry didn't fill.
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
      setBusyId(null);
    }
  }

  const collectedCount = entries.filter((e) => e.collectedAt !== null).length;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = entries.filter((e) => {
      if (filter === 'collected' && e.collectedAt === null) return false;
      if (filter === 'missing' && e.collectedAt !== null) return false;
      if (!q) return true;
      return `${e.nameEn} ${e.nameJa}`.toLowerCase().includes(q);
    });
    if (!newestFirst) return list;
    // Uncollected entries have no date, so they sink rather than scattering
    // through a date-ordered list.
    return [...list].sort((a, b) => {
      if (!a.collectedAt) return 1;
      if (!b.collectedAt) return -1;
      return b.collectedAt.localeCompare(a.collectedAt);
    });
  }, [entries, query, filter, newestFirst]);

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString(isJa ? 'ja-JP' : 'en-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });

  return (
    <div className="relative flex h-full w-full flex-col bg-kamo-stone">
      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => void handlePhotoChosen(e.target.files?.[0])}
      />

      <div className="flex items-center justify-between gap-2 border-b border-kamo-ink/10 px-4 py-3">
        <button
          type="button"
          onClick={() => navigate('/')}
          aria-label={t('mainMap.back')}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-kamo-ink"
        >
          <BackIcon size={18} />
        </button>
        <div className="min-w-0 text-center">
          <span className="block truncate font-display text-base text-kamo-ink">
            {t('collection.title')}
          </span>
          <span className="font-ui text-[11px] text-kamo-ink/60">
            {collectedCount} / {entries.length}
          </span>
        </div>
        <div className="shrink-0">
          <LanguageToggle />
        </div>
      </div>

      <StaleBanner show={stale} />

      {scanBanner && (
        <div className="flex items-center justify-between gap-2 bg-kamo-sunset/90 px-4 py-2">
          <span className="font-ui text-sm text-kamo-stone">
            {isJa ? scanBanner.spotNameJa : scanBanner.spotNameEn}
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

      {notice && (
        <div className="flex items-center justify-between gap-2 bg-kamo-indigo px-4 py-2">
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
        <p className="p-4 font-ui text-sm text-kamo-ink/60">{t('collection.loading')}</p>
      )}
      {status === 'error' && (
        <div className="flex flex-col items-start gap-3 p-4">
          <p className="font-ui text-sm text-kamo-ink/60">{t('collection.error')}</p>
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
          <div className="space-y-2 px-4 pb-2 pt-3">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('collection.search')}
              className="w-full rounded-full border border-kamo-ink/15 bg-white/60 px-4 py-2 font-ui text-sm outline-none focus:border-kamo-river"
            />
            <div className="flex flex-wrap gap-1.5">
              {(['all', 'collected', 'missing'] as Filter[]).map((f) => (
                <Chip key={f} active={filter === f} onClick={() => setFilter(f)}>
                  {t(`collection.filter.${f}`)}
                </Chip>
              ))}
              <Chip active={newestFirst} onClick={() => setNewestFirst((v) => !v)}>
                {t('collection.byDate')}
              </Chip>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-28">
            {visible.length === 0 ? (
              <p className="pt-8 text-center font-ui text-sm text-kamo-ink/50">
                {t('collection.noMatches')}
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {visible.map((entry) => (
                  <EntryCard
                    key={entry.id}
                    entry={entry}
                    name={isJa ? entry.nameJa : entry.nameEn}
                    busy={busyId === entry.id}
                    dateLabel={entry.collectedAt ? fmtDate(entry.collectedAt) : null}
                    onPhoto={() => pickPhotoFor(entry.id)}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-2 p-4">
            {((collectedCount === entries.length && entries.length > 0) || certIssuedAt) && (
              <button
                type="button"
                onClick={() => setShowCertificate(true)}
                className="pointer-events-auto rounded-full bg-kamo-sunset px-5 py-2.5 font-ui text-sm font-medium text-kamo-stone shadow-lg"
              >
                {t('duck.viewCertificate')}
              </button>
            )}
            <button
              type="button"
              onClick={toggleTestMode}
              aria-pressed={testMode}
              className="pointer-events-auto flex items-center gap-2 rounded-full border border-kamo-ink/15 bg-kamo-stone/90 px-3 py-1.5 font-ui text-[11px] text-kamo-ink/70 shadow-sm backdrop-blur"
            >
              {t('duck.testMode')}
              <span
                className="flex h-4 w-7 shrink-0 items-center rounded-full p-0.5 transition-colors"
                style={{ backgroundColor: testMode ? '#2E3A59' : 'rgba(28,28,26,0.2)' }}
              >
                <span
                  className="h-3 w-3 rounded-full bg-kamo-stone transition-transform"
                  style={{ transform: testMode ? 'translateX(12px)' : 'translateX(0)' }}
                />
              </span>
            </button>
          </div>
        </>
      )}

      {showCertificate && (
        <Certificate issuedAt={certIssuedAt} onClose={() => setShowCertificate(false)} />
      )}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-3 py-1 font-ui text-xs transition-colors ${
        active
          ? 'border-kamo-indigo bg-kamo-indigo text-kamo-stone'
          : 'border-kamo-ink/15 text-kamo-ink/70'
      }`}
    >
      {children}
    </button>
  );
}

/**
 * One catalogue entry. Uncollected shows the silhouette and invites a photo;
 * collected shows the photo you took, its date, and the 採取済み mark.
 */
function EntryCard({
  entry,
  name,
  busy,
  dateLabel,
  onPhoto,
}: {
  entry: CollectionEntry;
  name: string;
  busy: boolean;
  dateLabel: string | null;
  onPhoto: () => void;
}) {
  const { t } = useTranslation();
  const collected = entry.collectedAt !== null;

  return (
    <button
      type="button"
      onClick={onPhoto}
      disabled={busy}
      className="relative overflow-hidden rounded-xl bg-white/70 text-left shadow-sm ring-1 ring-kamo-ink/5 transition-transform duration-150 active:scale-[0.98] disabled:opacity-60"
    >
      <div
        className="flex aspect-square w-full items-center justify-center"
        style={{ backgroundColor: entry.photoUrl ? undefined : `${entry.color}1A` }}
      >
        {entry.photoUrl ? (
          <img src={entry.photoUrl} alt="" className="h-full w-full object-cover" draggable={false} />
        ) : (
          <img
            src={duckSilhouetteDataUri(entry.number - 1, 96)}
            alt=""
            className="h-3/5 w-3/5"
            draggable={false}
          />
        )}
      </div>

      {collected && (
        <span
          className="absolute right-1.5 top-1.5 rotate-[-12deg] rounded border-2 px-1.5 py-0.5 font-ui text-[9px] font-bold"
          style={{
            color: '#B5705E',
            borderColor: '#B5705E',
            backgroundColor: 'rgba(233,228,216,0.85)',
          }}
        >
          {t('collection.collected')}
        </span>
      )}

      <div className="p-2">
        <p className="font-ui text-[10px] text-kamo-ink/50">
          No.{String(entry.number).padStart(2, '0')}
        </p>
        <p className="line-clamp-1 font-ui text-xs text-kamo-ink">{name}</p>
        <p className="mt-0.5 font-ui text-[10px] text-kamo-ink/50">
          {busy
            ? t('collection.saving')
            : dateLabel
              ? `${t('collection.savedOn')} ${dateLabel}`
              : t('collection.filter.missing')}
        </p>
      </div>
    </button>
  );
}
