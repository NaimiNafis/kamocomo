import { useEffect, useRef, useState } from 'react';
import * as Cesium from 'cesium';
import {
  VIEWER_OPTIONS,
  applyKyotoCameraConstraints,
  configureCesiumIon,
  flyIntroSequence,
  setHomeView,
} from '../../lib/cesium';
import { Intro, type IntroPhase } from '../Intro/Intro';
import { Onboarding } from '../Onboarding/Onboarding';
import { needsOnboarding, useIdentityStore } from '../../store/identityStore';

configureCesiumIon();

const HAS_SEEN_INTRO_KEY = 'hasSeenIntro';
const TITLE_HOLD_MS = 1800;
const CATCHPHRASE_HOLD_MS = 1900;

/**
 * Full-screen Cesium globe, constrained to Kyoto (§8.1). This is the base of
 * the main-map route (§5.3); the overlay chrome (tutorial button, language
 * toggle, map-style switch, "you are here" marker) lands in Phase 4.
 *
 * The §5.1 intro (title -> catchphrase -> Earth-to-Kamogawa flight) plays
 * once per session on top of this same globe/viewer before the Kyoto camera
 * lock engages -- the bounding-box clamp would otherwise fight the flight,
 * since the flight legitimately passes through Earth/Japan views outside it.
 */
export function MainMap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const constraintsCleanupRef = useRef<(() => void) | null>(null);
  const skipRef = useRef<() => void>(() => {});
  const [introPhase, setIntroPhase] = useState<IntroPhase | 'done'>(() =>
    sessionStorage.getItem(HAS_SEEN_INTRO_KEY) === 'true' ? 'done' : 'title',
  );
  const identityStatus = useIdentityStore((s) => s.status);
  const profile = useIdentityStore((s) => s.profile);
  const completeOnboarding = useIdentityStore((s) => s.completeOnboarding);

  useEffect(() => {
    if (!containerRef.current) return;

    const v = new Cesium.Viewer(containerRef.current, VIEWER_OPTIONS);
    const signal = { cancelled: false };
    const timers: ReturnType<typeof setTimeout>[] = [];
    let finished = introPhase === 'done';

    function finishIntro() {
      if (finished) return;
      finished = true;
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
          setIntroPhase('catchphrase');
          timers.push(
            setTimeout(() => {
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
      v.destroy();
    };
    // Runs once: the intro plays out (or is skipped) exactly once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showOnboarding =
    introPhase === 'done' && identityStatus === 'ready' && needsOnboarding(profile);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" data-testid="cesium-globe" />
      {introPhase !== 'done' && <Intro phase={introPhase} onSkip={() => skipRef.current()} />}
      {showOnboarding && <Onboarding onComplete={(fields) => void completeOnboarding(fields)} />}
    </div>
  );
}
