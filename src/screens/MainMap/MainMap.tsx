import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import * as Cesium from 'cesium';
import {
  VIEWER_OPTIONS,
  addPlaceFraming,
  applyKyotoCameraConstraints,
  applyMobilePerfSettings,
  configureCesiumIon,
  createMarkerLayers,
  flyIntroSequence,
  flyToHomeView,
  flyToPlace,
  locateAndMarkVisitor,
  orbitPlace,
  setHomeView,
  setMapStyle as applyMapStyle,
  setupMarkerTapHandler,
  type MapStyle,
  type MarkerPoint,
} from '../../lib/cesium';
import { fetchPlaceMarkers, fetchPlacePreview, type PlacePreview } from '../../lib/places';
import { fetchActiveDuckSpotMarkers } from '../../lib/duckSpots';
import { logQrEntry } from '../../lib/duck';
import { HAS_SEEN_INTRO_KEY, OPEN_DUCK_AFTER_INTRO_KEY } from '../../lib/entryFlags';
import { Intro, type IntroPhase } from '../Intro/Intro';
import { Onboarding } from '../Onboarding/Onboarding';
import { Tutorial } from '../Tutorial/Tutorial';
import { PlacePopup } from './PlacePopup';
import { LanguageToggle } from '../../components/LanguageToggle';
import { MapStyleSwitch } from '../../components/MapStyleSwitch';
import { needsOnboarding, useIdentityStore } from '../../store/identityStore';

configureCesiumIon();

const HAS_SEEN_TUTORIAL_KEY = 'hasSeenTutorial';
const HAS_SEEN_MAP_HINT_KEY = 'hasSeenMapHint';
const TITLE_HOLD_MS = 1800;
const CATCHPHRASE_HOLD_MS = 1900;
const MAP_HINT_AUTO_DISMISS_MS = 4000;

/**
 * Full-screen Cesium globe, constrained to Kyoto (§8.1), plus the overlay
 * chrome: top bar (tutorial + language toggle), map-style switch, "you are
 * here" marker, a "duck collection" button, and the tutorial popup.
 *
 * Markers are one per fixed PLACE (not per main activity), so the map stays
 * uncluttered no matter how busy a place gets during a gathering. Tapping a
 * place plays a cinematic and opens its board of activities; tapping a duck
 * goes to the duck page.
 *
 * The §5.1 intro (title -> catchphrase -> Earth-to-Kamogawa flight) plays
 * once per session before the Kyoto camera lock engages -- the clamp would
 * otherwise fight the flight, which passes through views outside Kyoto.
 */
