import { useTranslation } from 'react-i18next';
import type { CollectionEntry } from '../../lib/duck';

interface StampPhotoProps {
  entry: CollectionEntry;
  name: string;
  dateLabel: string | null;
  onRetake: () => void;
  onClose: () => void;
}

/**
 * The photo in a filled stamp, whole.
 *
 * The sheet crops every picture to a circle, which is right for a stamp and
 * wrong for the photo you actually took — the thing you were framing is often
 * the first thing a circle cuts off. Tapping a stamp shows it back uncropped,
 * with when you found it.
 *
 * Retaking lives here rather than behind a confirm dialog in front of the
 * camera: replacing a picture then always goes through looking at the one you
 * have, which guards the mistake better than a dialog and is one fewer thing to
 * explain.
 */
export function StampPhoto({ entry, name, dateLabel, onRetake, onClose }: StampPhotoProps) {
  const { t } = useTranslation();

  return (
    <div
      className="absolute inset-0 z-40 flex items-end justify-center bg-kamo-ink/70 p-4 sm:items-center"
      onClick={onClose}
    >
      <div
        className="kamo-pop relative w-full max-w-sm origin-bottom overflow-hidden rounded-2xl bg-kamo-stone shadow-xl sm:origin-center"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label={t('common.close')}
          className="absolute left-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-kamo-stone/85 font-ui text-sm text-kamo-ink shadow-sm backdrop-blur transition-transform duration-150 active:scale-[0.92]"
        >
          ✕
        </button>

        {/* contain, not cover: this view exists precisely because the circle
            crops. Backed in the duck's colour so a tall photo doesn't sit in a
            white gap. */}
        <img
          src={entry.photoUrl ?? ''}
          alt=""
          className="block max-h-[60vh] w-full object-contain"
          style={{ backgroundColor: `${entry.color}1A` }}
          draggable={false}
        />

        <div className="space-y-3 p-4 text-center">
          <div>
            <p className="font-ui text-[11px] text-kamo-ink/45">
              No.{String(entry.number).padStart(2, '0')}
            </p>
            <h2 className="text-balance font-display text-lg leading-tight text-kamo-ink">{name}</h2>
            {dateLabel && (
              <p className="mt-0.5 font-ui text-xs text-kamo-ink/60">
                {t('collection.savedOn')} {dateLabel}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={onRetake}
            className="w-full rounded-full border border-kamo-ink/15 bg-white/70 py-2.5 font-ui text-sm font-medium text-kamo-ink transition-transform duration-150 active:scale-[0.97]"
          >
            {t('collection.retake')}
          </button>
        </div>
      </div>
    </div>
  );
}
