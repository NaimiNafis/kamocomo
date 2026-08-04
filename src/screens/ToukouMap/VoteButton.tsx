/** The like/dislike control, shared by the board's cards and the detail sheet
 * so a vote looks and behaves the same wherever it's cast. */
const STONE = '#E9E4D8';

/** Accent colours for the two sides of a vote. */
export const MOSS = '#7C8C5A'; // --kamo-moss, the approving side
export const SUNSET = '#E0885E'; // --kamo-sunset, the disapproving side

/** A single thumb; the dislike button flips it upside down. */
function ThumbIcon({ down, filled }: { down?: boolean; filled: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="12"
      height="12"
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
 * One vote control: pill, lifts on hover, squashes on press, thumb fills and
 * takes the accent colour once cast.
 *
 * Icon and count only, no word -- on a card there are two of them sharing a
 * 112px tile, and in the detail sheet the icon flipping and filling is
 * already what "voted" looks like, in both languages, without a translation
 * to keep in sync. `label` still exists, just for the accessible name.
 *
 * Two sizes because it lives in two places: a small pill on the card, a
 * bigger one in the sheet, where it's the more important of the two --
 * reading a post in full is exactly the moment someone has an opinion about
 * it.
 */
export function VoteButton({
  count,
  down,
  active,
  accent,
  label,
  size = 'card',
  onClick,
}: {
  count: number;
  down?: boolean;
  active: boolean;
  accent: string;
  label: string;
  size?: 'card' | 'sheet';
  onClick: () => void;
}) {
  const sheet = size === 'sheet';
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      aria-label={label}
      aria-pressed={active}
      className={`group flex flex-1 items-center justify-center gap-1.5 rounded-full border font-ui transition-[transform,background-color,border-color] duration-150 hover:scale-[1.04] active:scale-[0.95] ${
        sheet ? 'h-10' : 'h-6'
      }`}
      style={{
        fontSize: sheet ? 13 : 10,
        // On a card the pill sits on a photo and needs its own dark backing;
        // in the sheet it sits on paper, so it borrows the page instead.
        color: active ? accent : sheet ? '#1C1C1A' : STONE,
        backgroundColor: active ? `${accent}${sheet ? '26' : '3D'}` : sheet ? 'transparent' : 'rgba(28,28,26,0.45)',
        borderColor: active ? accent : sheet ? 'rgba(28,28,26,0.18)' : 'rgba(233,228,216,0.25)',
      }}
    >
      <span className="flex items-center" style={{ color: active ? accent : undefined }}>
        <span className="group-hover:hidden">
          <ThumbIcon down={down} filled={active} />
        </span>
        <span className="hidden group-hover:inline" style={{ color: accent }}>
          <ThumbIcon down={down} filled />
        </span>
      </span>
      {count}
    </button>
  );
}
