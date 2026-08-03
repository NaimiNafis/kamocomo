import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  fetchArchiveMains,
  fetchArchivePlaces,
  fetchMainHistory,
  type ArchiveMainCard,
  type ArchivePlaceCard,
  type MainHistory,
} from '../../lib/archive';
import { cachedFetch } from '../../lib/cache';
import { LanguageToggle } from '../../components/LanguageToggle';
import { BackIcon } from '../../components/icons';
import { StaleBanner } from '../../components/StaleBanner';
import { examplePhoto, thumb } from '../../lib/photos';

type Status = 'loading' | 'ready' | 'error';

/**
 * 鴨川ログ — the record of how the river has been used.
 *
 * Three levels, each narrowing the last, tracked in the query string so any of
 * them can be linked to:
 *
 *   (none)         the eight places
 *   ?place=<id>    everything posted at one of them
 *   ?all=1         everything, everywhere, each card naming its place
 *   ?main=<id>     one main's full history, live and archived, in order
 *
 * Places first because "what happens at Sanjo?" is the question people bring to
 * a log; a single feed of every main ever posted could be scrolled but not
 * asked anything.
 */
export function Archive() {
  const { t, i18n } = useTranslation();
  const isJa = i18n.language.startsWith('ja');
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const mainId = params.get('main');
  const placeId = params.get('place');
  const showAll = params.get('all') === '1';
  const [placeName, setPlaceName] = useState<{ en: string; ja: string } | null>(null);

  /** Back goes up one level, not out -- the level you came from is in the URL. */
  function goUp() {
    if (mainId) {
      const next: Record<string, string> = {};
      if (placeId) next.place = placeId;
      else if (showAll) next.all = '1';
      setParams(next);
      return;
    }
    if (placeId || showAll) {
      setParams({});
      return;
    }
    navigate('/');
  }

  const heading = mainId
    ? null
    : placeId && placeName
      ? isJa
        ? placeName.ja
        : placeName.en
      : showAll
        ? t('archive.allPosts')
        : t('archive.title');

  return (
    <div className="h-full w-full overflow-y-auto bg-kamo-stone">
      <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-kamo-ink/10 bg-kamo-stone/95 p-4 backdrop-blur">
        <button
          type="button"
          onClick={goUp}
          aria-label={mainId || placeId || showAll ? t('archive.backToArchive') : t('mainMap.back')}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-kamo-ink"
        >
          <BackIcon size={18} />
        </button>
        {heading && (
          <span className="min-w-0 truncate font-display text-base text-kamo-ink">{heading}</span>
        )}
        <div className="shrink-0">
          <LanguageToggle />
        </div>
      </div>

      {mainId ? (
        <ArchiveDetail key={mainId} mainId={mainId} />
      ) : placeId || showAll ? (
        <MainGrid
          key={placeId ?? 'all'}
          placeId={placeId ?? undefined}
          showPlaceLabel={showAll}
          onPlaceResolved={setPlaceName}
          onOpen={(id) => setParams({ ...(placeId ? { place: placeId } : { all: '1' }), main: id })}
        />
      ) : (
        <PlaceGrid
          onOpen={(id) => setParams({ place: id })}
          onSeeAll={() => setParams({ all: '1' })}
        />
      )}
    </div>
  );
}

/**
 * The front page: the eight places, newest photo each, with a "see all" for
 * when you don't care where something happened.
 */
