import { useEffect, useRef, useState, type TouchEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeftIcon, ChevronRightIcon } from '../../components/icons';
import { EXAMPLE_PHOTOS } from '../../lib/photos';

/**
 * One image per slide, in slide order.
 *
 * ⚠ These are all the same placeholder because `img/kamogawa/` currently holds
 * exactly one photo. Drop five real Kamogawa shots in there, import them, and
 * list them here — nothing else needs to change. Deliberately not sourced from
 * an image service: §4 bars stock imagery, and remote URLs would put the
 * tutorial behind a network request on a screen that has to work on bad signal.
 */
/** One photo per slide, spaced across the pool rather than taken off the front,
 * so consecutive cards in the cover flow don't look alike. Five stand-ins until
 * there are five photos actually *about* each step. */
const SLIDE_IMAGES = Array.from(
  { length: 5 },
  (_, i) => EXAMPLE_PHOTOS[Math.floor((i * EXAMPLE_PHOTOS.length) / 5) % EXAMPLE_PHOTOS.length],
);

const SLIDE_COUNT = SLIDE_IMAGES.length;
const SWIPE_THRESHOLD_PX = 40;

/** Cards further than this from the active one aren't drawn at all. */
const VISIBLE_DEPTH = 2;

/**
 * §5.4 tutorial overlay.
 *
 * The slides are a cover flow: the active card faces you, its neighbours are
 * turned away in 3D and stacked behind, and moving through them rotates the
 * whole rack. It replaced a static grey "photo / video" box, which told a
 * first-time visitor nothing and looked like something that had failed to load.
 *
 * Built with CSS transforms and transitions rather than an animation library.
 * The whole effect is one `transform` per card on a `preserve-3d` stage, so a
 * physics runtime would be ~50KB to do what six lines of CSS already do — and
 * this screen opens automatically on a first visit, often outdoors.
 */
export function Tutorial({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const [index, setIndex] = useState(0);
  const touchStartX = useRef<number | null>(null);

  function goTo(next: number) {
    setIndex(Math.max(0, Math.min(SLIDE_COUNT - 1, next)));
  }

  // Arrow keys, since this is a horizontal filmstrip and a keyboard user will
  // reach for them before finding the buttons.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') setIndex((i) => Math.max(0, i - 1));
      if (e.key === 'ArrowRight') setIndex((i) => Math.min(SLIDE_COUNT - 1, i + 1));
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

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

        {/* The stage. `perspective` lives here and `preserve-3d` on the rack, so
            the rotated cards actually recede rather than just squashing. */}
        <div
          className="relative flex h-44 items-center justify-center overflow-hidden"
          style={{ perspective: '1000px' }}
        >
          <div className="relative flex h-full w-full items-center justify-center [transform-style:preserve-3d]">
            {SLIDE_IMAGES.map((src, i) => {
              const offset = i - index;
              const depth = Math.abs(offset);
              if (depth > VISIBLE_DEPTH) return null;
              const isActive = offset === 0;
              const turn = isActive ? 0 : offset < 0 ? 38 : -38;

              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => goTo(i)}
                  aria-label={t(`tutorial.slides.${i}.title`)}
                  aria-current={isActive}
                  className="absolute w-[92px] overflow-hidden rounded-xl shadow-xl ring-1 ring-kamo-ink/10 transition-[transform,opacity] duration-500 ease-out"
                  style={{
                    aspectRatio: '3 / 4',
                    zIndex: 100 - depth,
                    opacity: 1 - depth * 0.3,
                    transform: `translateX(${offset * 34}px) translateZ(${
                      isActive ? 50 : -depth * 60
                    }px) rotateY(${turn}deg) scale(${isActive ? 1.12 : 1 - depth * 0.08})`,
                  }}
                >
                  <img
                    src={src}
                    alt=""
                    className="h-full w-full object-cover"
                    draggable={false}
                  />
                  {!isActive && <span className="absolute inset-0 bg-kamo-ink/25" />}
                </button>
              );
            })}
          </div>
        </div>

        <div className="px-6 pb-1 pt-4 text-center">
          <h3 className="font-display text-lg text-kamo-ink">
            {t(`tutorial.slides.${index}.title`)}
          </h3>
          <p className="mx-auto mt-2 max-w-[15rem] text-balance font-ui text-sm leading-relaxed text-kamo-ink/70">
            {t(`tutorial.slides.${index}.body`)}
          </p>
        </div>

        <div className="flex items-center justify-center gap-3 px-4 pb-5 pt-3">
          <button
            type="button"
            onClick={() => goTo(index - 1)}
            disabled={index === 0}
            aria-label={t('tutorial.previous')}
            className="flex h-8 w-8 items-center justify-center rounded-full text-kamo-ink transition-colors hover:bg-kamo-ink/5 disabled:opacity-25"
          >
            <ChevronLeftIcon />
          </button>

          {/* The active dot stretches into a bar, so progress is legible at a
              glance instead of having to count identical dots. */}
          <div className="flex items-center gap-1.5">
            {SLIDE_IMAGES.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => goTo(i)}
                aria-label={t(`tutorial.slides.${i}.title`)}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === index ? 'w-5 bg-kamo-indigo' : 'w-1.5 bg-kamo-ink/20'
                }`}
              />
            ))}
          </div>

          <button
            type="button"
            onClick={index === SLIDE_COUNT - 1 ? onClose : () => goTo(index + 1)}
            aria-label={index === SLIDE_COUNT - 1 ? t('common.close') : t('tutorial.next')}
            className="flex h-8 w-8 items-center justify-center rounded-full text-kamo-ink transition-colors hover:bg-kamo-ink/5"
          >
            <ChevronRightIcon />
          </button>
        </div>
      </div>
    </div>
  );
}
