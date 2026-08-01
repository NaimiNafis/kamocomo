import { useTranslation } from 'react-i18next';
import type { MapStyle } from '../lib/map3d';

interface MapStyleSwitchProps {
  style: MapStyle;
  showLabels: boolean;
  onStyleChange: (style: MapStyle) => void;
  onLabelsChange: (showLabels: boolean) => void;
}

/**
 * §5.3 map controls, stacked bottom-right: which surface (3D photoreal vs the
 * flat 2D map) and whether labels are drawn over it.
 *
 * Two pills rather than one four-way list because they're orthogonal questions,
 * and four segments don't fit a 390px viewport.
 */
export function MapStyleSwitch({
  style,
  showLabels,
  onStyleChange,
  onLabelsChange,
}: MapStyleSwitchProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col items-end gap-1.5">
      <Pill>
        {(['3d', '2d'] as MapStyle[]).map((s) => (
          <Segment key={s} active={style === s} onClick={() => onStyleChange(s)}>
            {t(`mapStyle.${s === '3d' ? 'threeD' : 'twoD'}`)}
          </Segment>
        ))}
      </Pill>
      <Pill>
        <Segment active={!showLabels} onClick={() => onLabelsChange(false)}>
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
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`px-3 py-1.5 transition-colors ${
        active ? 'bg-kamo-indigo text-kamo-stone' : 'text-kamo-ink'
      }`}
    >
      {children}
    </button>
  );
}