function PlaceGrid({ onOpen, onSeeAll }: { onOpen: (id: string) => void; onSeeAll: () => void }) {
  const { t, i18n } = useTranslation();
  const isJa = i18n.language.startsWith('ja');
  const [status, setStatus] = useState<Status>('loading');
  const [places, setPlaces] = useState<ArchivePlaceCard[]>([]);
  const [stale, setStale] = useState(false);

  useEffect(() => {
    let cancelled = false;
    cachedFetch('archive:places', fetchArchivePlaces)
      .then(({ data, stale }) => {
        if (cancelled) return;
        setPlaces(data);
        setStale(stale);
        setStatus('ready');
      })
      .catch(() => !cancelled && setStatus('error'));
    return () => {
      cancelled = true;
    };
  }, []);

  if (status === 'loading') return <Centered>{t('archive.loading')}</Centered>;
  if (status === 'error')
    return <ErrorState message={t('archive.error')} retry={t('common.retry')} />;

  return (
    <>
      <StaleBanner show={stale} />
      <div className="p-4">
        <p className="mb-4 font-ui text-sm text-kamo-ink/60">{t('archive.subtitle')}</p>
        {/* Two across, four down for the eight places along the river, in the
            order you'd walk them -- north to south, Delta to Gojo. */}
        <div className="grid grid-cols-2 gap-3">
          {places.map((place) => (
            <button
              key={place.id}
              type="button"
              onClick={() => onOpen(place.id)}
              className="overflow-hidden rounded-xl bg-white/70 text-left shadow-sm transition-transform duration-150 active:scale-[0.98]"
            >
              <PhotoOrPlaceholder
                id={place.id}
                url={place.photoUrl}
                className="aspect-[4/3] w-full"
              />
              <div className="p-2">
                <p className="line-clamp-2 font-display text-sm leading-tight text-kamo-ink">
                  {isJa ? place.nameJa : place.nameEn}
                </p>
                <p className="mt-0.5 font-ui text-[10px] text-kamo-ink/55">
                  {t('archive.posts', { count: place.mainCount })}
                </p>
              </div>
            </button>
          ))}
        </div>

        {/* Bottom-right of the grid: the way out of the by-place framing. */}
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={onSeeAll}
            className="rounded-full border border-kamo-ink/15 bg-white/70 px-4 py-2 font-ui text-sm font-medium text-kamo-ink shadow-sm transition-transform duration-150 active:scale-[0.97]"
          >
            {t('archive.seeAll')} →
          </button>
        </div>
      </div>
    </>
  );
}

/**
 * The mains at one place, or everywhere when `placeId` is omitted.
 *
 * `showPlaceLabel` is what makes the "see all" view answerable: pulled out of
 * its board, a post needs to say where it happened, or you're looking at a
 * photo of a riverbank with no idea which riverbank.
 */
