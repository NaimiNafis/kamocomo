import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  addPlaceFraming,
  applyKamogawaConstraints,
  createMarkerLayer,
  createUserLocationMarker,
  flyIntroSequence,
  INTRO_FLIGHT_MS,
  flyToHomeView,
  flyToPlace,
  HOME_LOOK,
  initialCamera,
  loadMaps3d,
  onMapsAuthFailure,
  orbitPlace,
  setHomeView,
  applyMapView,
  type Map3D,
  type Maps3D,
  type MapStyle,
  type MarkerLayer,
  type MarkerPoint,
  type UserLocationMarker,
} from '../../lib/map3d';
import { createMap2D, type Map2DHandle } from '../../lib/map2d';
import {
  fetchPlaceMarkers,
  fetchPlacePreview,
  nearestDuck,
  type PlacePreview,
} from '../../lib/places';
import { DEMO_POSITION } from '../../lib/geo';
import { TEST_MODE_KEY } from '../../lib/entryFlags';
import { logQrEntry } from '../../lib/duck';
import { HAS_SEEN_INTRO_KEY, OPEN_DUCK_AFTER_INTRO_KEY } from '../../lib/entryFlags';
import { Intro, type IntroPhase } from '../Intro/Intro';
import { Onboarding } from '../Onboarding/Onboarding';
import { Tutorial } from '../Tutorial/Tutorial';
import { PlacePopup } from './PlacePopup';
import { LanguageToggle } from '../../components/LanguageToggle';
import { MapControls } from '../../components/MapControls';
import { HelpIcon } from '../../components/icons';
import { needsOnboarding, useIdentityStore } from '../../store/identityStore';

const HAS_SEEN_TUTORIAL_KEY = 'hasSeenTutorial';
const HAS_SEEN_MAP_HINT_KEY = 'hasSeenMapHint';
const TITLE_HOLD_MS = 1800;
const CATCHPHRASE_HOLD_MS = 1900;
const MAP_HINT_AUTO_DISMISS_MS = 4000;
/** Title + catchphrase + the 7s flight, plus slack. The upper bound on how
 * long the intro can hold the screen when there's no Skip to escape with. */
const INTRO_WATCHDOG_MS = TITLE_HOLD_MS + CATCHPHRASE_HOLD_MS + 12_000;
/** How far before the flight ends the controls start fading up, so they're
 * in place by the time the camera stops rather than arriving after it. */
