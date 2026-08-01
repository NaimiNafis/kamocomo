import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  addPlaceFraming,
  applyKamogawaConstraints,
  createMarkerLayer,
  createUserLocationMarker,
  flyIntroSequence,
  flyToHomeView,
  flyToPlace,
  initialCamera,
  loadMaps3d,
  orbitPlace,
  setHomeView,
  applyMapView,
  type Map3D,
  type Maps3D,
  type MarkerPoint,
  type UserLocationMarker,
} from '../../lib/map3d';
import { fetchPlaceMarkers, fetchPlacePreview, type PlacePreview } from '../../lib/places';
import { logQrEntry } from '../../lib/duck';
import { HAS_SEEN_INTRO_KEY, OPEN_DUCK_AFTER_INTRO_KEY } from '../../lib/entryFlags';
import { Intro, type IntroPhase } from '../Intro/Intro';
import { Onboarding } from '../Onboarding/Onboarding';
import { Tutorial } from '../Tutorial/Tutorial';
import { PlacePopup } from './PlacePopup';
import { LanguageToggle } from '../../components/LanguageToggle';
import { MapStyleSwitch } from '../../components/MapStyleSwitch';
import { needsOnboarding, useIdentityStore } from '../../store/identityStore';

const HAS_SEEN_TUTORIAL_KEY = 'hasSeenTutorial';
const HAS_SEEN_MAP_HINT_KEY = 'hasSeenMapHint';
const TITLE_HOLD_MS = 1800;
const CATCHPHRASE_HOLD_MS = 1900;
const MAP_HINT_AUTO_DISMISS_MS = 4000;
/** Title + catchphrase + the 7s flight, plus slack. The upper bound on how
 * long the intro can hold the screen when there's no Skip to escape with. */
const INTRO_WATCHDOG_MS = TITLE_HOLD_MS + CATCHPHRASE_HOLD_MS + 12_000;

/**
 * Full-screen Google Maps 3D globe, constrained to the Kamogawa corridor
 * (§8.1), plus the overlay chrome: top bar (tutorial + language toggle),
 * map-style switch, "you are here" marker, a "duck collection" button, and the
 * tutorial popup. The river itself is drawn as a blue overlay so it's findable
 * in both map modes.
 *
 * One duck marker per place, so the map stays uncluttered no matter how busy a
 * place gets during a gathering. Tapping one plays a cinematic and opens that
 * place's board; the duck collection button is the way to the stamp card.
 *
 * The §5.1 intro (title -> catchphrase -> Earth-to-Kamogawa flight) plays
 * once per session before the corridor lock engages -- the clamp would
 * otherwise fight the flight, which passes through views far outside Kyoto.
 */
