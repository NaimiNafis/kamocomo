import { useTranslation } from 'react-i18next';
import type { StampCardSlot } from '../../lib/duck';
import { duckIconDataUri } from '../../lib/ducks';

interface StampCardProps {
  slots: StampCardSlot[];
  hasCertificate: boolean;
  onViewCertificate: () => void;
}

/** §5.7 stamp card: 10 slots, earned ones filled with the duck mark. Unlocks
 * the certificate at 10. */
export function StampCard({ slots, hasCertificate, onViewCertificate }: StampCardProps) {
  const { t, i18n } = useTranslation();
  const isJa = i18n.language.startsWith('ja');
  const earned = slots.filter((s) => s.earned).length;
  const complete = slots.length > 0 && earned === slots.length;

  return (
    <div className="rounded-2xl bg-kamo-sand/40 p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-base text-kamo-ink">{t('duck.stampCardTitle')}</h2>
        <span className="font-ui text-xs text-kamo-ink/60">
          {t('duck.stampProgress', { earned })}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-5 gap-2">
        {slots.map((slot) => (
          <div key={slot.id} className="flex flex-col items-center gap-1">
            <div
              className={`flex aspect-square w-full items-center justify-center rounded-full border ${
                slot.earned ? 'bg-kamo-stone' : 'border-dashed border-kamo-ink/20 bg-transparent'
              }`}
              style={slot.earned ? { borderColor: slot.color } : undefined}
            >
              {slot.earned && (
                <img src={duckIconDataUri(slot.color)} alt="" className="h-3/4 w-3/4" draggable={false} />
              )}
            </div>
            <span className="line-clamp-1 text-center font-ui text-[9px] leading-tight text-kamo-ink/50">
              {isJa ? slot.nameJa : slot.nameEn}
            </span>
          </div>
        ))}
      </div>

      {complete || hasCertificate ? (
        <button
          type="button"
          onClick={onViewCertificate}
          className="mt-4 w-full rounded-full bg-kamo-sunset py-2 font-ui text-sm font-medium text-kamo-stone"
        >
          {t('duck.certificateUnlocked')} · {t('duck.viewCertificate')}
        </button>
      ) : (
        <p className="mt-4 font-ui text-xs text-kamo-ink/50">{t('duck.certificateLocked')}</p>
      )}
    </div>
  );
}
