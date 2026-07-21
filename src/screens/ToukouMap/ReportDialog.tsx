import { useTranslation } from 'react-i18next';

export type ReportReason = 'inappropriate' | 'spam' | 'off_topic' | 'other';

const REASONS: ReportReason[] = ['inappropriate', 'spam', 'off_topic', 'other'];

interface ReportDialogProps {
  onSubmit: (reason: ReportReason) => void;
  onCancel: () => void;
}

/**
 * A reason picker for reporting a post (§C5) -- previously reporting had no
 * way to say *why*, which left moderators (and reporters) with no context.
 */
export function ReportDialog({ onSubmit, onCancel }: ReportDialogProps) {
  const { t } = useTranslation();

  return (
    <div className="absolute inset-0 z-40 flex items-end justify-center bg-kamo-ink/50 p-3 sm:items-center">
      <div className="w-full max-w-sm rounded-2xl bg-kamo-stone p-5 text-kamo-ink shadow-xl">
        <h2 className="font-display text-lg">{t('toukou.reportTitle')}</h2>
        <p className="mt-1 font-ui text-xs text-kamo-ink/60">{t('toukou.reportSubtitle')}</p>
        <div className="mt-4 flex flex-col gap-2">
          {REASONS.map((reason) => (
            <button
              key={reason}
              type="button"
              onClick={() => onSubmit(reason)}
              className="rounded-xl border border-kamo-ink/15 px-4 py-2.5 text-left font-ui text-sm text-kamo-ink"
            >
              {t(`toukou.reportReasons.${reason}`)}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="mt-4 w-full rounded-full border border-kamo-ink/20 py-2.5 font-ui text-sm text-kamo-ink"
        >
          {t('composer.cancel')}
        </button>
      </div>
    </div>
  );
}
