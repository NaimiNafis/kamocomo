import { useTranslation } from 'react-i18next';
import type { ToukouNode } from '../../lib/toukou';

/** Dark or light text depending on the background's luminance, so phrases stay
 * legible on both saturated mains and pale subs. */
function readableText(hex: string): string {
  const v = hex.replace('#', '');
  const r = parseInt(v.slice(0, 2), 16);
  const g = parseInt(v.slice(2, 4), 16);
  const b = parseInt(v.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? '#1C1C1A' : '#E9E4D8';
}

interface NodeCardProps {
  node: ToukouNode;
  reported: boolean;
  onLike: () => void;
  onDislike: () => void;
  onAddSub: () => void;
  onReport: () => void;
  onViewArchived: () => void;
}

/**
 * A single post in the toukou web (§5.5). Mains are larger and carry the `+`
 * (add-sub) affordance and, when they have overflowed subs, an "earlier posts"
 * link to the archive; subs are smaller and omit both. Photo, phrase, and a
 * like/dislike row are shared. Every card has a report button.
 */
export function NodeCard({
  node,
  reported,
  onLike,
  onDislike,
  onAddSub,
  onReport,
  onViewArchived,
}: NodeCardProps) {
  const { t } = useTranslation();
  const isMain = node.kind === 'main';
  const textColor = readableText(node.color);
  const width = isMain ? 128 : 96;

  const stop = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    fn();
  };

  return (
    <div
      className="overflow-hidden rounded-2xl shadow-lg"
      style={{ width, backgroundColor: node.color, color: textColor }}
    >
      {node.photoUrl ? (
        <img
          src={node.photoUrl}
          alt=""
          className="block w-full object-cover"
          style={{ height: isMain ? 84 : 60 }}
          draggable={false}
        />
      ) : (
        <div
          className="w-full"
          style={{ height: isMain ? 40 : 28, backgroundColor: 'rgba(255,255,255,0.12)' }}
        />
      )}

      <div className="px-2 py-1.5">
        {node.phrase && (
          <p
            className="line-clamp-2 font-ui leading-snug"
            style={{ fontSize: isMain ? 11 : 10 }}
          >
            {node.phrase}
          </p>
        )}

        <div className="mt-1 flex items-center gap-1 font-ui" style={{ fontSize: 11 }}>
          <button
            type="button"
            onClick={stop(onLike)}
            aria-label={t('toukou.like')}
            aria-pressed={node.myVote === 1}
            className="flex items-center gap-0.5 rounded-full px-1.5 py-0.5"
            style={{
              backgroundColor: node.myVote === 1 ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.18)',
              color: node.myVote === 1 ? '#1C1C1A' : textColor,
            }}
          >
            <span aria-hidden>♥</span>
            {node.likes}
          </button>
          <button
            type="button"
            onClick={stop(onDislike)}
            aria-label={t('toukou.dislike')}
            aria-pressed={node.myVote === -1}
            className="flex items-center gap-0.5 rounded-full px-1.5 py-0.5"
            style={{
              backgroundColor:
                node.myVote === -1 ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.18)',
              color: node.myVote === -1 ? '#1C1C1A' : textColor,
            }}
          >
            <span aria-hidden>✕</span>
            {node.dislikes}
          </button>
        </div>

        <div className="mt-1 flex items-center gap-1">
          {isMain && (
            <button
              type="button"
              onClick={stop(onAddSub)}
              aria-label={t('toukou.addSub')}
              className="flex h-5 w-5 items-center justify-center rounded-full font-ui text-sm"
              style={{ backgroundColor: 'rgba(255,255,255,0.85)', color: '#1C1C1A' }}
            >
              +
            </button>
          )}
          <button
            type="button"
            onClick={stop(onReport)}
            aria-label={t('toukou.report')}
            className="font-ui"
            style={{ fontSize: 10, opacity: reported ? 1 : 0.7 }}
          >
            {reported ? t('toukou.reported') : '⚑'}
          </button>
        </div>

        {isMain && node.hasArchivedSubs && (
          <button
            type="button"
            onClick={stop(onViewArchived)}
            className="mt-1 block w-full text-left font-ui underline"
            style={{ fontSize: 9 }}
          >
            {t('toukou.viewArchived')}
          </button>
        )}
      </div>
    </div>
  );
}