function MainGrid({
  placeId,
  showPlaceLabel,
  onOpen,
  onPlaceResolved,
}: {
  placeId?: string;
  showPlaceLabel: boolean;
  onOpen: (id: string) => void;
  onPlaceResolved: (name: { en: string; ja: string } | null) => void;
}) {
  const { t, i18n } = useTranslation();
  const isJa = i18n.language.startsWith('ja');
  const [status, setStatus] = useState<Status>('loading');
  const [mains, setMains] = useState<ArchiveMainCard[]>([]);
  const [stale, setStale] = useState(false);

  useEffect(() => {
    let cancelled = false;
    cachedFetch(`archive:mains:${placeId ?? 'all'}`, () => fetchArchiveMains(placeId))
      .then(({ data, stale }) => {
        if (cancelled) return;
        setMains(data);
        setStale(stale);
        setStatus('ready');
        // The place's name comes back with its posts rather than from another
        // query, so the header can fill in once anything has loaded.
        if (placeId) {
          const first = data[0];
          onPlaceResolved(first ? { en: first.placeNameEn, ja: first.placeNameJa } : null);
        }
      })
      .catch(() => !cancelled && setStatus('error'));
    return () => {
      cancelled = true;
      if (placeId) onPlaceResolved(null);
    };
    // onPlaceResolved is a setState function, stable across renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placeId]);

  if (status === 'loading') return <Centered>{t('archive.loading')}</Centered>;
  if (status === 'error')
    return <ErrorState message={t('archive.error')} retry={t('common.retry')} />;
  if (mains.length === 0) return <Centered>{t('archive.empty')}</Centered>;

  return (
    <>
      <StaleBanner show={stale} />
      <div className="p-4">
        <div className="grid grid-cols-2 gap-3">
          {mains.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => onOpen(m.id)}
              className="overflow-hidden rounded-xl bg-white/70 text-left shadow-sm transition-transform duration-150 active:scale-[0.98]"
            >
              <PhotoOrPlaceholder id={m.id} url={m.photoUrl} className="aspect-square w-full" />
              <div className="p-2">
                {showPlaceLabel && (m.placeNameEn || m.placeNameJa) && (
                  <p className="mb-1 truncate font-ui text-[10px] font-medium uppercase tracking-wide text-kamo-river">
                    {isJa ? m.placeNameJa : m.placeNameEn}
                  </p>
                )}
                <p className="line-clamp-2 font-ui text-xs text-kamo-ink">{m.phrase}</p>
                <div className="mt-1.5 flex items-center gap-1.5">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: m.color }} />
                  <span className="truncate font-ui text-[10px] text-kamo-ink/60">
                    {isJa ? m.typeNameJa : m.typeNameEn} · {t('archive.posts', { count: m.subCount })}
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

function ArchiveDetail({ mainId }: { mainId: string }) {
  const { t, i18n } = useTranslation();
  const isJa = i18n.language.startsWith('ja');
  const [status, setStatus] = useState<Status>('loading');
  const [history, setHistory] = useState<MainHistory | null>(null);
  const [stale, setStale] = useState(false);

  useEffect(() => {
    let cancelled = false;
    cachedFetch(`archive:main:${mainId}`, () => fetchMainHistory(mainId))
      .then(({ data, stale }) => {
        if (cancelled) return;
        setHistory(data);
        setStale(stale);
        setStatus('ready');
      })
      .catch(() => !cancelled && setStatus('error'));
    return () => {
      cancelled = true;
    };
  }, [mainId]);

  if (status === 'loading') return <Centered>{t('archive.loading')}</Centered>;
  if (status === 'error') return <ErrorState message={t('archive.error')} retry={t('common.retry')} />;
  if (!history) return <Centered>{t('archive.notFound')}</Centered>;

  const { main, subs } = history;
  const typeName = isJa ? main.typeNameJa : main.typeNameEn;
  const locale = isJa ? 'ja-JP' : 'en-US';
  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString(locale, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  return (
    <>
      <StaleBanner show={stale} />
      <div className="p-4">
      <div className="overflow-hidden rounded-2xl bg-white/70 shadow-sm">
        <PhotoOrPlaceholder id={main.id} url={main.photoUrl} className="h-48 w-full" />
        <div className="p-4">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: main.color }} />
            <span className="font-ui text-xs font-medium uppercase tracking-wide text-kamo-ink/60">
              {typeName}
            </span>
          </div>
          {main.phrase && <p className="mt-2 font-display text-lg text-kamo-ink">{main.phrase}</p>}
          <div className="mt-2 flex gap-3 font-ui text-xs text-kamo-ink/60">
            <span>♥ {main.likes}</span>
            <span>✕ {main.dislikes}</span>
            <span>{fmt(main.createdAt)}</span>
          </div>
        </div>
      </div>

      <h2 className="mb-2 mt-6 font-display text-base text-kamo-ink">
        {t('archive.history')} · {t('archive.posts', { count: subs.length })}
      </h2>

      {subs.length === 0 ? (
        <p className="font-ui text-sm text-kamo-ink/50">{t('archive.noSubs')}</p>
      ) : (
        <ol className="space-y-2">
          {subs.map((s) => (
            <li key={s.id} className="flex gap-3 rounded-xl bg-white/60 p-2 shadow-sm">
              <PhotoOrPlaceholder
                id={s.id}
                url={s.photoUrl}
                className="h-16 w-16 shrink-0 rounded-lg"
              />
              <div className="min-w-0 flex-1 py-0.5">
                <div className="flex items-center gap-2">
                  <span className="font-ui text-[10px] text-kamo-ink/50">{fmt(s.createdAt)}</span>
                  {s.archived && (
                    <span className="rounded-full bg-kamo-sand px-1.5 py-0.5 font-ui text-[9px] text-kamo-ink/70">
                      {t('archive.archivedBadge')}
                    </span>
                  )}
                </div>
                {s.phrase && <p className="mt-0.5 line-clamp-2 font-ui text-sm text-kamo-ink">{s.phrase}</p>}
              </div>
            </li>
          ))}
        </ol>
      )}
      </div>
    </>
  );
}

/** A post's photo, or one of the example riverbank shots for photo-less posts
 * (§C6) -- keyed on the post's id, so each falls back to a different picture
 * and an archive of them doesn't look like one image repeated. The activity
 * type is shown alongside, so the stand-in doesn't need to repeat it. */
function PhotoOrPlaceholder({
  id,
  url,
  className,
}: {
  id: string;
  url: string | null;
  className?: string;
}) {
  return (
    <img
      src={url ? thumb(url, 400) : examplePhoto(id)}
      alt=""
      className={`object-cover ${className ?? ''}`}
      draggable={false}
    />
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[50vh] items-center justify-center px-8 text-center font-ui text-sm text-kamo-ink/60">
      {children}
    </div>
  );
}

function ErrorState({ message, retry }: { message: string; retry: string }) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 px-8 text-center">
      <p className="font-ui text-sm text-kamo-ink/60">{message}</p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="rounded-full bg-kamo-indigo px-4 py-2 font-ui text-sm text-kamo-stone"
      >
        {retry}
      </button>
    </div>
  );
}
