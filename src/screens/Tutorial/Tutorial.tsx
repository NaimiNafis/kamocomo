import { useRef, useState, type TouchEvent } from 'react';
import { useTranslation } from 'react-i18next';

const SLIDE_COUNT = 5;
const SWIPE_THRESHOLD_PX = 40;

interface TutorialProps {
  onClose: () => void;
}

/**
 * §5.4 tutorial overlay: 5 slides, media placeholder on top + i18n text
 * below, dot pagination, swipe + arrows, close button. Fully opaque over the
 * map (the map itself stays mounted underneath but receives no input, since
 * this overlay covers the viewport and captures every pointer event).
 */
export function Tutorial({ onClose }: TutorialProps) {
  const { t } = useTranslation();
  const [index, setIndex] = useState(0);
  const touchStartX = useRef<number | null>(null);

  function goTo(next: number) {
    setIndex(Math.max(0, Math.min(SLIDE_COUNT - 1, next)));
  }

  function handleTouchStart(e: TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
  }

  function handleTouchEnd(e: TouchEvent) {
    if (touchStartX.current === null) return;
    const delta = e.changedTouches[0].clientX - touchStartX.current;
    if (delta > SWIPE_THRESHOLD_PX) goTo(index - 1);
    else if (delta < -SWIPE_THRESHOLD_PX) goTo(index + 1);
    touchStartX.current = null;
  }

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-kamo-ink/60 p-4">
      <div
        className="w-full max-w-sm overflow-hidden rounded-2xl bg-kamo-stone shadow-xl"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div className="flex items-center justify-between border-b border-kamo-ink/10 px-4 py-2">
          <span className="font-ui text-xs font-medium uppercase tracking-wide text-kamo-ink/60">
            {t('tutorial.heading')}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="font-ui text-sm text-kamo-ink/70"
            aria-label={t('common.close')}
          >
            {t('common.close')}
          </button>
        </div>

        <div className="mx-6 mt-6 flex h-40 items-center justify-center rounded-xl bg-kamo-sand/60">
          <span className="font-ui text-xs text-kamo-ink/40">{t('tutorial.mediaPlaceholder')}</span>
        </div>

        <div className="px-6 py-5 text-center">
          <h3 className="font-display text-lg text-kamo-ink">{t(`tutorial.slides.${index}.title`)}</h3>
          <p className="mt-2 font-ui text-sm text-kamo-ink/70">{t(`tutorial.slides.${index}.body`)}</p>
        </div>

        <div className="flex items-center justify-between px-4 pb-5">
          <button
            type="button"
            onClick={() => goTo(index - 1)}
            disabled={index === 0}
            aria-label={t('tutorial.previous')}
            className="rounded-full px-3 py-1.5 font-ui text-lg text-kamo-ink disabled:opacity-30"
          >
            ‹
          </button>

          <div className="flex gap-1.5">
            {Array.from({ length: SLIDE_COUNT }, (_, i) => (
              <span
                key={i}
                className={`h-1.5 w-1.5 rounded-full transition-colors ${
                  i === index ? 'bg-kamo-indigo' : 'bg-kamo-ink/20'
                }`}
              />
            ))}
          </div>

          <button
            type="button"
            onClick={() => goTo(index + 1)}
            disabled={index === SLIDE_COUNT - 1}
            aria-label={t('tutorial.next')}
            className="rounded-full px-3 py-1.5 font-ui text-lg text-kamo-ink disabled:opacity-30"
          >
            ›
          </button>
        </div>
      </div>
    </div>
  );
}
