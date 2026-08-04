import { useTranslation } from 'react-i18next';
/**
 * What the sheet needs from a post, whatever board it came from.
 *
 * Declared structurally rather than importing one screen's type: `ActivityDetail`
 * (toukou) and `DuckPostDetail` (the duck board) both satisfy it, so one sheet
 * serves both instead of a near-copy drifting alongside.
 */
export interface PostDetail {
  id: string;
  kind: 'main' | 'sub';
  color: string;
  photoUrl: string | null;
  labelEn: string;
  labelJa: string;
  phrase: string | null;
  likes: number;
  dislikes: number;
  createdAt: string;
  author: {
    name: string | null;
    nationality: string | null;
    ageRange: string | null;
    gender: string | null;
  } | null;
}

/** The live copy of the post as its board holds it -- counts and your own vote
 * come from here so a vote shows before any refetch. */
export interface VoteState {
  likes: number;
  dislikes: number;
  myVote: 1 | -1 | null;
}
import { examplePhoto, thumb } from '../../lib/photos';
import { MOSS, SUNSET, VoteButton } from './VoteButton';

interface NodeDetailProps {
  detail: PostDetail;
  /** The same post as the board holds it, so a vote cast in the sheet shows
   * straight away instead of waiting for a refetch. Absent if it left the
   * board, or on a kind that doesn't take votes. */
  node?: VoteState;
  onLike: () => void;
  onDislike: () => void;
  onClose: () => void;
}

/**
 * A post in full, opened by holding its node.
 *
 * The board's cards are small, round and photo-filled, which is good for
 * reading a whole graph at a glance and bad for reading any one post. So the
 * cards keep only what works at that size and everything else lives here: the
 * uncropped photo, the full phrase, when it was posted, and the little the app
 * knows about who posted it.
 *
 * The author is named where they gave a name, with the onboarding bands under
 * it as context. There's still no account behind any of it -- a name here is
 * what someone would like to be called, not a login -- so a post with no name
 * falls back to the bands alone.
 */
export function NodeDetail({ detail, node, onLike, onDislike, onClose }: NodeDetailProps) {
  const { t, i18n } = useTranslation();
  const isJa = i18n.language.startsWith('ja');
  const locale = isJa ? 'ja-JP' : 'en-GB';

  const posted = new Date(detail.createdAt).toLocaleString(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  // Each band is its own i18n key, and a skipped question just drops out.
  // "Prefer not to say" is dropped too: it was an answer to us, not something
  // to publish back at everyone else.
  const author = detail.author;
  const traits = [
    author?.nationality && t(`onboarding.nationalityOptions.${author.nationality}`),
    author?.ageRange && t(`onboarding.ageRangeOptions.${author.ageRange}`),
    author?.gender && author.gender !== 'unspecified'
      ? t(`onboarding.genderOptions.${author.gender}`)
      : null,
  ].filter(Boolean) as string[];

  return (
    <div
      className="absolute inset-0 z-40 flex items-end justify-center bg-kamo-ink/60 p-4 sm:items-center"
      onClick={onClose}
    >
      <div
        className="kamo-pop relative max-h-[88vh] w-full max-w-sm origin-bottom overflow-y-auto rounded-2xl bg-kamo-stone shadow-xl sm:origin-center"
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

        {/* Uncropped, unlike the board's square tiles -- seeing the whole photo
            is half the reason to open this. */}
        <img
          src={detail.photoUrl ? thumb(detail.photoUrl, 900) : examplePhoto(detail.id)}
          alt=""
          className="block max-h-[45vh] w-full object-contain"
          style={{ backgroundColor: detail.color }}
          draggable={false}
        />

        <div className="space-y-3 p-4">
          <div className="flex items-center justify-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: detail.color }} />
            <span className="font-ui text-xs font-medium uppercase tracking-wide text-kamo-ink/60">
              {isJa ? detail.labelJa : detail.labelEn}
            </span>
          </div>

          {detail.phrase && (
            <p className="text-balance text-center font-display text-lg leading-snug text-kamo-ink">
              {detail.phrase}
            </p>
          )}

          <dl className="space-y-1.5 border-t border-kamo-ink/10 pt-3 font-ui text-xs">
            <Row label={t('detail.postedAt')} value={posted} />
            <Row
              label={t('detail.postedBy')}
              value={author?.name || (traits.length > 0 ? traits.join(' · ') : t('detail.anonymous'))}
            />
            {/* The bands move to their own row once there's a name above them,
                where they read as context rather than as the person. */}
            {author?.name && traits.length > 0 && (
              <Row label={t('detail.about')} value={traits.join(' · ')} />
            )}
          </dl>

          {/* The vote lives here as buttons rather than as a line of numbers.
              Having just read a post in full is the moment someone actually has
              an opinion about it, and sending them back to a 112px card to act
              on it was the wrong way round. */}
          {detail.kind === 'sub' && node && (
            <div className="flex items-center gap-2 pt-1">
              <VoteButton
                size="sheet"
                count={node.likes}
                active={node.myVote === 1}
                accent={MOSS}
                label={t('toukou.like')}
                onClick={onLike}
              />
              <VoteButton
                size="sheet"
                down
                count={node.dislikes}
                active={node.myVote === -1}
                accent={SUNSET}
                label={t('toukou.dislike')}
                onClick={onDislike}
              />
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-kamo-ink/50">{label}</dt>
      <dd className="text-right text-kamo-ink">{value}</dd>
    </div>
  );
}
