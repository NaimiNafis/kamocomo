import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { thumb } from '../../lib/photos';
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
import { ConfirmRetake, StampPhoto } from './StampPhoto';

type Status = 'loading' | 'ready' | 'error';

/** Matches the boards' press-and-hold, so a hold feels the same everywhere. */
const HOLD_MS = 320;
/** Movement that reclassifies a hold as a scroll. */
const HOLD_SLOP = 10;

/**
 * Kamo Collection — a stamp sheet of the eight ducks along the river.
 *
 * Eight slots, two across and four down, each an empty ring waiting for a
 * photo. An unfilled one shows a dotted circle with the duck faint inside it
 * and a `+`: enough to know what you're looking for and that this is where it
 * goes. A filled one shows **your own photo** of that duck. What's collected is
 * a record of what you actually saw, not a row of identical icons.
 *
 * There is deliberately no search and no filter. Eight is few enough to take in
 * at a glance, and machinery for narrowing eight things gets between you and
 * the sheet.
 *
 * Collecting happens by photographing the object where it stands (see
 * `collectDuckByPhoto`). The photo posts to the shared board either way; only
 * being within range fills your slot.
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

  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const pendingSpotRef = useRef<string | null>(null);

  const [testMode, setTestMode] = useState(() => localStorage.getItem(TEST_MODE_KEY) === 'true');
  /** A filled stamp asks before it overwrites; holding one shows the photo whole. */
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);

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
    setConfirmId(null);
    setViewingId(null);
    pendingSpotRef.current = spotId;
    photoInputRef.current?.click();
  }

  /** An empty stamp opens the camera; a filled one asks first, because there's
   * only ever one photo per stamp and the new one replaces the old. */
  function handleTap(entry: CollectionEntry) {
    if (entry.photoUrl) setConfirmId(entry.id);
    else pickPhotoFor(entry.id);
  }

  /** Holding a filled stamp shows the photo uncropped. Holding an empty one has
   * nothing to show, so it falls through to the camera. */
  function handleHold(entry: CollectionEntry) {
    if (entry.photoUrl) setViewingId(entry.id);
    else pickPhotoFor(entry.id);
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
  const confirmEntry = confirmId ? entries.find((e) => e.id === confirmId) : undefined;
  const viewingEntry = viewingId ? entries.find((e) => e.id === viewingId) : undefined;


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
          {/* One card holding all eight, at a fixed width and centred.
              A grid that sized itself to the viewport put the slots somewhere
              different on every phone; a card of its own means the sheet is the
              same object wherever you open it, with the screen just giving it
              more or less room around the edges. */}
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-28 pt-2">
            {/* min-h-full + centring: the card sits in the middle of whatever
                room is left, and the wrapper grows past it into a normal scroll
                when the screen is too short to hold it. */}
            <div className="flex min-h-full items-center justify-center">
              <div className="w-fit rounded-3xl border border-kamo-ink/10 bg-white/50 px-5 py-6 shadow-sm">
                <div className="grid grid-cols-2 justify-center gap-x-6 gap-y-6">
                  {entries.map((entry) => (
                    <StampSlot
                      key={entry.id}
                      entry={entry}
                      name={isJa ? entry.nameJa : entry.nameEn}
                      busy={busyId === entry.id}
                      dateLabel={entry.collectedAt ? fmtDate(entry.collectedAt) : null}
                      onTap={() => handleTap(entry)}
                      onHold={() => handleHold(entry)}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-2 bg-gradient-to-t from-kamo-stone via-kamo-stone to-transparent p-4 pt-8">
            {/* The sheet is what /duck is for; everyone else's photos are a
                place you can go from it, not the other way round. */}
            <button
              type="button"
              onClick={() => navigate('/duck/photos')}
              className="pointer-events-auto rounded-full border border-kamo-ink/15 bg-kamo-stone px-5 py-2.5 font-ui text-sm font-medium text-kamo-ink shadow-sm transition-transform duration-150 active:scale-[0.97]"
            >
              {t('collection.everyonesPhotos')}
            </button>
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

      {confirmEntry && (
        <ConfirmRetake
          name={isJa ? confirmEntry.nameJa : confirmEntry.nameEn}
          onConfirm={() => pickPhotoFor(confirmEntry.id)}
          onCancel={() => setConfirmId(null)}
        />
      )}

      {viewingEntry && (
        <StampPhoto
          entry={viewingEntry}
          name={isJa ? viewingEntry.nameJa : viewingEntry.nameEn}
          dateLabel={viewingEntry.collectedAt ? fmtDate(viewingEntry.collectedAt) : null}
          onRetake={() => pickPhotoFor(viewingEntry.id)}
          onClose={() => setViewingId(null)}
        />
      )}

      {showCertificate && (
        <Certificate issuedAt={certIssuedAt} onClose={() => setShowCertificate(false)} />
      )}
    </div>
  );
}

/**
 * One slot on the sheet.
 *
 * A circle, because a stamp is a circle and because the shape says "something
 * belongs here" more plainly than a square card does. Empty, it's a dotted ring
 * with the duck faint inside and a `+` over it -- you can see which duck it's
 * for before you've found it, which is half of knowing what to look for. Filled,
 * your photo takes the whole circle and the ring goes solid.
 */
function StampSlot({
  entry,
  name,
  busy,
  dateLabel,
  onTap,
  onHold,
}: {
  entry: CollectionEntry;
  name: string;
  busy: boolean;
  dateLabel: string | null;
  onTap: () => void;
  onHold: () => void;
}) {
  const { t } = useTranslation();
  const collected = entry.collectedAt !== null;

  // Tap and hold do different things here, so the press has to be timed. Same
  // shape as the boards': a timer the first real movement cancels, and a flag
  // so the tap doesn't also fire once the hold already has.
  const hold = useRef<{ timer: ReturnType<typeof setTimeout>; x: number; y: number } | null>(null);
  const held = useRef(false);

  function cancelHold() {
    if (!hold.current) return;
    clearTimeout(hold.current.timer);
    hold.current = null;
  }

  return (
    <button
      type="button"
      onPointerDown={(e) => {
        held.current = false;
        hold.current = {
          x: e.clientX,
          y: e.clientY,
          timer: setTimeout(() => {
            hold.current = null;
            held.current = true;
            navigator.vibrate?.(12);
            onHold();
          }, HOLD_MS),
        };
      }}
      onPointerMove={(e) => {
        const h = hold.current;
        if (h && Math.hypot(e.clientX - h.x, e.clientY - h.y) > HOLD_SLOP) cancelHold();
      }}
      onPointerUp={cancelHold}
      onPointerCancel={cancelHold}
      onClick={() => {
        // The hold already acted; a click follows a long press on most
        // browsers and would open the camera behind the sheet.
        if (held.current) {
          held.current = false;
          return;
        }
        onTap();
      }}
      disabled={busy}
      aria-label={collected ? name : `${t('collection.addTo')} ${name}`}
      className="kamo-holdable flex w-[8.25rem] flex-col items-center gap-2 text-center transition-transform duration-150 active:scale-[0.96] disabled:opacity-60"
    >
      <span className="relative block h-[8.25rem] w-[8.25rem]">
        <span
          className="flex h-full w-full items-center justify-center overflow-hidden rounded-full"
          style={{
            border: collected ? `3px solid ${entry.color}` : `3px dotted ${entry.color}80`,
            backgroundColor: collected ? undefined : `${entry.color}12`,
          }}
        >
          {entry.photoUrl ? (
            <img
              src={thumb(entry.photoUrl, 300)}
              alt=""
              className="h-full w-full object-cover"
              draggable={false}
            />
          ) : (
            <>
              {/* The duck sits behind the +, faint enough that the + reads as
                  the action and the duck as the subject. */}
              <img
                src={duckSilhouetteDataUri(entry.number - 1, 96)}
                alt=""
                className="absolute h-1/2 w-1/2 opacity-25"
                draggable={false}
              />
              <span
                className="relative font-ui text-3xl font-light leading-none"
                style={{ color: entry.color }}
              >
                +
              </span>
            </>
          )}
        </span>

        {collected && (
          <span
            className="absolute -right-1 top-1 rotate-[-12deg] rounded border-2 px-1.5 py-0.5 font-ui text-[9px] font-bold"
            style={{
              color: '#B5705E',
              borderColor: '#B5705E',
              backgroundColor: 'rgba(233,228,216,0.9)',
            }}
          >
            {t('collection.collected')}
          </span>
        )}
      </span>

      <span className="block w-full">
        <span className="block font-ui text-[10px] text-kamo-ink/45">
          No.{String(entry.number).padStart(2, '0')}
        </span>
        <span className="block truncate font-ui text-xs text-kamo-ink">{name}</span>
        <span className="block font-ui text-[10px] text-kamo-ink/50">
          {busy ? t('collection.saving') : dateLabel ? `${t('collection.savedOn')} ${dateLabel}` : ''}
        </span>
      </span>
    </button>
  );
}
