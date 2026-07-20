import { useTranslation } from 'react-i18next';

export type IntroPhase = 'title' | 'catchphrase' | 'reveal';

interface IntroProps {
  phase: IntroPhase;
  onSkip: () => void;
}

/**
 * §5.1 intro overlay: title fades in, cross-fades to the catchphrase, then
 * fades away to reveal the globe (rendered by the parent) while it flies
 * Earth -> Japan -> Kyoto -> Kamogawa Delta. Purely presentational -- timing
 * and the Cesium flight live in MainMap, which owns the Viewer instance.
 */
export function Intro({ phase, onSkip }: IntroProps) {
  const { t } = useTranslation();

  return (
    <div className="absolute inset-0 z-10">
      <div
        className="absolute inset-0 flex items-center justify-center bg-kamo-indigo transition-opacity duration-1000"
        style={{ opacity: phase === 'reveal' ? 0 : 1 }}
      >
        <div className="relative h-40 w-full max-w-sm px-6">
          <h1
            className="absolute inset-0 flex items-center justify-center text-center font-display text-4xl text-kamo-stone transition-opacity duration-700"
            style={{ opacity: phase === 'title' ? 1 : 0 }}
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
      <button
        type="button"
        onClick={onSkip}
        className="absolute bottom-8 right-8 font-ui text-sm text-kamo-stone underline underline-offset-4"
      >
        {t('common.skip')}
      </button>
    </div>
  );
}
