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
 * the first thing a circle cuts off. Holding a stamp shows it back uncropped,
 * with when you found it.
 *
 * Retaking lives here too rather than only behind the tap: having just looked
 * at a photo properly is when you'd decide it isn't good enough.
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

interface ConfirmRetakeProps {
  name: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Asked before the camera opens on a stamp that already has a photo.
 *
 * Tapping a filled stamp used to go straight to the camera, and the new photo
 * replaced the old one silently — so a mistaken tap could cost you the picture
 * you walked to the river for, with nothing to undo it. There's only ever one
 * photo per stamp, so the honest thing is to say so before opening the camera
 * rather than after.
 */
export function ConfirmRetake({ name, onConfirm, onCancel }: ConfirmRetakeProps) {
  const { t } = useTranslation();

  return (
    <div
      className="absolute inset-0 z-40 flex items-center justify-center bg-kamo-ink/60 p-6"
      onClick={onCancel}
    >
      <div
        className="kamo-pop w-full max-w-[17rem] rounded-2xl bg-kamo-stone p-5 text-center shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-balance font-display text-base leading-tight text-kamo-ink">
          {t('collection.replaceTitle')}
        </h2>
        <p className="mt-2 text-balance font-ui text-xs leading-relaxed text-kamo-ink/65">
          {t('collection.replaceBody', { name })}
        </p>
        <div className="mt-4 space-y-2">
          <button
            type="button"
            onClick={onConfirm}
            className="w-full rounded-full bg-kamo-indigo py-2.5 font-ui text-sm font-medium text-kamo-stone transition-transform duration-150 active:scale-[0.97]"
          >
            {t('collection.takePhoto')}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="w-full rounded-full py-2 font-ui text-sm text-kamo-ink/70"
          >
            {t('common.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}
