import { useTranslation } from 'react-i18next';
import { DuckIcon, LabelsIcon, LibraryIcon } from './icons';
import type { MapStyle } from '../lib/map3d';

interface MapControlsProps {
  onOpenCollection: () => void;
  onOpenLibrary: () => void;
  style: MapStyle;
  showLabels: boolean;
  onStyleChange: (style: MapStyle) => void;
  onLabelsChange: (showLabels: boolean) => void;
}

/**
 * The map's control column, bottom-right.
 *
 * Everything except help and the language toggle lives here, in one stack of
 * equally-sized squares. The chrome used to be scattered — archive as a text
 * pill top-left, the collection as a wide labelled button across the bottom
 * centre, and two segmented pills bottom-right — which meant a first-time
 * visitor met five separate shapes before they'd looked at the river.
 *
 * The two destinations carry no text at all. The two settings show their
 * *current* value and flip on tap, rather than exposing both options at once:
 * half as many targets, and the state is legible at a glance.
 */
export function MapControls({
  onOpenCollection,
  onOpenLibrary,
  style,
  showLabels,
  onStyleChange,
  onLabelsChange,
}: MapControlsProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col items-end gap-2">
      <ControlButton label={t('mainMap.duckCollection')} onClick={onOpenCollection}>
        <DuckIcon size={22} />
      </ControlButton>

      <ControlButton label={t('mainMap.archiveButton')} onClick={onOpenLibrary}>
        <LibraryIcon size={22} />
      </ControlButton>

      {/* Shows the mode you're in; tapping switches to the other one. */}
      <ControlButton
        label={t('mapStyle.switchTo', { mode: style === '3d' ? '2D' : '3D' })}
        onClick={() => onStyleChange(style === '3d' ? '2d' : '3d')}
      >
        <span className="font-ui text-[13px] font-semibold leading-none">
          {style === '3d' ? '3D' : '2D'}
        </span>
      </ControlButton>

      {/* Two signals for one state, on purpose: the icon is struck through when
          labels are hidden, and the button fills when they're shown. Either one
          alone is guessable; together they're hard to misread. */}
      <ControlButton
        label={showLabels ? t('mapStyle.labelsOff') : t('mapStyle.labelsOn')}
        active={showLabels}
        onClick={() => onLabelsChange(!showLabels)}
      >
        <LabelsIcon size={22} off={!showLabels} />
      </ControlButton>
    </div>
  );
}

/** One square in the column. 44px is the minimum comfortable touch target, and
 * keeping every control identical is what makes the stack read as one thing. */
function ControlButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={`flex h-11 w-11 items-center justify-center rounded-xl border shadow-md backdrop-blur transition-transform duration-150 active:scale-[0.94] ${
        active
          ? 'border-kamo-indigo bg-kamo-indigo text-kamo-stone'
          : 'border-kamo-ink/15 bg-kamo-stone/90 text-kamo-ink'
      }`}
    >
      {children}
    </button>
  );
}
