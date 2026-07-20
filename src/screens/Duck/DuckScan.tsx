import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useIdentityStore } from '../../store/identityStore';
import { fetchCertificate, scanDuckSpot, type ScanResult } from '../../lib/duck';
import { GeoError, getPosition, type GeoFailure } from '../../lib/geo';
import { LanguageToggle } from '../../components/LanguageToggle';
import { Certificate } from './Certificate';
import duckMark from '../../../img/marks/duck.svg?url';

type Phase =
  | { kind: 'idle' }
  | { kind: 'locating' }
  | { kind: 'geo_error'; reason: GeoFailure }
  | { kind: 'result'; result: ScanResult };

/**
 * §A.2b geofenced stamp scan. Ensures a session (via the app-wide identity
 * init), requires device location, and calls the server RPC that recomputes
 * the distance and awards the stamp only within 120 m -- the client never
 * grants a stamp itself.
 */
export function DuckScan() {
  const { t, i18n } = useTranslation();
  const isJa = i18n.language.startsWith('ja');
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('spot');
  const userId = useIdentityStore((s) => s.userId);

  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [certIssuedAt, setCertIssuedAt] = useState<string | null>(null);
  const [showCertificate, setShowCertificate] = useState(false);
  const startedRef = useRef(false);

  const runScan = useCallback(async () => {
    if (!token) return;
    setPhase({ kind: 'locating' });
    let point;
    try {
      point = await getPosition();
    } catch (err) {
      const reason = err instanceof GeoError ? err.reason : 'unavailable';
      setPhase({ kind: 'geo_error', reason });
      return;
    }
    try {
      const result = await scanDuckSpot(token, point.lat, point.lng);
      setPhase({ kind: 'result', result });
      if (result.status === 'collected' && result.certificateEarned && userId) {
        const cert = await fetchCertificate(userId);
        setCertIssuedAt(cert?.issuedAt ?? null);
      }
    } catch {
      setPhase({ kind: 'geo_error', reason: 'unavailable' });
    }
  }, [token, userId]);

  // Run once, after the session is established (a scan may be the person's
  // very first touch of the app, so wait for identity before calling the RPC).
  useEffect(() => {
    if (!userId || startedRef.current) return;
    startedRef.current = true;
    void runScan();
  }, [userId, runScan]);

  return (
    <div className="flex h-full w-full flex-col bg-kamo-stone">
      <div className="flex items-center justify-between border-b border-kamo-ink/10 p-4">
        <button type="button" onClick={() => navigate('/duck')} className="font-ui text-xs text-kamo-ink">
          ‹ {t('scan.goToDuck')}
        </button>
        <LanguageToggle />
      </div>

      <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
        {!token ? (
          <Message title={t('scan.notFound')} detail={t('scan.missingSpot')} />
        ) : phase.kind === 'idle' || phase.kind === 'locating' ? (
          <Message title={t('scan.locating')} />
        ) : phase.kind === 'geo_error' ? (
          <>
            <Message
              title={t('scan.locationNeeded')}
              detail={
                phase.reason === 'denied' ? t('scan.locationDenied') : t('scan.locationUnavailable')
              }
            />
            <RetryButton onClick={() => void runScan()} label={t('scan.tryAgain')} />
          </>
        ) : (
          <ScanResultView
            result={phase.result}
            isJa={isJa}
            onRetry={() => void runScan()}
            onViewCertificate={() => setShowCertificate(true)}
            onGoToDuck={() => navigate('/duck')}
          />
        )}
      </div>

      {showCertificate && (
        <Certificate issuedAt={certIssuedAt} onClose={() => setShowCertificate(false)} />
      )}
    </div>
  );
}

function ScanResultView({
  result,
  isJa,
  onRetry,
  onViewCertificate,
  onGoToDuck,
}: {
  result: ScanResult;
  isJa: boolean;
  onRetry: () => void;
  onViewCertificate: () => void;
  onGoToDuck: () => void;
}) {
  const { t } = useTranslation();

  if (result.status === 'not_found' || result.status === 'unauthenticated') {
    return (
      <>
        <Message title={t('scan.notFound')} />
        <RetryButton onClick={onRetry} label={t('scan.tryAgain')} />
      </>
    );
  }

  if (result.status === 'too_far') {
    return (
      <>
        <Message
          title={t('scan.tooFar')}
          detail={t('scan.tooFarDetail', { distance: result.distance })}
        />
        <RetryButton onClick={onRetry} label={t('scan.tryAgain')} />
      </>
    );
  }

  const spotName = isJa ? result.spotNameJa : result.spotNameEn;
  const collected = result.status === 'collected';

  return (
    <>
      <img
        src={duckMark}
        alt=""
        className="mb-4 h-24 w-24 animate-[fadeIn_0.5s_ease-out]"
        draggable={false}
      />
      <h1 className="font-display text-2xl text-kamo-ink">
        {collected ? t('scan.collected') : t('scan.alreadyCollected')}
      </h1>
      <p className="mt-1 font-ui text-sm text-kamo-ink/70">{spotName}</p>
      {!collected && <p className="mt-1 font-ui text-xs text-kamo-ink/50">{t('scan.alreadyDetail')}</p>}
      <p className="mt-4 font-ui text-sm font-medium text-kamo-ink">
        {t('scan.progress', { count: result.stampCount })}
      </p>

      {result.certificateEarned && (
        <>
          <p className="mt-4 font-ui text-sm text-kamo-sunset">{t('scan.certificateUnlocked')}</p>
          <button
            type="button"
            onClick={onViewCertificate}
            className="mt-3 rounded-full bg-kamo-sunset px-5 py-2.5 font-ui text-sm font-medium text-kamo-stone"
          >
            {t('duck.viewCertificate')}
          </button>
        </>
      )}

      <button
        type="button"
        onClick={onGoToDuck}
        className="mt-3 rounded-full bg-kamo-indigo px-5 py-2.5 font-ui text-sm font-medium text-kamo-stone"
      >
        {t('scan.goToDuck')}
      </button>
    </>
  );
}

function Message({ title, detail }: { title: string; detail?: string }) {
  return (
    <div>
      <h1 className="font-display text-xl text-kamo-ink">{title}</h1>
      {detail && <p className="mt-2 font-ui text-sm text-kamo-ink/60">{detail}</p>}
    </div>
  );
}

function RetryButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-5 rounded-full bg-kamo-indigo px-5 py-2.5 font-ui text-sm font-medium text-kamo-stone"
    >
      {label}
    </button>
  );
}
