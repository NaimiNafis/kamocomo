import { useTranslation } from 'react-i18next';

export type IntroPhase = 'title' | 'catchphrase' | 'reveal';

interface IntroProps {
  phase: IntroPhase;
}

/**
 * §5.1 intro overlay: title fades in, cross-fades to the catchphrase, then
 * fades away to reveal the globe (rendered by the parent) while it flies from
 * the far side of Earth to the Kamogawa Delta. Purely presentational -- timing
 * and the camera flight live in MainMap, which owns the map element.
 *
 * There is deliberately no Skip: the flight is the app's opening statement and
 * plays once per session. MainMap keeps a watchdog so a stalled flight can't
 * strand anyone on this overlay now that there's no manual way out.
 */
export function Intro({ phase }: IntroProps) {
  const { t } = useTranslation();

  return (
    <div className="absolute inset-0 z-10">
      <div
        className="absolute inset-0 flex items-center justify-center bg-kamo-indigo transition-opacity duration-1000"
        style={{ opacity: phase === 'reveal' ? 0 : 1 }}
      >
        <div className="relative h-40 w-full max-w-md px-6">
          {/* The name holds one line at any width. It's set in caps, where a
              wrap reads as a mistake rather than a line break -- so the size
              tracks the viewport between a floor and a ceiling instead of being
              fixed and overflowing the narrow end. */}
          <h1
            className="absolute inset-0 flex items-center justify-center whitespace-nowrap text-center font-display leading-tight text-kamo-stone transition-opacity duration-700"
            style={{
              opacity: phase === 'title' ? 1 : 0,
              fontSize: 'clamp(1.5rem, 7vw, 2.25rem)',
              // Extra air between the two words, on top of the space already
              // in the string. em-based so it scales with the clamp() above
              // instead of going fixed at one size and cramped at another.
              wordSpacing: '0.1em',
            }}
          >
            {t('app.title')}
          </h1>
          <p
            className="absolute inset-0 flex items-center justify-center text-balance text-center font-display text-2xl text-kamo-stone transition-opacity duration-700"
            style={{ opacity: phase === 'catchphrase' ? 1 : 0 }}
          >
            {t('app.catchphrase')}
          </p>
        </div>
      </div>
    </div>
  );
}
