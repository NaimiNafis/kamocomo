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
import {
  fetchActivityPreview,
  fetchMainActivityMarkers,
  subscribeToNewMainActivities,
  type ActivityPreview,
} from '../../lib/activities';
import { fetchActiveDuckSpotMarkers } from '../../lib/duckSpots';
import { logQrEntry } from '../../lib/duck';
import { Intro, type IntroPhase } from '../Intro/Intro';
import { Onboarding } from '../Onboarding/Onboarding';
import { Tutorial } from '../Tutorial/Tutorial';
import { PlacePopup } from './PlacePopup';
import { LanguageToggle } from '../../components/LanguageToggle';
import { MapStyleSwitch } from '../../components/MapStyleSwitch';
import { needsOnboarding, useIdentityStore } from '../../store/identityStore';

configureCesiumIon();

const HAS_SEEN_INTRO_KEY = 'hasSeenIntro';
const HAS_SEEN_TUTORIAL_KEY = 'hasSeenTutorial';
const HAS_SEEN_MAP_HINT_KEY = 'hasSeenMapHint';
const TITLE_HOLD_MS = 1800;
const CATCHPHRASE_HOLD_MS = 1900;
const MAP_HINT_AUTO_DISMISS_MS = 4000;

/**
 * Full-screen Cesium globe, constrained to Kyoto (§8.1), plus the §5.3/§5.4
 * overlay chrome: top bar (tutorial button + language toggle), bottom-right
 * map-style switch, "you are here" marker, and the tutorial popup.
 *
 * The §5.1 intro (title -> catchphrase -> Earth-to-Kamogawa flight) plays
 * once per session on top of this same globe/viewer before the Kyoto camera
 * lock engages -- the bounding-box clamp would otherwise fight the flight,
 * since the flight legitimately passes through Earth/Japan views outside it.
 * The rest of the chrome only appears once the intro has landed.
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
  const [placePopup, setPlacePopup] = useState<{ mainId: string; preview: ActivityPreview } | null>(
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

    // §5.3/§5.4 markers: exclamation from main activities, duck from duck
    // spots. Realtime keeps the activity set current without a reload.
    const markerLayers = createMarkerLayers(v);

    let activityPoints: MarkerPoint[] = [];
    void fetchMainActivityMarkers().then((points) => {
      if (v.isDestroyed()) return;
      activityPoints = points;
      markerLayers.setActivities(activityPoints);
    });
    void fetchActiveDuckSpotMarkers().then((points) => {
      if (v.isDestroyed()) return;
      markerLayers.setDuckSpots(points);
    });
    const unsubscribeActivityInserts = subscribeToNewMainActivities((marker) => {
      if (v.isDestroyed()) return;
      if (activityPoints.some((p) => p.id === marker.id)) return;
      activityPoints = [...activityPoints, marker];
      markerLayers.setActivities(activityPoints);
    });

    // §B: tapping an exclamation marker plays a cinematic (framing highlight
    // -> fly-in -> slow orbit) around that specific place, then shows a popup
    // for it -- one place, one cinematic at a time (see `cinematic` below).
    // The Kyoto camera clamp is lifted for the duration (the close-up/orbit
    // view is tighter than the clamp expects) and restored when it ends.
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

    async function startPlaceCinematic(mainId: string) {
      if (cinematic || v.isDestroyed()) return;
      const point = activityPoints.find((p) => p.id === mainId);
      if (!point) return;

      constraintsCleanupRef.current?.();
      constraintsCleanupRef.current = null;

      const removeFraming = addPlaceFraming(v, point.lat, point.lng);
      const session = { cancelled: false, removeFraming, cancelOrbit: null as (() => void) | null };
      cinematic = session;

      const previewPromise = fetchActivityPreview(mainId).catch(() => null);

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
      setPlacePopup({ mainId, preview });
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
      unsubscribeActivityInserts();
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
        </>
      )}

      {introPhase !== 'done' && <Intro phase={introPhase} onSkip={() => skipRef.current()} />}
      {showOnboarding && <Onboarding onComplete={(fields) => void completeOnboarding(fields)} />}
      {tutorialOpen && <Tutorial onClose={closeTutorial} />}
      {placePopup && (
        <PlacePopup
          preview={placePopup.preview}
          onClose={() => closeCinematicRef.current()}
          onViewActivity={() => navigate(`/toukou?main=${placePopup.mainId}`)}
        />
      )}
    </div>
  );
}
