import { useTranslation } from 'react-i18next';
import type { PlacePreview } from '../../lib/places';
import placeholderPhoto from '../../../img/kamogawa/placeholder-riverbank.jpg?url';

interface PlacePopupProps {
  preview: PlacePreview;
  onClose: () => void;
  onViewActivities: () => void;
}

/**
 * The marker-tap cinematic's payoff (§B3/item 7): once the camera's fly-in +
 * orbit finishes, this shows the PLACE -- its name, a few photos of what's
 * happening there, and how many activities are live -- with a button into the
 * place's board of all its main activities. Photo-less places fall back to the
 * shared riverbank placeholder.
 */
export function PlacePopup({ preview, onClose, onViewActivities }: PlacePopupProps) {
  const { t, i18n } = useTranslation();
  const isJa = i18n.language.startsWith('ja');
  const name = isJa ? preview.nameJa : preview.nameEn;
  const photos = preview.photoUrls.length > 0 ? preview.photoUrls : [placeholderPhoto];

  return (
    <div
      data-testid="place-popup"
      className="absolute inset-0 z-30 flex items-end justify-center bg-kamo-ink/40 p-3 sm:items-center"
    >
      <div className="w-full max-w-sm overflow-hidden rounded-2xl bg-kamo-stone shadow-xl">
        {photos.length === 1 ? (
          <img src={photos[0]} alt="" className="h-40 w-full object-cover" draggable={false} />
        ) : (
          <div className="flex h-40 w-full gap-0.5">
            {photos.slice(0, 3).map((url, i) => (
              <img
                key={i}
                src={url}
                alt=""
                className="h-full flex-1 object-cover"
                draggable={false}
              />
            ))}
          </div>
        )}
        <div className="p-4">
          <h2 className="font-display text-lg text-kamo-ink">{name}</h2>
          <p className="mt-1 font-ui text-xs text-kamo-ink/60">
            {t('mainMap.placeActivityCount', { count: preview.activityCount })}
          </p>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-full border border-kamo-ink/20 py-2.5 font-ui text-sm text-kamo-ink"
            >
              {t('common.close')}
            </button>
            <button
              type="button"
              onClick={onViewActivities}
              className="flex-1 rounded-full bg-kamo-indigo py-2.5 font-ui text-sm font-medium text-kamo-stone"
            >
              {t('mainMap.moreActivities')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
