import { useTranslation } from 'react-i18next';
import { labelFreeGraphicalAvailable, type MapStyle } from '../lib/map3d';

const STYLES: MapStyle[] = ['realistic', 'graphical'];

interface MapStyleSwitchProps {
  style: MapStyle;
  showLabels: boolean;
  onStyleChange: (style: MapStyle) => void;
  onLabelsChange: (showLabels: boolean) => void;
}

/**
 * §5.3 map-style controls: two independent choices stacked in the bottom-right
 * — imagery (realistic photo vs the flat graphical basemap) and whether labels
 * are drawn over it.
 *
 * They're separate rather than one 4-way list because they're orthogonal
 * questions, and a 4-item pill doesn't fit a 390px viewport. The labels toggle
 * disables itself for graphical when no label-free Map ID is configured, since
 * Google has no native label-free ROADMAP mode — better a visibly unavailable
 * control than one that silently does nothing.
 */
export function MapStyleSwitch({
  style,
  showLabels,
  onStyleChange,
  onLabelsChange,
}: MapStyleSwitchProps) {
  const { t } = useTranslation();
  const labelsOffBlocked = style === 'graphical' && !labelFreeGraphicalAvailable();

  return (
    <div className="flex flex-col items-end gap-1.5">
      <Pill>
        {STYLES.map((s) => (
          <Segment key={s} active={style === s} onClick={() => onStyleChange(s)}>
            {t(`mapStyle.${s}`)}
          </Segment>
        ))}
      </Pill>
      <Pill>
        <Segment
          active={!showLabels}
          disabled={labelsOffBlocked}
          title={labelsOffBlocked ? t('mapStyle.labelsOffUnavailable') : undefined}
          onClick={() => onLabelsChange(false)}
        >
          {t('mapStyle.labelsOff')}
        </Segment>
        <Segment active={showLabels} onClick={() => onLabelsChange(true)}>
          {t('mapStyle.labelsOn')}
        </Segment>
      </Pill>
    </div>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex overflow-hidden rounded-full border border-kamo-ink/15 bg-kamo-stone/90 font-ui text-xs font-medium shadow-sm backdrop-blur">
      {children}
    </div>
  );
}

function Segment({
  active,
  disabled,
  title,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  title?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-pressed={active}
      className={`px-3 py-1.5 transition-colors disabled:opacity-35 ${
        active ? 'bg-kamo-indigo text-kamo-stone' : 'text-kamo-ink'
      }`}
    >
      {children}
    </button>
  );
}
