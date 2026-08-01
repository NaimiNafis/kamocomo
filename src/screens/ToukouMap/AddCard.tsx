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
 * The "add" node on a graph -- a blank card the size of a sub card carrying
 * nothing but a "+", reading as one empty slot to fill. The caption came out
 * because at card size it was two lines of small type explaining a symbol that
 * already says it; `label` survives as the accessible name.
 *
 * Shared by the toukou board's add-sub node and the duck graph's add-photo
 * node. It's a <button>, so the graph's container-level pointer handler leaves
 * it alone and its own click fires.
 */
export function AddCard({ color, label, disabled, onClick, testId }: AddCardProps) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex w-24 items-center justify-center rounded-2xl border-2 border-dashed bg-kamo-stone shadow-lg transition-transform duration-150 hover:scale-[1.03] active:scale-[0.96] disabled:opacity-50"
      style={{ height: 112, borderColor: `${color}66` }}
    >
      <span className="text-4xl font-light leading-none" style={{ color }}>
        +
      </span>
    </button>
  );
}
