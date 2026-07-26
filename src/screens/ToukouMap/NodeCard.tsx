import { useTranslation } from 'react-i18next';
import type { ToukouNode } from '../../lib/toukou';
import placeholderPhoto from '../../../img/kamogawa/placeholder-riverbank.jpg?url';

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

/** A single thumb glyph; the dislike button flips it upside down. */
function ThumbIcon({ down }: { down?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="11"
      height="11"
      fill="currentColor"
      aria-hidden
      className={down ? 'rotate-180' : undefined}
    >
      <path d="M7 22H4a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h3v11ZM9 22a1 1 0 0 1-1-1V10.72a1 1 0 0 1 .3-.71l6-6a1 1 0 0 1 1.06-.22c.38.14.64.5.64.9V8h4.5A2.5 2.5 0 0 1 23 10.5a2.47 2.47 0 0 1-.24 1.06l-3 6.42A2.5 2.5 0 0 1 17.5 22H9Z" />
    </svg>
  );
}

interface NodeCardProps {
  node: ToukouNode;
  reported: boolean;
  onLike: () => void;
  onDislike: () => void;
  onReport: () => void;
  onViewArchived: () => void;
}

/**
 * A single post in the toukou web (§5.5). Mains are larger and, when they have
 * overflowed subs, carry an "earlier posts" link to the archive; subs are
 * smaller. Adding a sub is a separate "+" node beside the main, not a button
 * on the card (item 5). Photo-less posts fall back to the shared riverbank
 * placeholder (§C6). The report button sits in the card's bottom-right corner
 * (§C5) and opens a reason picker elsewhere.
 */
export function NodeCard({
  node,
  reported,
  onLike,
  onDislike,
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
      className="relative overflow-hidden rounded-2xl shadow-lg"
      style={{ width, backgroundColor: node.color, color: textColor }}
    >
      <img
        src={node.photoUrl ?? placeholderPhoto}
        alt=""
        className="block w-full object-cover"
        style={{ height: isMain ? 84 : 60 }}
        draggable={false}
      />

      <div className="px-2 py-1.5 pb-5">
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
            <ThumbIcon />
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
            <ThumbIcon down />
            {node.dislikes}
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

      <button
        type="button"
        onClick={stop(onReport)}
        aria-label={reported ? t('toukou.reported') : t('toukou.report')}
        className="absolute bottom-1 right-1 flex h-5 w-5 items-center justify-center rounded-full font-ui"
        style={{
          fontSize: 10,
          backgroundColor: 'rgba(0,0,0,0.15)',
          opacity: reported ? 1 : 0.7,
        }}
      >
        {reported ? '✓' : '⚑'}
      </button>
    </div>
  );
}
