import { useTranslation } from 'react-i18next';
import { thumb } from '../../lib/photos';
import { duckSilhouetteDataUri } from '../../lib/ducks';
import type { DuckNode } from '../../lib/duck';

interface DuckSheetProps {
  node: DuckNode;
  photoCount: number;
  busy: boolean;
  onCapture: () => void;
  onClose: () => void;
}

/**
 * What a duck says when you hold it: your stamp for it, or the invitation to
 * go and get one.
 *
 * Deliberately not the photo sheet. A duck isn't anyone's post — there's no
 * author, no date, and nothing to vote on — so holding one answers a different
 * question: have I found this one, and how many people have shared it. When you
 * haven't found it, the sheet is the same dotted ring the board and the
 * collection show, at a size that makes the `+` an obvious thing to press.
 */
export function DuckSheet({ node, photoCount, busy, onCapture, onClose }: DuckSheetProps) {
  const { t, i18n } = useTranslation();
  const isJa = i18n.language.startsWith('ja');
  const name = isJa ? node.nameJa : node.nameEn;
  const found = node.photoUrl !== null;

  return (
    <div
      className="absolute inset-0 z-40 flex items-end justify-center bg-kamo-ink/60 p-4 sm:items-center"
      onClick={onClose}
    >
      <div
        className="kamo-pop relative w-full max-w-xs origin-bottom overflow-hidden rounded-2xl bg-kamo-stone shadow-xl sm:origin-center"
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

        <div className="flex flex-col items-center gap-3 p-5 pt-10">
          <span className="relative block h-40 w-40">
            <span
              className="flex h-full w-full items-center justify-center overflow-hidden rounded-full"
              style={{
                border: found ? `4px solid ${node.color}` : `4px dotted ${node.color}90`,
                backgroundColor: found ? undefined : `${node.color}1A`,
              }}
            >
              {node.photoUrl ? (
                <img
                  src={thumb(node.photoUrl, 360)}
                  alt=""
                  className="h-full w-full object-cover"
                  draggable={false}
                />
              ) : (
                <>
                  <img
                    src={duckSilhouetteDataUri(96)}
                    alt=""
                    className="absolute h-1/2 w-1/2 opacity-25"
                    draggable={false}
                  />
                  <span
                    className="relative font-ui text-4xl font-light leading-none"
                    style={{ color: node.color }}
                  >
                    +
                  </span>
                </>
              )}
            </span>
          </span>

          <div className="text-center">
            <p className="font-ui text-[11px] text-kamo-ink/45">
              No.{String(node.number).padStart(2, '0')}
            </p>
            <h2 className="text-balance font-display text-lg leading-tight text-kamo-ink">{name}</h2>
            <p className="mt-1 font-ui text-xs text-kamo-ink/60">
              {found ? t('collection.collected') : t('collection.filter.missing')} ·{' '}
              {t('collection.photoCount', { count: photoCount })}
            </p>
          </div>

          <button
            type="button"
            onClick={onCapture}
            disabled={busy}
            className="w-full rounded-full bg-kamo-indigo py-2.5 font-ui text-sm font-medium text-kamo-stone transition-transform duration-150 active:scale-[0.97] disabled:opacity-50"
          >
            {busy
              ? t('collection.saving')
              : found
                ? t('collection.retake')
                : t('collection.takePhoto')}
          </button>
        </div>
      </div>
    </div>
  );
}
