interface AddCardProps {
  /** The associated node's color, used for the centered "+". */
  color: string;
  /** Accessible label (e.g. "Add to this activity" / "Share a duck photo"). */
  label: string;
  disabled?: boolean;
  onClick: () => void;
  testId: string;
}

/**
 * The "add" node on a graph -- a blank card the size of a sub card with a big
 * centered "+", reading as one empty slot to fill (instead of a small circle
 * button). Shared by the toukou board's add-sub node and the duck graph's
 * add-photo node. It's a <button>, so the graph's container-level pointer
 * handler leaves it alone and its own click fires.
 */
export function AddCard({ color, label, disabled, onClick, testId }: AddCardProps) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex w-24 items-center justify-center rounded-2xl border-2 border-dashed bg-kamo-stone shadow-lg disabled:opacity-50"
      style={{ height: 112, borderColor: `${color}66` }}
    >
      <span className="text-4xl font-light leading-none" style={{ color }}>
        +
      </span>
    </button>
  );
}
