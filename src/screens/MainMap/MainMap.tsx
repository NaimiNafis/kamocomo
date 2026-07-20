import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import * as Cesium from 'cesium';
import {
  VIEWER_OPTIONS,
  applyKyotoCameraConstraints,
  configureCesiumIon,
  createMarkerLayers,
  flyIntroSequence,
  locateAndMarkVisitor,
  setHomeView,
  setMapStyle as applyMapStyle,
  setupMarkerTapHandler,
  type MapStyle,
  type MarkerPoint,
} from '../../lib/cesium';
import { fetchMainActivityMarkers, subscribeToNewMainActivities } from '../../lib/activities';
import { fetchActiveDuckSpotMarkers } from '../../lib/duckSpots';
import { Intro, type IntroPhase } from '../Intro/Intro';
import { Onboarding } from '../Onboarding/Onboarding';
import { Tutorial } from '../Tutorial/Tutorial';
import { LanguageToggle } from '../../components/LanguageToggle';
import { MapStyleSwitch } from '../../components/MapStyleSwitch';
import { needsOnboarding, useIdentityStore } from '../../store/identityStore';

configureCesiumIon();

const HAS_SEEN_INTRO_KEY = 'hasSeenIntro';
const HAS_SEEN_TUTORIAL_KEY = 'hasSeenTutorial';
const TITLE_HOLD_MS = 1800;
const CATCHPHRASE_HOLD_MS = 1900;

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
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Cesium.Viewer | null>(null);
  const constraintsCleanupRef = useRef<(() => void) | null>(null);
  const skipRef = useRef<() => void>(() => {});
  const [introPhase, setIntroPhase] = useState<IntroPhase | 'done'>(() =>
    sessionStorage.getItem(HAS_SEEN_INTRO_KEY) === 'true' ? 'done' : 'title',
  );
  const [mapStyle, setMapStyleState] = useState<MapStyle>('photoreal');
  const [tutorialOverride, setTutorialOverride] = useState<boolean | null>(null);
  const identityStatus = useIdentityStore((s) => s.status);
  const profile = useIdentityStore((s) => s.profile);
  const completeOnboarding = useIdentityStore((s) => s.completeOnboarding);

  useEffect(() => {
    if (!containerRef.current) return;

    const v = new Cesium.Viewer(containerRef.current, VIEWER_OPTIONS);
    viewerRef.current = v;
    locateAndMarkVisitor(v);

    // §5.3/§5.4 markers: exclamation from main activities, duck from duck
    // spots. Realtime keeps the activity set current without a reload.
    const markerLayers = createMarkerLayers(v);
    const removeTapHandler = setupMarkerTapHandler(v, (kind) => {
      navigate(kind === 'activity' ? '/toukou' : '/duck');
    });

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

  function handleMapStyleChange(style: MapStyle) {
    setMapStyleState(style);
    if (viewerRef.current) applyMapStyle(viewerRef.current, style);
  }

  const showChrome = introPhase === 'done';

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" data-testid="cesium-globe" />

      {showChrome && (
        <>
          <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between p-4">
            <button
              type="button"
              onClick={openTutorial}
              aria-label={t('mainMap.tutorialButton')}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-kamo-ink/15 bg-kamo-stone/90 font-display text-base text-kamo-ink shadow-sm backdrop-blur"
            >
              ?
            </button>
            <LanguageToggle />
          </div>

          <div className="absolute bottom-4 right-4 z-10">
            <MapStyleSwitch value={mapStyle} onChange={handleMapStyleChange} />
          </div>
        </>
      )}

      {introPhase !== 'done' && <Intro phase={introPhase} onSkip={() => skipRef.current()} />}
      {showOnboarding && <Onboarding onComplete={(fields) => void completeOnboarding(fields)} />}
      {tutorialOpen && <Tutorial onClose={closeTutorial} />}
    </div>
  );
}
