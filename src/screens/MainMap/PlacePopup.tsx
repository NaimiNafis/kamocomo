import { useTranslation } from 'react-i18next';
import type { ActivityPreview } from '../../lib/activities';
import placeholderPhoto from '../../../img/kamogawa/placeholder-riverbank.jpg?url';

interface PlacePopupProps {
  preview: ActivityPreview;
  onClose: () => void;
  onViewActivity: () => void;
}

/**
 * The marker-tap cinematic's payoff (§B3): appears once the camera's fly-in
 * + orbit around the place finishes, showing what's there and a way into
 * that specific place's toukou web. Photo-less posts fall back to the same
 * riverbank placeholder used across the app.
 */
export function PlacePopup({ preview, onClose, onViewActivity }: PlacePopupProps) {
  const { t, i18n } = useTranslation();
  const isJa = i18n.language.startsWith('ja');
  const typeName = isJa ? preview.typeNameJa : preview.typeNameEn;

  return (
    <div
      data-testid="place-popup"
      className="absolute inset-0 z-30 flex items-end justify-center bg-kamo-ink/40 p-3 sm:items-center"
    >
      <div className="w-full max-w-sm overflow-hidden rounded-2xl bg-kamo-stone shadow-xl">
        <img
          src={preview.photoUrl ?? placeholderPhoto}
          alt=""
          className="h-40 w-full object-cover"
          draggable={false}
        />
        <div className="p-4">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: preview.color }} />
            <span className="font-ui text-xs font-medium uppercase tracking-wide text-kamo-ink/60">
              {typeName}
            </span>
          </div>
          {preview.phrase && (
            <p className="mt-2 font-display text-lg text-kamo-ink">{preview.phrase}</p>
          )}
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
              onClick={onViewActivity}
              className="flex-1 rounded-full bg-kamo-indigo py-2.5 font-ui text-sm font-medium text-kamo-stone"
            >
              {t('mainMap.viewActivity')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