export function MainMap() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const qrSpot = searchParams.get('from') === 'qr' ? searchParams.get('spot') : null;
  const qrLoggedRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Cesium.Viewer | null>(null);
  const constraintsCleanupRef = useRef<(() => void) | null>(null);
  const skipRef = useRef<() => void>(() => {});
  const closeCinematicRef = useRef<() => void>(() => {});
  const [introPhase, setIntroPhase] = useState<IntroPhase | 'done'>(() =>
    sessionStorage.getItem(HAS_SEEN_INTRO_KEY) === 'true' ? 'done' : 'title',
  );
  const [mapStyle, setMapStyleState] = useState<MapStyle>('photoreal');
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
    if (!containerRef.current) return;

    const v = new Cesium.Viewer(containerRef.current, VIEWER_OPTIONS);
    viewerRef.current = v;
    applyMobilePerfSettings(v);
    locateAndMarkVisitor(v);

    // One exclamation marker per PLACE + a colored duck marker per duck spot.
    // Both sets are fixed seed data, so no realtime subscription is needed --
    // new mains show up inside a place's board, not as new markers.
    const markerLayers = createMarkerLayers(v);

    let placePoints: MarkerPoint[] = [];
    void fetchPlaceMarkers().then((points) => {
      if (v.isDestroyed()) return;
      placePoints = points;
      markerLayers.setActivities(placePoints);
    });
    void fetchActiveDuckSpotMarkers().then((points) => {
      if (v.isDestroyed()) return;
      markerLayers.setDuckSpots(points);
    });

    // Tapping a place marker plays a cinematic (framing highlight -> fly-in ->
    // slow orbit) around it, then shows its popup -- one place at a time. The
    // Kyoto camera clamp is lifted for the duration (the close-up/orbit view is
    // tighter than the clamp expects) and restored when it ends.
    let cinematic: { cancelled: boolean; removeFraming: () => void; cancelOrbit: (() => void) | null } | null =
      null;

    function closeCinematic() {
      if (cinematic) {
        cinematic.cancelled = true;
        cinematic.removeFraming();
        cinematic.cancelOrbit?.();
        cinematic = null;
      }
      setPlacePopup(null);
      if (!v.isDestroyed() && !constraintsCleanupRef.current) {
        constraintsCleanupRef.current = applyKyotoCameraConstraints(v);
        void flyToHomeView(v);
      }
    }
    closeCinematicRef.current = closeCinematic;

    async function startPlaceCinematic(placeId: string) {
      if (cinematic || v.isDestroyed()) return;
      const point = placePoints.find((p) => p.id === placeId);
      if (!point) return;

      constraintsCleanupRef.current?.();
      constraintsCleanupRef.current = null;

      const removeFraming = addPlaceFraming(v, point.lat, point.lng);
      const session = { cancelled: false, removeFraming, cancelOrbit: null as (() => void) | null };
      cinematic = session;

      const previewPromise = fetchPlacePreview(placeId).catch(() => null);

      await flyToPlace(v, point.lat, point.lng);
      if (session.cancelled || v.isDestroyed()) return;

      const { promise: orbitPromise, cancel: cancelOrbit } = orbitPlace(v, point.lat, point.lng);
      session.cancelOrbit = cancelOrbit;
      await orbitPromise;
      if (session.cancelled || v.isDestroyed()) return;

      const preview = await previewPromise;
      if (session.cancelled || v.isDestroyed()) return;
      if (!preview) {
        closeCinematic();
        return;
      }
      setPlacePopup({ placeId, preview });
    }

    const removeTapHandler = setupMarkerTapHandler(v, (kind, refId) => {
      if (kind === 'duckSpot') {
        navigate('/duck');
        return;
      }
      void startPlaceCinematic(refId);
    });

    const signal = { cancelled: false };
    const timers: ReturnType<typeof setTimeout>[] = [];
    let finished = introPhase === 'done';

    function finishIntro() {
      if (finished) return;
      finished = true;
      // Skip can fire before the title/catchphrase timers below have run;
      // without cancelling them here they'd still fire later and force
      // introPhase back out of 'done', re-opening the whole intro.
      timers.forEach(clearTimeout);
      setHomeView(v);
      v.scene.screenSpaceCameraController.enableInputs = true;
      constraintsCleanupRef.current = applyKyotoCameraConstraints(v);
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
      setHomeView(v);
      constraintsCleanupRef.current = applyKyotoCameraConstraints(v);
    } else {
      // Scripted flight only -- no interactive input to fight it, and the
      // Kyoto clamp doesn't engage until the flight lands (see finishIntro).
      v.scene.screenSpaceCameraController.enableInputs = false;

      skipRef.current = () => {
        signal.cancelled = true;
        v.camera.cancelFlight();
        finishIntro();
      };

      timers.push(
        setTimeout(() => {
          if (finished) return;
          setIntroPhase('catchphrase');
          timers.push(
            setTimeout(() => {
              if (finished) return;
              setIntroPhase('reveal');
              void flyIntroSequence(v, signal).then(() => {
                if (!signal.cancelled) finishIntro();
              });
            }, CATCHPHRASE_HOLD_MS),
          );
        }, TITLE_HOLD_MS),
      );
    }

    return () => {
      timers.forEach(clearTimeout);
      cinematic?.cancelOrbit?.();
      constraintsCleanupRef.current?.();
      removeTapHandler();
      markerLayers.dispose();
      v.destroy();
      viewerRef.current = null;
    };
    // Runs once: the intro plays out (or is skipped) exactly once per mount.
    // navigate() is a stable reference from react-router, safe to omit.
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

  function handleMapStyleChange(style: MapStyle) {
    setMapStyleState(style);
    if (viewerRef.current) applyMapStyle(viewerRef.current, style);
  }

  const showChrome = introPhase === 'done';

  return (
    <div className="relative h-full w-full">
      <div
        ref={containerRef}
        className="h-full w-full"
        data-testid="cesium-globe"
        onPointerDown={dismissMapHint}
      />

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
            <MapStyleSwitch value={mapStyle} onChange={handleMapStyleChange} />
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

      {introPhase !== 'done' && <Intro phase={introPhase} onSkip={() => skipRef.current()} />}
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
