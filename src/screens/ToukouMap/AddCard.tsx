interface AddCardProps {
  /** The associated node's color, used for the "+". */
  color: string;
  /** The visible caption + accessible label (e.g. "Add to this activity"). */
  label: string;
  disabled?: boolean;
  onClick: () => void;
  testId: string;
}

/**
 * The "add" node on a graph -- a blank card the size of a sub card with a "+"
 * and a caption (matching the way sub cards carry a phrase), reading as one
 * empty slot to fill. Shared by the toukou board's add-sub node and the duck
 * graph's add-photo node. It's a <button>, so the graph's container-level
 * pointer handler leaves it alone and its own click fires.
 */
export function AddCard({ color, label, disabled, onClick, testId }: AddCardProps) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex w-24 flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed bg-kamo-stone px-2 shadow-lg disabled:opacity-50"
      style={{ height: 112, borderColor: `${color}66` }}
    >
      <span className="text-3xl font-light leading-none" style={{ color }}>
        +
      </span>
      <span className="line-clamp-2 text-center font-ui text-[10px] leading-snug text-kamo-ink/60">
        {label}
      </span>
    </button>
  );
}
