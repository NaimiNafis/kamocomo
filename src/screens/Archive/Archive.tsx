import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  fetchArchiveMains,
  fetchMainHistory,
  type ArchiveMainCard,
  type MainHistory,
} from '../../lib/archive';
import { LanguageToggle } from '../../components/LanguageToggle';

type Status = 'loading' | 'ready' | 'error';

/**
 * §5.6 archive: a cookpad-style grid of every activity spot, and — via the
 * `?main=<id>` deep-link (used by the toukou "See earlier posts" stub) — a
 * detail view of one main's full sub history, live and archived, in order.
 */
export function Archive() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const mainId = params.get('main');

  return (
    <div className="h-full w-full overflow-y-auto bg-kamo-stone">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-kamo-ink/10 bg-kamo-stone/95 p-4 backdrop-blur">
        {mainId ? (
          <button
            type="button"
            onClick={() => setParams({}, { replace: false })}
            className="font-ui text-xs text-kamo-ink"
          >
            ‹ {t('archive.backToArchive')}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => navigate('/')}
            className="font-ui text-xs text-kamo-ink"
          >
            ‹ {t('mainMap.back')}
          </button>
        )}
        <LanguageToggle />
      </div>

      {mainId ? (
        <ArchiveDetail key={mainId} mainId={mainId} />
      ) : (
        <ArchiveGrid onOpen={(id) => setParams({ main: id })} />
      )}
    </div>
  );
}

function ArchiveGrid({ onOpen }: { onOpen: (id: string) => void }) {
  const { t, i18n } = useTranslation();
  const isJa = i18n.language.startsWith('ja');
  const [status, setStatus] = useState<Status>('loading');
  const [mains, setMains] = useState<ArchiveMainCard[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetchArchiveMains()
      .then((data) => {
        if (cancelled) return;
        setMains(data);
        setStatus('ready');
      })
      .catch(() => !cancelled && setStatus('error'));
    return () => {
      cancelled = true;
    };
  }, []);

  if (status === 'loading') return <Centered>{t('archive.loading')}</Centered>;
  if (status === 'error') return <Centered>{t('archive.error')}</Centered>;
  if (mains.length === 0) return <Centered>{t('archive.empty')}</Centered>;

  return (
    <div className="p-4">
      <h1 className="font-display text-xl text-kamo-ink">{t('archive.title')}</h1>
      <p className="mb-4 mt-1 font-ui text-sm text-kamo-ink/60">{t('archive.subtitle')}</p>
      <div className="grid grid-cols-2 gap-3">
        {mains.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => onOpen(m.id)}
            className="overflow-hidden rounded-xl bg-white/70 text-left shadow-sm"
          >
            <PhotoOrPlaceholder
              url={m.photoUrl}
              color={m.color}
              label={isJa ? m.typeNameJa : m.typeNameEn}
              className="aspect-square w-full"
            />
            <div className="p-2">
              <p className="line-clamp-2 font-ui text-xs text-kamo-ink">{m.phrase}</p>
              <div className="mt-1.5 flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: m.color }} />
                <span className="font-ui text-[10px] text-kamo-ink/60">
                  {isJa ? m.typeNameJa : m.typeNameEn} · {t('archive.posts', { count: m.subCount })}
                </span>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function ArchiveDetail({ mainId }: { mainId: string }) {
  const { t, i18n } = useTranslation();
  const isJa = i18n.language.startsWith('ja');
  const [status, setStatus] = useState<Status>('loading');
  const [history, setHistory] = useState<MainHistory | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchMainHistory(mainId)
      .then((data) => {
        if (cancelled) return;
        setHistory(data);
        setStatus('ready');
      })
      .catch(() => !cancelled && setStatus('error'));
    return () => {
      cancelled = true;
    };
  }, [mainId]);

  if (status === 'loading') return <Centered>{t('archive.loading')}</Centered>;
  if (status === 'error') return <Centered>{t('archive.error')}</Centered>;
  if (!history) return <Centered>{t('archive.notFound')}</Centered>;

  const { main, subs } = history;
  const typeName = isJa ? main.typeNameJa : main.typeNameEn;
  const locale = isJa ? 'ja-JP' : 'en-US';
  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString(locale, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  return (
    <div className="p-4">
      <div className="overflow-hidden rounded-2xl bg-white/70 shadow-sm">
        <PhotoOrPlaceholder url={main.photoUrl} color={main.color} label={typeName} className="h-48 w-full" />
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
                url={s.photoUrl}
                color={s.color}
                label=""
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
  );
}

function PhotoOrPlaceholder({
  url,
  color,
  label,
  className,
}: {
  url: string | null;
  color: string;
  label: string;
  className?: string;
}) {
  if (url) {
    return <img src={url} alt="" className={`object-cover ${className ?? ''}`} draggable={false} />;
  }
  return (
    <div
      className={`flex items-center justify-center ${className ?? ''}`}
      style={{ backgroundColor: color }}
    >
      <span className="font-display text-sm text-kamo-stone/90">{label}</span>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[50vh] items-center justify-center px-8 text-center font-ui text-sm text-kamo-ink/60">
      {children}
    </div>
  );
}
