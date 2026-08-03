import { useEffect, useRef, useState, type TouchEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeftIcon, ChevronRightIcon } from '../../components/icons';
import welcome from '../../../img/help/welcome-to-kamogawa.png?url';
import kamoTap from '../../../img/help/kamo-tap.png?url';
import mainAndSub from '../../../img/help/main-and-sub-activity.png?url';
import plusTap from '../../../img/help/plus-tap.png?url';
import kamoCollection from '../../../img/help/kamo-collection.png?url';
import kamogawaLog from '../../../img/help/kamogawa-log.png?url';

/** One picture per slide, in slide order. Local imports rather than remote
 * URLs: this screen opens automatically on a first visit, often on riverbank
 * signal, and shouldn't wait on the network to explain itself. */
const SLIDE_IMAGES = [welcome, kamoTap, mainAndSub, plusTap, kamoCollection, kamogawaLog];

const SLIDE_COUNT = SLIDE_IMAGES.length;
const SWIPE_THRESHOLD_PX = 40;

/** Width of one slot in the track. The track slides by exactly this per step,
 * so the active card always lands in the same place. Sized so the active card
 * fills most of a phone's width -- these are screenshots of the app's own
 * screens, and shrinking one to a thumbnail makes it a picture of a picture. */
const SLIDE_WIDTH = 284;
/** The card itself. Every slide is cropped to this one box rather than fitted
 * inside it: the six screenshots run from 0.85 to 1.25 in aspect, and letting
 * each keep its own shape meant a plate of empty card showing around the
 * narrow ones. A single shape for all six, filled edge to edge. */
const CARD_W = 250;
const CARD_H = 280;

/**
 * Help — what this app is and how to use it.
 *
 * A carousel rather than a stack: a track that slides one slot per step, with
 * each card rotated and shrunk in proportion to how far it is from the active
 * one, so the row reads as a fan of cards with one of them turned to face you.
 * On a pointer device, hovering fans it out further — the neighbours splay and
 * drop away, which shows there's more here without needing a caption to say so.
 *
 * Built with CSS transitions rather than a physics library. Every card's state
 * is one `transform` and one `opacity` interpolated by the browser, which is
 * what a spring runtime would be added to the bundle to do — and this screen
 * opens on a first visit, outdoors, before anything else has loaded.
 */
export function Tutorial({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const [index, setIndex] = useState(0);
  const [fanned, setFanned] = useState(false);
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

  // Slide 3 is the only one that needs a second line -- it's naming two shapes,
  // and running them together loses the pairing.
  const body2 = t(`tutorial.slides.${index}.body2`, { defaultValue: '' });

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-kamo-ink/60 p-3">
      <div
        className="w-full max-w-md overflow-hidden rounded-2xl bg-kamo-stone shadow-xl"
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

        {/* The viewport is one slot wide and centred; the track inside it is the
            full row, shifted so the active card sits in that slot. */}
        <div
          className="flex justify-center overflow-hidden pt-5"
          onMouseEnter={() => setFanned(true)}
          onMouseLeave={() => setFanned(false)}
        >
          <div
            className="relative flex h-[330px] items-center justify-start overflow-visible"
            style={{ width: SLIDE_WIDTH }}
          >
            <div
              className="flex w-fit items-center transition-transform duration-700 ease-out"
              style={{ transform: `translateX(${-index * SLIDE_WIDTH}px)` }}
            >
              {SLIDE_IMAGES.map((src, i) => {
                const diff = i - index;
                const isActive = diff === 0;
                return (
                  <div
                    key={i}
                    className="flex shrink-0 flex-col items-center gap-2 transition-transform duration-700 ease-out"
                    style={{
                      width: SLIDE_WIDTH,
                      zIndex: isActive ? 10 : 0,
                      transform: `rotate(${diff * (fanned ? 14 : 4)}deg) translateY(${
                        fanned ? diff * 20 : 0
                      }px) scale(${isActive ? 1.04 : fanned ? 0.68 : 0.82})`,
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => goTo(i)}
                      aria-label={t(`tutorial.slides.${i}.title`)}
                      aria-current={isActive}
                      className="block overflow-hidden rounded-2xl shadow-lg transition-opacity duration-500"
                      style={{ width: CARD_W, height: CARD_H, opacity: isActive ? 1 : 0.55 }}
                    >
                      {/* The picture is the card -- no plate behind it, and
                          cropped to fill, so all six are the same object. */}
                      <img
                        src={src}
                        alt=""
                        className="h-full w-full object-cover"
                        draggable={false}
                      />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="px-6 pb-1 pt-4 text-center">
          <h3 className="font-display text-lg text-kamo-ink">
            {t(`tutorial.slides.${index}.title`)}
          </h3>
          <p className="mx-auto mt-2 max-w-[19rem] text-balance font-ui text-sm leading-relaxed text-kamo-ink/70">
            {t(`tutorial.slides.${index}.body`)}
          </p>
          {body2 && (
            <p className="mx-auto mt-1 max-w-[19rem] text-balance font-ui text-sm leading-relaxed text-kamo-ink/70">
              {body2}
            </p>
          )}
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
