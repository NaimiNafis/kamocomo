import { useTranslation } from 'react-i18next';
import { useRegisterSW } from 'virtual:pwa-register/react';

/**
 * How often an open tab asks whether a new build has shipped.
 *
 * A service worker only checks for a new version when the page loads, so a tab
 * left open on the riverbank all afternoon would never notice a deploy. Hourly
 * is far more often than this app ships and still costs one conditional request
 * against a file that is almost always 304.
 */
const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

/**
 * "A new version is ready" — the missing half of `registerType: 'prompt'`.
 *
 * The worker was already configured to install a new build in the background
 * and wait rather than take over (see the note in `vite.config.ts`: taking over
 * unannounced reloads the page mid-gesture). Nothing ever told it to stop
 * waiting, though, so the update only landed once every tab of the site had
 * been closed — which meant a returning visitor could sit on a months-old build
 * indefinitely, serving old HTML, old chunks and an old favicon out of the
 * precache. This is the tap that releases it.
 *
 * Why a prompt and not just activating the moment it's ready: routes here are
 * code-split, and activating purges the old chunks from the precache while the
 * running page is still holding HTML that points at them. Navigating to a
 * screen you hadn't opened yet would then fetch a chunk that no longer exists.
 * Reloading is what keeps the page and its chunks the same age.
 */
export function UpdateBanner() {
  const { t } = useTranslation();
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;
      setInterval(() => void registration.update(), UPDATE_CHECK_INTERVAL_MS);
    },
  });

  if (!needRefresh) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center p-4">
      <div
        role="status"
        className="pointer-events-auto flex items-center gap-3 rounded-full border border-kamo-ink/15 bg-kamo-stone/95 py-2 pl-4 pr-2 shadow-lg backdrop-blur"
        style={{ animation: 'fadeIn 220ms ease-out' }}
      >
        <span className="font-ui text-sm text-kamo-ink">{t('common.updateReady')}</span>
        <button
          type="button"
          onClick={() => void updateServiceWorker(true)}
          className="rounded-full bg-kamo-indigo px-3.5 py-1.5 font-ui text-sm font-medium text-kamo-stone transition-transform duration-150 active:scale-[0.94]"
        >
          {t('common.updateAction')}
        </button>
      </div>
    </div>
  );
}
