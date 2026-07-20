import { useTranslation } from 'react-i18next';
import duckMark from '../../../img/marks/duck.svg?url';

interface CertificateProps {
  issuedAt?: string | null;
  onClose: () => void;
}

/**
 * §5.7 certificate: a screenshot-worthy, deliberately bilingual completion
 * award (both languages always shown, not toggled), tied to this device via
 * the user's `certificates` row. Shown once all 10 stamps are collected.
 */
export function Certificate({ issuedAt, onClose }: CertificateProps) {
  const { t, i18n } = useTranslation();
  const date = issuedAt
    ? new Date(issuedAt).toLocaleDateString(i18n.language.startsWith('ja') ? 'ja-JP' : 'en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : null;

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-kamo-indigo p-5">
      <button
        type="button"
        onClick={onClose}
        aria-label={t('certificate.close')}
        className="absolute right-4 top-4 font-ui text-sm text-kamo-stone/80"
      >
        {t('certificate.close')}
      </button>

      <div className="w-full max-w-sm rounded-2xl bg-kamo-stone px-6 py-8 text-center shadow-2xl ring-1 ring-kamo-sunset/40">
        <div className="mx-auto mb-4 h-20 w-20">
          <img src={duckMark} alt="" className="h-full w-full" draggable={false} />
        </div>

        <p className="font-display text-2xl text-kamo-ink">{t('certificate.headingJa')}</p>
        <p className="mt-1 font-ui text-xs uppercase tracking-[0.2em] text-kamo-ink/60">
          {t('certificate.heading')}
        </p>

        <div className="mx-auto my-5 h-px w-16 bg-kamo-sunset/50" />

        <p className="font-ui text-sm leading-relaxed text-kamo-ink/80">{t('certificate.bodyJa')}</p>
        <p className="mt-2 font-ui text-xs leading-relaxed text-kamo-ink/60">
          {t('certificate.body')}
        </p>

        {date && (
          <p className="mt-6 font-ui text-xs text-kamo-ink/50">{t('certificate.issued', { date })}</p>
        )}
      </div>
    </div>
  );
}