export function MainMap() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const qrSpot = searchParams.get('from') === 'qr' ? searchParams.get('spot') : null;
  const qrLoggedRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map3D | null>(null);
  const constraintsCleanupRef = useRef<(() => void) | null>(null);
  const closeCinematicRef = useRef<() => void>(() => {});
  const userLocationRef = useRef<UserLocationMarker | null>(null);
  const headingAskedRef = useRef(false);
  const [introPhase, setIntroPhase] = useState<IntroPhase | 'done'>(() =>
    sessionStorage.getItem(HAS_SEEN_INTRO_KEY) === 'true' ? 'done' : 'title',
  );
  // Label-free by default: no place names, road names or text at all, which is
  // the view the app is designed around.
  const [showLabels, setShowLabels] = useState(false);
  const [mapFailed, setMapFailed] = useState(false);
  const [tutorialOverride, setTutorialOverride] = useState<boolean | null>(null);
  const [mapHintDismissed, setMapHintDismissed] = useState(
    () => localStorage.getItem(HAS_SEEN_MAP_HINT_KEY) === 'true',
  );
  const [placePopup, setPlacePopup] = useState<{ placeId: string; preview: PlacePreview } | null>(
    null,
  );
  const identityStatus = useIdentityStore((s) => s.status);
  const profile = useIdentityStore((s) => s.profile);
  const completeOnboarding = useIdentityStore((s) => s.completeOnboarding);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // The Maps JS API loads from Google's CDN, so everything below happens
    // after an await -- `mounted` guards every post-await effect against an
    // unmount that already ran (incl. StrictMode's double mount/cleanup).
    let mounted = true;
    let map: Map3D | null = null;
    const disposers: (() => void)[] = [];
    const timers: ReturnType<typeof setTimeout>[] = [];
    const signal = { cancelled: false };
    let finished = introPhase === 'done';

    void (async () => {
      const loaded = await loadMaps3d().catch(() => null);
      if (!mounted) return;
      if (!loaded) {
        setMapFailed(true);
        return;
      }
      // Explicitly non-null const: the hoisted helpers below close over this,
      // and TS won't carry the narrowing from `loaded` into them.
      const maps3d: Maps3D = loaded;

      map = new maps3d.Map3DElement({
        // `mode` MUST be set or the map doesn't render at all.
        mode: 'SATELLITE',
        defaultUIHidden: true,
        // Start already framed on the globe (intro) or the Delta (no intro),
        // so the first painted frame is the right one instead of a jump.
        ...initialCamera(!finished),
      });
      map.className = 'h-full w-full';
      container.appendChild(map);
      mapRef.current = map;

      const userMarker = createUserLocationMarker(maps3d, map);
      userLocationRef.current = userMarker;
      disposers.push(userMarker.dispose);

      // Tapping a place marker plays a cinematic (framing highlight -> fly-in ->
      // slow orbit) around it, then shows its popup -- one place at a time. The
      // corridor clamp is lifted for the duration (the close-up/orbit view is
      // tighter than the clamp expects) and restored when it ends.
      let cinematic: {
        cancelled: boolean;
        removeFraming: () => void;
        cancelOrbit: (() => void) | null;
      } | null = null;

      function closeCinematic() {
        if (cinematic) {
          cinematic.cancelled = true;
          cinematic.removeFraming();
          cinematic.cancelOrbit?.();
          cinematic = null;
        }
        setPlacePopup(null);
        if (mounted && map && !constraintsCleanupRef.current) {
          constraintsCleanupRef.current = applyKamogawaConstraints(map);
          void flyToHomeView(map);
        }
      }
      closeCinematicRef.current = closeCinematic;

      // One duck marker per place, and a place IS a duck spot -- fixed seed
      // data, so no realtime subscription is needed. New mains show up inside
      // a place's board, not as new markers.
      let placePoints: MarkerPoint[] = [];

      async function startPlaceCinematic(placeId: string) {
        if (cinematic || !mounted || !map) return;
        const point = placePoints.find((p) => p.id === placeId);
        if (!point) return;

        constraintsCleanupRef.current?.();
        constraintsCleanupRef.current = null;

        const removeFraming = addPlaceFraming(maps3d, map, point.lat, point.lng);
        const session = { cancelled: false, removeFraming, cancelOrbit: null as (() => void) | null };
        cinematic = session;

        const previewPromise = fetchPlacePreview(placeId).catch(() => null);

        await flyToPlace(map, point.lat, point.lng);
        if (session.cancelled || !mounted) return;

        const { promise: orbitPromise, cancel: cancelOrbit } = orbitPlace(map, point.lat, point.lng);
        session.cancelOrbit = cancelOrbit;
        await orbitPromise;
        if (session.cancelled || !mounted) return;

        const preview = await previewPromise;
        if (session.cancelled || !mounted) return;
        if (!preview) {
          closeCinematic();
          return;
        }
        setPlacePopup({ placeId, preview });
      }

      const markerLayer = createMarkerLayer(maps3d, map, (placeId) => {
        void startPlaceCinematic(placeId);
      });
      disposers.push(markerLayer.dispose);

      void fetchPlaceMarkers().then((points) => {
        if (!mounted) return;
        placePoints = points;
        markerLayer.setMarkers(placePoints);
      });

      function finishIntro() {
        if (finished || !map) return;
        finished = true;
        // Skip can fire before the title/catchphrase timers below have run;
        // without cancelling them here they'd still fire later and force
        // introPhase back out of 'done', re-opening the whole intro.
        timers.forEach(clearTimeout);
        setHomeView(map);
        map.style.pointerEvents = 'auto';
        constraintsCleanupRef.current = applyKamogawaConstraints(map);
        sessionStorage.setItem(HAS_SEEN_INTRO_KEY, 'true');
        setIntroPhase('done');
        // A duck-QR scan routes through the intro, then opens the duck page
        // (item 3): the stamp was already collected before the flight.
        if (sessionStorage.getItem(OPEN_DUCK_AFTER_INTRO_KEY) === '1') {
          sessionStorage.removeItem(OPEN_DUCK_AFTER_INTRO_KEY);
          navigate('/duck');
        }
      }

      if (finished) {
        setHomeView(map);
        constraintsCleanupRef.current = applyKamogawaConstraints(map);
      } else {
        // Scripted flight only -- no interactive input to fight it, and the
        // corridor clamp doesn't engage until the flight lands (finishIntro).
        map.style.pointerEvents = 'none';

        // With no Skip button there's no manual way out, so a flight that
        // never reports completion (a backgrounded tab can swallow
        // gmp-animationend) would strand the visitor on the overlay forever.
        // Land the intro regardless once it has had comfortably long enough.
        timers.push(
          setTimeout(() => {
            if (finished) return;
            signal.cancelled = true;
            map?.stopCameraAnimation();
            finishIntro();
          }, INTRO_WATCHDOG_MS),
        );

        timers.push(
          setTimeout(() => {
            if (finished) return;
            setIntroPhase('catchphrase');
            timers.push(
              setTimeout(() => {
                if (finished || !map) return;
                setIntroPhase('reveal');
                void flyIntroSequence(map, signal).then(() => {
                  if (!signal.cancelled) finishIntro();
                });
              }, CATCHPHRASE_HOLD_MS),
            );
          }, TITLE_HOLD_MS),
        );
      }
    })();

    return () => {
      mounted = false;
      signal.cancelled = true;
      timers.forEach(clearTimeout);
      constraintsCleanupRef.current?.();
      constraintsCleanupRef.current = null;
      disposers.forEach((dispose) => dispose());
      userLocationRef.current = null;
      map?.remove();
      mapRef.current = null;
    };
    // Runs once: the intro plays out exactly once per mount.
    // navigate()/t() are stable references, safe to omit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // §A.2a photogenic-spot QR entry: log the analytics row once identity is
  // ready (a hidden-QR scan can be the visitor's very first touch). Read-only
  // otherwise; the welcome chip below is the "you found the hidden entrance"
  // beat.
  useEffect(() => {
    if (!qrSpot || identityStatus !== 'ready' || qrLoggedRef.current) return;
    qrLoggedRef.current = true;
    void logQrEntry(qrSpot).catch(() => {});
  }, [qrSpot, identityStatus]);

  const showOnboarding =
    introPhase === 'done' && identityStatus === 'ready' && needsOnboarding(profile);

  // Auto-open the tutorial once for first-time users, after intro + onboarding
  // (if any) are out of the way; a manual open/close always overrides that.
  const readyForTutorial = introPhase === 'done' && identityStatus === 'ready' && !showOnboarding;
  const autoOpenTutorial = readyForTutorial && localStorage.getItem(HAS_SEEN_TUTORIAL_KEY) !== 'true';
  const tutorialOpen = tutorialOverride ?? autoOpenTutorial;

  function openTutorial() {
    setTutorialOverride(true);
  }

  function closeTutorial() {
    localStorage.setItem(HAS_SEEN_TUTORIAL_KEY, 'true');
    setTutorialOverride(false);
  }

  /** iOS 13+ only grants compass access from a user gesture, so the first touch
   * on the map is where we ask. Everywhere else this is a no-op. */
  function handleMapPointerDown() {
    dismissMapHint();
    if (headingAskedRef.current) return;
    headingAskedRef.current = true;
    void userLocationRef.current?.requestHeadingPermission();
  }

  function dismissMapHint() {
    if (mapHintDismissed) return;
    localStorage.setItem(HAS_SEEN_MAP_HINT_KEY, 'true');
    setMapHintDismissed(true);
  }

  // "Drag to look around" hint (mobile users otherwise don't discover the map
  // is pannable): shown once, dismissed by the first map interaction or after
  // a few seconds either way.
  useEffect(() => {
    if (introPhase !== 'done' || mapHintDismissed) return;
    const timer = setTimeout(dismissMapHint, MAP_HINT_AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [introPhase, mapHintDismissed]);

  function handleLabelsChange(next: boolean) {
    setShowLabels(next);
    if (mapRef.current) applyMapView(mapRef.current, next);
  }

  const showChrome = introPhase === 'done';

  return (
    <div className="relative h-full w-full">
      <div
        ref={containerRef}
        className="h-full w-full"
        data-testid="map-3d"
        onPointerDown={handleMapPointerDown}
      />

      {mapFailed && (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-3 bg-kamo-stone px-8 text-center">
          <p className="font-ui text-sm text-kamo-ink/70">{t('mainMap.mapError')}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-full bg-kamo-indigo px-4 py-2 font-ui text-sm text-kamo-stone"
          >
            {t('common.retry')}
          </button>
        </div>
      )}

      {showChrome && (
        <>
          <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between p-4">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={openTutorial}
                aria-label={t('mainMap.tutorialButton')}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-kamo-ink/15 bg-kamo-stone/90 font-display text-base text-kamo-ink shadow-sm backdrop-blur"
              >
                ?
              </button>
              <button
                type="button"
                onClick={() => navigate('/archive')}
                className="rounded-full border border-kamo-ink/15 bg-kamo-stone/90 px-3 py-1.5 font-ui text-xs text-kamo-ink shadow-sm backdrop-blur"
              >
                {t('mainMap.archiveButton')}
              </button>
            </div>
            <LanguageToggle />
          </div>

          <div className="absolute bottom-4 right-4 z-10">
            <MapStyleSwitch showLabels={showLabels} onLabelsChange={handleLabelsChange} />
          </div>

          {qrSpot && (
            <div className="pointer-events-none absolute inset-x-0 top-16 z-10 flex justify-center px-4">
              <div className="rounded-full bg-kamo-sunset/90 px-4 py-1.5 font-ui text-xs text-kamo-stone shadow-md backdrop-blur">
                🦆 {t('mainMap.qrWelcome')}
              </div>
            </div>
          )}

          {!mapHintDismissed && (
            <div className="pointer-events-none absolute inset-x-0 bottom-24 z-10 flex justify-center px-4">
              <div className="pointer-events-auto flex items-center gap-2 rounded-full bg-kamo-ink/80 px-4 py-2 font-ui text-xs text-kamo-stone shadow-md backdrop-blur">
                <span aria-hidden>↔</span>
                {t('mainMap.dragHint')}
                <button
                  type="button"
                  onClick={dismissMapHint}
                  aria-label={t('common.close')}
                  className="opacity-70"
                >
                  ✕
                </button>
              </div>
            </div>
          )}

          <div className="pointer-events-none absolute inset-x-0 bottom-6 z-10 flex justify-center px-4">
            <button
              type="button"
              onClick={() => navigate('/duck')}
              className="pointer-events-auto flex items-center gap-2 rounded-full bg-kamo-indigo px-5 py-2.5 font-ui text-sm font-medium text-kamo-stone shadow-lg"
            >
              <span aria-hidden>🦆</span>
              {t('mainMap.duckCollection')}
            </button>
          </div>
        </>
      )}

      {introPhase !== 'done' && <Intro phase={introPhase} />}
      {showOnboarding && <Onboarding onComplete={(fields) => void completeOnboarding(fields)} />}
      {tutorialOpen && <Tutorial onClose={closeTutorial} />}
      {placePopup && (
        <PlacePopup
          preview={placePopup.preview}
          onClose={() => closeCinematicRef.current()}
          onViewActivities={() => navigate(`/toukou?place=${placePopup.placeId}`)}
        />
      )}
    </div>
  );
}