const CHROME_LEAD_MS = 900;

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
  // The flat map is built the first time someone actually asks for it. A 2D map
  // load bills to its own SKU, so a visitor who never leaves 3D never spends one.
  const map2dRef = useRef<Map2DHandle | null>(null);
  const map2dContainerRef = useRef<HTMLDivElement>(null);
  const placePointsRef = useRef<MarkerPoint[]>([]);
  const markerLayerRef = useRef<MarkerLayer | null>(null);
  const lastPositionRef = useRef<{ lat: number; lng: number } | null>(null);
  const pendingCameraRef = useRef<{ lat: number; lng: number; range: number } | null>(null);
  const headingAskedRef = useRef(false);
  /**
   * The controls appear as the flight lands, not a beat after it.
   *
   * They used to wait on `introPhase === 'done'`, which is set from the map's
   * `gmp-animationend` -- and that fires an appreciable moment after the camera
   * has visibly stopped. The river would sit there, still, with nothing to
   * press, which reads as the app having hung rather than having arrived.
   *
   * So they're timed off the flight's own known length instead, appearing just
   * before it ends and fading up as it settles. Everything that would interrupt
   * -- onboarding, the tutorial, the map hint -- still waits for 'done', since
   * none of those should open over a moving camera.
   */
  const [chromeReady, setChromeReady] = useState(false);

  const [introPhase, setIntroPhase] = useState<IntroPhase | 'done'>(() =>
    sessionStorage.getItem(HAS_SEEN_INTRO_KEY) === 'true' ? 'done' : 'title',
  );
  // Label-free 3D by default: no place names, road names or text at all, which
  // is the view the app is designed around.
  const [mapStyle, setMapStyleState] = useState<MapStyle>('3d');
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

      // Light the duck you're closest to, brighter the nearer you get. That's
      // the map answering "where am I on the river" itself, instead of leaving
      // you to read the dot's position against eight identical marks.
      //
      // Test mode pins the visitor near the Delta so the effect is visible away
      // from Kyoto -- the same toggle that lets the 図鑑 collect from anywhere.
      const pretendAtRiver = localStorage.getItem(TEST_MODE_KEY) === 'true';
      const userMarker = createUserLocationMarker(maps3d, map, {
        fixedPosition: pretendAtRiver ? DEMO_POSITION : undefined,
        onPositionChange: applyPosition,
      });
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
        // The flat map has no cinematic to unwind, but it did slide over to a
        // duck -- glide back so closing leaves you where opening found you.
        // Same scale it was at, since opening never changed it.
        const flat = map2dRef.current;
        if (flat) {
          flat.cancelGlide();
          void flat.glideTo(HOME_LOOK.lat, HOME_LOOK.lng);
        }
        if (mounted && map && !constraintsCleanupRef.current) {
          constraintsCleanupRef.current = applyKamogawaConstraints(map);
          void flyToHomeView(map);
        }
      }
      closeCinematicRef.current = closeCinematic;

      // Both surfaces are fed from here rather than each subscribing on its own,
      // so the flat map can't drift out of sync with the 3D one.
      function applyPosition(lat: number, lng: number) {
        if (!mounted) return;
        lastPositionRef.current = { lat, lng };
        const near = nearestDuck(placePointsRef.current, lat, lng);
        markerLayerRef.current?.setProximity(near?.id ?? null, near?.level ?? 0);
        map2dRef.current?.setProximity(near?.id ?? null, near?.level ?? 0);
        map2dRef.current?.setUserPosition(lat, lng, null);
      }

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
      markerLayerRef.current = markerLayer;
      disposers.push(markerLayer.dispose);

      void fetchPlaceMarkers().then((points) => {
        if (!mounted) return;
        placePoints = points;
        // The flat map draws the same set, and it may be built long after this
        // resolves, so the points have to outlive this closure.
        placePointsRef.current = points;
        markerLayer.setMarkers(placePoints);
        map2dRef.current?.setMarkers(points);
        // The first fix lands before the markers do, so nothing was lit yet.
        // Re-apply it now there is something to light.
        const fix = lastPositionRef.current;
        if (fix) applyPosition(fix.lat, fix.lng);
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
                timers.push(
                  setTimeout(
                    () => !signal.cancelled && setChromeReady(true),
                    Math.max(0, INTRO_FLIGHT_MS - CHROME_LEAD_MS),
                  ),
                );
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
      map2dRef.current?.dispose();
      map2dRef.current = null;
      markerLayerRef.current = null;
      userLocationRef.current = null;
      map?.remove();
      mapRef.current = null;
    };
    // Runs once: the intro plays out exactly once per mount.
    // navigate()/t() are stable references, safe to omit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Quota exhausted, referrer rejected, billing lapsed: Google refuses the map
  // long after the library promise resolved, so the load path can't catch it.
  // This turns that into the app's own error state with a retry, instead of
  // Google's grey panel.
  useEffect(() => onMapsAuthFailure(() => setMapFailed(true)), []);

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
    map2dRef.current?.setLabels(next);
  }

  /**
   * Switch surfaces, handing the camera across so you keep looking at the same
   * stretch of river rather than being dropped somewhere else.
   *
   * Only records where to go; the flat map is built and moved in the effect
   * below. Building it here would run before React re-rendered, while its
   * container is still `visibility: hidden` — and Google Maps sizes itself from
   * its container at construction, so it would come up blank.
   */
  function handleMapStyleChange(next: MapStyle) {
    if (next === mapStyle) return;
    const height = containerRef.current?.clientHeight ?? 800;

    if (next === '2d') {
      const centre = mapRef.current?.center;
      pendingCameraRef.current =
        centre && typeof centre.lat === 'number' && typeof centre.lng === 'number'
          ? { lat: centre.lat, lng: centre.lng, range: mapRef.current?.range ?? 4500 }
          : null;
    } else {
      // Coming back: point the 3D camera where the flat map was looking.
      const view = map2dRef.current?.readView(height);
      const map3d = mapRef.current;
      if (view && map3d) {
        map3d.center = { lat: view.lat, lng: view.lng, altitude: 0 };
        map3d.range = view.range;
      }
    }
    setMapStyleState(next);
  }

  // Builds the flat map the first time it's shown, and points it wherever the
  // 3D camera was. Runs after the render that makes its container visible.
  useEffect(() => {
    if (mapStyle !== '2d') return;
    const container = map2dContainerRef.current;
    if (!container) return;
    let cancelled = false;

    void (async () => {
      if (!map2dRef.current) {
        try {
          const handle = await createMap2D(container, (id) => void openPlaceFrom2D(id));
          if (cancelled) return;
          map2dRef.current = handle;
          handle.setLabels(showLabels);
          handle.setMarkers(placePointsRef.current);
          // Built long after the first fix, so catch it up rather than leaving
          // it with no dot and no glow until the next position update.
          const fix = lastPositionRef.current;
          if (fix) {
            const near = nearestDuck(placePointsRef.current, fix.lat, fix.lng);
            handle.setProximity(near?.id ?? null, near?.level ?? 0);
            handle.setUserPosition(fix.lat, fix.lng, null);
          }
        } catch {
          if (!cancelled) setMapStyleState('3d'); // couldn't build it; stay put
          return;
        }
      }
      const target = pendingCameraRef.current;
      pendingCameraRef.current = null;
      if (target) {
        map2dRef.current.moveTo(
          target.lat,
          target.lng,
          target.range,
          containerRef.current?.clientHeight ?? 800,
        );
      }
    })();

    return () => {
      cancelled = true;
    };
    // showLabels is applied by handleLabelsChange; re-running on it would
    // rebuild nothing and re-move the camera under the user.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapStyle]);

  /**
   * A duck tapped on the flat map slides to the middle, then its popup opens.
   *
   * It used to jump straight to the board, on the reasoning that the arrival is
   * a 3D camera move with no meaning here -- but the part that mattered was
   * never the camera. Tapping a duck should show you what's happening at that
   * spot before it takes you anywhere.
   *
   * What doesn't carry over is the closing-in: the orbit has no meaning without
   * a third dimension, and zooming turned out to be no better, since a raster
   * map can only step through whole levels. Centring the marker says "this one"
   * on its own.
   */
  async function openPlaceFrom2D(placeId: string) {
    const handle = map2dRef.current;
    const point = placePointsRef.current.find((p) => p.id === placeId);
    if (!handle || !point) {
      navigate(`/toukou?place=${placeId}`);
      return;
    }
    // Fetch alongside the move rather than after it, so the popup is ready the
    // moment the map settles.
    const previewPromise = fetchPlacePreview(placeId).catch(() => null);
    await handle.glideTo(point.lat, point.lng);
    const preview = await previewPromise;
    if (preview) setPlacePopup({ placeId, preview });
  }

  const showChrome = introPhase === 'done' || chromeReady;

  return (
    <div className="relative h-full w-full">
      <div
        ref={containerRef}
        className="h-full w-full"
        style={{ visibility: mapStyle === '3d' ? 'visible' : 'hidden' }}
        data-testid="map-3d"
        onPointerDown={handleMapPointerDown}
      />
      {/* Kept mounted rather than unmounted so switching back doesn't rebuild
          the map -- a rebuild would be another billable map load. */}
      <div
        ref={map2dContainerRef}
        className="absolute inset-0 h-full w-full"
        style={{ visibility: mapStyle === '2d' ? 'visible' : 'hidden' }}
        data-testid="map-2d"
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
          {/* Only two things sit up top: help on the left, language on the
              right. Everything else moved into the column below, so the first
              thing a visitor sees is the river rather than a control panel. */}
          <div
            className="absolute inset-x-0 top-0 z-10 flex items-start justify-between p-4"
            style={{ animation: 'fadeIn 700ms ease-out both' }}
          >
            <button
              type="button"
              onClick={openTutorial}
              aria-label={t('mainMap.tutorialButton')}
              className="flex h-11 w-11 items-center justify-center rounded-xl border border-kamo-ink/15 bg-kamo-stone/90 text-kamo-ink shadow-md backdrop-blur transition-transform duration-150 active:scale-[0.94]"
            >
              <HelpIcon size={22} />
            </button>
            <LanguageToggle />
          </div>

          <div
            className="absolute bottom-4 right-4 z-10"
            style={{ animation: 'fadeIn 700ms ease-out both' }}
          >
            <MapControls
              onOpenCollection={() => navigate('/duck')}
              onOpenLibrary={() => navigate('/archive')}
              style={mapStyle}
              showLabels={showLabels}
              onStyleChange={handleMapStyleChange}
              onLabelsChange={handleLabelsChange}
            />
          </div>

          {qrSpot && (
            <div className="pointer-events-none absolute inset-x-0 top-16 z-10 flex justify-center px-4">
              <div className="rounded-full bg-kamo-sunset/90 px-4 py-1.5 font-ui text-xs text-kamo-stone shadow-md backdrop-blur">
                🦆 {t('mainMap.qrWelcome')}
              </div>
            </div>
          )}

          {!mapHintDismissed && (
            <div className="pointer-events-none absolute inset-x-0 bottom-8 z-10 flex justify-center px-4">
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
