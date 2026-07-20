import { useTranslation } from 'react-i18next';

/** Shown when a screen is displaying cached data because the device is offline
 * or the last refresh failed (Phase 9 offline resilience). */
export function StaleBanner({ show }: { show: boolean }) {
  const { t } = useTranslation();
  if (!show) return null;
  return (
    <div className="bg-kamo-sunset/90 px-4 py-1.5 text-center font-ui text-xs text-kamo-stone">
      {t('common.offlineStale')}
    </div>
  );
}
