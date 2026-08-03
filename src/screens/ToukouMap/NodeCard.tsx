import { useTranslation } from 'react-i18next';
import type { ToukouNode } from '../../lib/toukou';
import { LONG_PRESS_MS } from './useGraphViewport';
import { MOSS, SUNSET, VoteButton } from './VoteButton';
import { examplePhoto } from '../../lib/photos';

const STONE = '#E9E4D8'; // --kamo-stone

/** Card sizes. Mains lead the board, so they're half again the size of a sub
 * and always a full circle; subs start as squares and round out as they earn
 * approval. Both are square, because a shape that becomes a circle has to be. */
export const MAIN_SIZE = 176;
export const SUB_SIZE = 112;

/** Likes at which a sub is fully round. */
const FULLY_ROUND_AT = 10;

/**
 * How square a sub still is, as a border radius in pixels.
 *
 * This is the board's main signal now: a post nobody has backed is a plain
 * square, and every like rounds it off a little until at ten it's a circle.
 * Shape reads at a glance across a whole graph in a way a number never does,
 * and it degrades gracefully — you don't need to know the scale to see that a
 * rounder card is a better-liked one.
 *
 * Driven by likes alone rather than the net score, so a post that attracts some
 * disagreement doesn't visibly lose ground it earned. Dislikes still have
 * teeth: ten of them hides the post entirely.
 */
function cornerRadius(likes: number, size: number): number {
  const base = 14;
  const full = size / 2;
  const progress = Math.min(Math.max(likes, 0) / FULLY_ROUND_AT, 1);
  return base + (full - base) * progress;
}

/**
 * A ring for how much standing a post has, on top of the shape. Nothing at
 * zero, so the rings that exist read as signal rather than decoration. Mains
 * feed it their child count, since they have no vote buttons.
 */
function ratingRingWidth(magnitude: number): number {
  if (magnitude >= 10) return 6;
  if (magnitude >= 5) return 4;
  if (magnitude >= 2) return 2;
  return 0;
}

interface NodeCardProps {
  node: ToukouNode;
  /** A finger is down on this card and the hold hasn't fired yet. */
  pressed?: boolean;
  /** True while this card's detail sheet is opening or open. */
  dimmed?: boolean;
  onLike: () => void;
  onDislike: () => void;
  onViewArchived: () => void;
}

/**
 * A single post in the toukou web (§5.5).
 *
 * Both kinds are square photo tiles with their words over a scrim, rather than
 * a photo above a text body — a card that has to become a circle can't carry a
 * rectangular block underneath it.
 *
 * A **main** is always a circle and half again the size of a sub: it's the
 * thing a board is about, and roundness reading as "settled" suits a post that
 * has already gathered people. It carries no vote buttons; its ring tracks how
 * many children it drew. A **sub** starts square and rounds off as it collects
 * likes, reaching a circle at ten.
 *
 * The card only has to carry what survives at this size: the photo, one line or
 * two of what was said, and the votes. Everything else -- the uncropped photo,
 * the whole phrase, who posted it and when -- is a press-and-hold away in
 * {@link NodeDetail}, which is what lets the words here stay short enough to
 * sit legibly on top of a picture.
 */
export function NodeCard({ node, pressed, dimmed, onLike, onDislike, onViewArchived }: NodeCardProps) {
  const { t } = useTranslation();
  const isMain = node.kind === 'main';
  const size = isMain ? MAIN_SIZE : SUB_SIZE;
  // Mains are born round; subs earn it.
  const radius = isMain ? size / 2 : cornerRadius(node.likes, size);

  const score = isMain ? node.subCount : node.likes - node.dislikes;
  const ringWidth = ratingRingWidth(Math.abs(score));
  const ringColor = score < 0 ? SUNSET : node.color;

  return (
    <div
      className="relative overflow-hidden shadow-lg"
      style={{
        width: size,
        height: size,
        // The press itself is the animation. The card sinks away under your
        // finger for exactly as long as the hold takes, then springs back past
        // its own size as the sheet opens -- so the wait has a visible shape
        // and the release has a pop, rather than nothing happening and then
        // everything happening.
        transform: pressed ? 'scale(0.93)' : 'scale(1)',
        transition: pressed
          ? `transform ${LONG_PRESS_MS}ms cubic-bezier(0.25, 0.8, 0.4, 1), border-radius 500ms ease-out`
          : 'transform 420ms cubic-bezier(0.34, 1.7, 0.5, 1), border-radius 500ms ease-out',
        opacity: dimmed ? 0.85 : undefined,
        borderRadius: radius,
        backgroundColor: node.color,
        boxShadow: ringWidth
          ? `0 0 0 ${ringWidth}px ${ringColor}${score < 0 ? 'AA' : '66'}`
          : undefined,
      }}
    >
      <img
        src={node.photoUrl ?? examplePhoto(node.id)}
        alt=""
        className="h-full w-full object-cover"
        draggable={false}
      />

      {/* Everything sits over the photo on a scrim, so the tile can take any
          shape without the layout caring. */}
      <div
        className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-1 px-3 pb-3 pt-6 text-center"
        style={{
          // A photo can be bright anywhere, so the band under the text is close
          // to opaque and only fades out well above it. Cheaper than a blur and
          // it survives a white sky behind the words.
          background:
            'linear-gradient(to top, rgba(28,28,26,0.92) 0%, rgba(28,28,26,0.78) 45%, rgba(28,28,26,0) 100%)',
          color: STONE,
          textShadow: '0 1px 2px rgba(28,28,26,0.9)',
        }}
      >
        {node.phrase && (
          <p
            className="line-clamp-2 font-ui font-medium leading-snug"
            style={{ fontSize: isMain ? 13 : 11, maxWidth: isMain ? '82%' : '90%' }}
          >
            {node.phrase}
          </p>
        )}

        {!isMain && (
          <div className="flex w-full items-center gap-1" style={{ maxWidth: '84%' }}>
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
            className="font-ui underline"
            style={{ fontSize: 10 }}
          >
            {t('toukou.viewArchived')}
          </button>
        )}
      </div>
    </div>
  );
}
