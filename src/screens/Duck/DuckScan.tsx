import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useIdentityStore } from '../../store/identityStore';
import { fetchDuckSpotCoords, scanDuckSpot } from '../../lib/duck';
import { getPosition } from '../../lib/geo';
import {
  DUCK_SCAN_RESULT_KEY,
  HAS_SEEN_INTRO_KEY,
  OPEN_DUCK_AFTER_INTRO_KEY,
  TEST_MODE_KEY,
  type StashedScanResult,
} from '../../lib/entryFlags';
import duckMark from '../../../img/marks/duck.svg?url';

/**
 * §A.2b geofenced stamp scan, item 3 entry flow. The scan is server-authoritative
 * (the RPC recomputes the distance and only grants a stamp within 120 m). Rather
 * than showing its own result screen, it collects the stamp, stashes the result,
 * and routes THROUGH the globe intro -> the 3D map -> the duck page, which shows
 * a result banner. Test mode (toggled on the duck page) submits the scanned
 * spot's own coordinates so any QR works for testing without being there.
 */
export function DuckScan() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('spot');
  const userId = useIdentityStore((s) => s.userId);
  const startedRef = useRef(false);
  const [missing] = useState(!token);

  useEffect(() => {
    if (!token || !userId || startedRef.current) return;
    startedRef.current = true;

    (async () => {
      let result: StashedScanResult;
      try {
        const testMode = localStorage.getItem(TEST_MODE_KEY) === 'true';
        if (testMode) {
          const coords = await fetchDuckSpotCoords(token);
          result = coords
            ? toStashed(await scanDuckSpot(token, coords.lat, coords.lng))
            : { status: 'not_found', spotNameEn: '', spotNameJa: '', distance: 0 };
        } else {
          try {
            const p = await getPosition();
            result = toStashed(await scanDuckSpot(token, p.lat, p.lng));
          } catch {
            result = { status: 'location', spotNameEn: '', spotNameJa: '', distance: 0 };
          }
        }
      } catch {
        result = { status: 'error', spotNameEn: '', spotNameJa: '', distance: 0 };
      }

      // Hand off to the entry flow: replay the intro, then open the duck page.
      sessionStorage.setItem(DUCK_SCAN_RESULT_KEY, JSON.stringify(result));
      sessionStorage.setItem(OPEN_DUCK_AFTER_INTRO_KEY, '1');
      sessionStorage.removeItem(HAS_SEEN_INTRO_KEY);
      navigate('/', { replace: true });
    })();
  }, [token, userId, navigate]);

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-kamo-indigo px-8 text-center">
      <img src={duckMark} alt="" className="h-16 w-16 animate-[fadeIn_0.5s_ease-out]" draggable={false} />
      <p className="font-display text-lg text-kamo-stone">
        {missing ? t('scan.missingSpot') : t('scan.locating')}
      </p>
    </div>
  );
}

function toStashed(r: Awaited<ReturnType<typeof scanDuckSpot>>): StashedScanResult {
  return {
    status: r.status,
    spotNameEn: 'spotNameEn' in r ? r.spotNameEn : '',
    spotNameJa: 'spotNameJa' in r ? r.spotNameJa : '',
    distance: 'distance' in r ? r.distance : 0,
  };
}
