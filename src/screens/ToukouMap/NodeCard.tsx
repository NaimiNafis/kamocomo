import { useTranslation } from 'react-i18next';
import type { ToukouNode } from '../../lib/toukou';
import placeholderPhoto from '../../../img/kamogawa/placeholder-riverbank.jpg?url';

const MOSS = '#7C8C5A'; // --kamo-moss, the approving side
const SUNSET = '#E0885E'; // --kamo-sunset, the disapproving side
const STONE = '#E9E4D8'; // --kamo-stone

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

/**
 * A post's standing, drawn as a ring that thickens in steps. Nothing at zero,
 * so the rings that do exist read as signal rather than as decoration.
 *
 * The two kinds of card feed it different numbers on purpose: a sub is rated by
 * people voting on it, a main has no vote buttons and is rated by how many
 * children it drew.
 */
function ratingRingWidth(magnitude: number): number {
  if (magnitude >= 10) return 6;
  if (magnitude >= 5) return 4;
  if (magnitude >= 2) return 2;
  return 0;
}

/** A single thumb; the dislike button flips it upside down. Filled or outlined
 * depending on whether this is the vote you've cast. */
function ThumbIcon({ down, filled }: { down?: boolean; filled: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="13"
      height="13"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={filled ? 0 : 1.8}
      strokeLinejoin="round"
      aria-hidden
      className={`shrink-0 transition-colors duration-300 ${down ? 'rotate-180' : ''}`}
    >
      <path d="M7 22H4a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h3v11ZM9 22a1 1 0 0 1-1-1V10.72a1 1 0 0 1 .3-.71l6-6a1 1 0 0 1 1.06-.22c.38.14.64.5.64.9V8h4.5A2.5 2.5 0 0 1 23 10.5a2.47 2.47 0 0 1-.24 1.06l-3 6.42A2.5 2.5 0 0 1 17.5 22H9Z" />
    </svg>
  );
}

/**
 * One vote control. Icon and count only — two of these have to sit inside a
 * 96px sub card, so there is no room for a word alongside them.
 *
 * The motion is the reference button's, done with Tailwind rather than a
 * physics library: it lifts on hover, squashes on press, and the thumb fills
 * and takes the accent colour on hover or once cast. Adding ~50KB of animation
 * runtime for two transforms would be a poor trade on a screen built for flaky
 * outdoor signal.
 */
function VoteButton({
  count,
  down,
  active,
  accent,
  label,
  onClick,
}: {
  count: number;
  down?: boolean;
  active: boolean;
  accent: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      aria-label={label}
      aria-pressed={active}
      className="group flex h-7 flex-1 items-center justify-center gap-1 rounded-full border font-ui transition-[transform,background-color,border-color] duration-150 hover:scale-[1.03] active:scale-[0.96]"
      style={{
        fontSize: 11,
        color: active ? accent : STONE,
        backgroundColor: active ? `${accent}2E` : 'rgba(255,255,255,0.14)',
        borderColor: active ? accent : 'rgba(255,255,255,0.18)',
      }}
    >
      <span
        className="flex items-center transition-colors duration-300"
        style={{ color: active ? accent : undefined }}
      >
        <span className="group-hover:hidden">
          <ThumbIcon down={down} filled={active} />
        </span>
        {/* Hover swaps in the filled, accented thumb — the colour-morph beat
            from the reference, without needing JS hover state. */}
        <span className="hidden group-hover:inline" style={{ color: accent }}>
          <ThumbIcon down={down} filled />
        </span>
      </span>
      {count}
    </button>
  );
}

interface NodeCardProps {
  node: ToukouNode;
  onLike: () => void;
  onDislike: () => void;
  onViewArchived: () => void;
}

/**
 * A single post in the toukou web (§5.5).
 *
 * Mains are larger, carry no vote buttons, and show how many people have joined
 * in; when they have overflowed subs they also link to the archive. Subs vote.
 * Both wear a ring once they have standing — and on a sub that ring turns
 * `--kamo-sunset` once the score goes negative, so a post drifting toward the
 * 10-dislike auto-hide warns before it goes rather than vanishing without
 * notice. Photo-less posts fall back to the shared placeholder (§C6).
 */
export function NodeCard({ node, onLike, onDislike, onViewArchived }: NodeCardProps) {
  const { t } = useTranslation();
  const isMain = node.kind === 'main';
  const textColor = readableText(node.color);
  const width = isMain ? 128 : 96;

  const score = isMain ? node.subCount : node.likes - node.dislikes;
  const ringWidth = ratingRingWidth(Math.abs(score));
  // Thickness carries magnitude, colour carries direction.
  const ringColor = score < 0 ? SUNSET : node.color;

  return (
    <div
      className="relative overflow-hidden rounded-2xl shadow-lg"
      style={{
        width,
        backgroundColor: node.color,
        color: textColor,
        boxShadow: ringWidth ? `0 0 0 ${ringWidth}px ${ringColor}${score < 0 ? 'AA' : '66'}` : undefined,
      }}
    >
      <img
        src={node.photoUrl ?? placeholderPhoto}
        alt=""
        className="block w-full object-cover"
        style={{ height: isMain ? 84 : 60 }}
        draggable={false}
      />

      <div className="px-2 py-1.5 pb-2">
        {node.phrase && (
          <p className="line-clamp-2 font-ui leading-snug" style={{ fontSize: isMain ? 11 : 10 }}>
            {node.phrase}
          </p>
        )}

        {/* A main carries no vote buttons and no join count -- its standing is
            the ring, which is already sized by how many children it drew. */}
        {!isMain && (
          <div className="mt-1.5 flex items-center gap-1">
            <VoteButton
              count={node.likes}
              active={node.myVote === 1}
              accent={MOSS}
              label={t('toukou.like')}
              onClick={onLike}
            />
            <VoteButton
              count={node.dislikes}
              down
              active={node.myVote === -1}
              accent={SUNSET}
              label={t('toukou.dislike')}
              onClick={onDislike}
            />
          </div>
        )}

        {isMain && node.hasArchivedSubs && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onViewArchived();
            }}
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
