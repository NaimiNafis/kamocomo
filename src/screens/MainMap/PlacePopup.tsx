import { useTranslation } from 'react-i18next';
import type { PlacePreview } from '../../lib/places';
import { examplePhoto } from '../../lib/photos';

interface PlacePopupProps {
  preview: PlacePreview;
  onClose: () => void;
  onViewActivities: () => void;
}

/**
 * The marker-tap cinematic's payoff (§B3/item 7): once the camera's fly-in and
 * sweep finish, this shows the PLACE -- its name, a photo of what's happening
 * there, and how many activities are live -- with one button into the place's
 * board. Photo-less places fall back to the shared riverbank placeholder.
 *
 * Narrow and 4:3 rather than a wide card with a letterbox photo strip: it sits
 * over a 3D view the visitor was just flown into, so it should cover as little
 * of it as it can and still read.
 */
export function PlacePopup({ preview, onClose, onViewActivities }: PlacePopupProps) {
  const { t, i18n } = useTranslation();
  const isJa = i18n.language.startsWith('ja');
  const name = isJa ? preview.nameJa : preview.nameEn;
  // One photo, not a row of three. At this width three would be slivers, and a
  // single good shot is the better teaser -- the count below already says how
  // much is going on here.
  const photo = preview.photoUrls[0] ?? examplePhoto(preview.id);

  return (
    <div
      data-testid="place-popup"
      className="absolute inset-0 z-30 flex items-end justify-center bg-kamo-ink/40 p-4 sm:items-center"
    >
      <div className="relative w-full max-w-[17rem] overflow-hidden rounded-2xl bg-kamo-stone shadow-xl">
        {/* Close is a cross over the image rather than a button in the footer:
            it frees the footer for the one action that matters, and dismissing
            is the secondary choice so it shouldn't share equal billing. */}
        <button
          type="button"
          onClick={onClose}
          aria-label={t('common.close')}
          className="absolute left-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-kamo-stone/85 font-ui text-sm text-kamo-ink shadow-sm backdrop-blur transition-transform duration-150 active:scale-[0.92]"
        >
          ✕
        </button>

        <img
          src={photo}
          alt=""
          className="block w-full object-cover"
          style={{ aspectRatio: '4 / 3' }}
          draggable={false}
        />

        <div className="p-4 text-center">
          <h2 className="text-balance font-display text-lg leading-tight text-kamo-ink">{name}</h2>
          <p className="mt-1 font-ui text-xs text-kamo-ink/60">
            {t('mainMap.placeActivityCount', { count: preview.activityCount })}
          </p>
          <button
            type="button"
            onClick={onViewActivities}
            className="mt-4 w-full rounded-full bg-kamo-indigo py-2.5 font-ui text-sm font-medium text-kamo-stone transition-transform duration-150 active:scale-[0.97]"
          >
            {t('mainMap.moreActivities')}
          </button>
        </div>
      </div>
    </div>
  );
}
