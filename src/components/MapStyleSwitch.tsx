import { useTranslation } from 'react-i18next';

interface MapStyleSwitchProps {
  showLabels: boolean;
  onLabelsChange: (showLabels: boolean) => void;
}

/**
 * §5.3 map-view control: whether Google draws its labels over the
 * photorealistic imagery.
 *
 * This was two stacked pills — imagery style crossed with labels — while a flat
 * cartoonish "Map" style existed. That style was `MapMode.ROADMAP`, which is
 * pre-GA and only exists on the alpha channel, so it went when production moved
 * to the stable channel. One axis left, one pill.
 */
export function MapStyleSwitch({ showLabels, onLabelsChange }: MapStyleSwitchProps) {
  const { t } = useTranslation();

  return (
    <div className="flex overflow-hidden rounded-full border border-kamo-ink/15 bg-kamo-stone/90 font-ui text-xs font-medium shadow-sm backdrop-blur">
      {[false, true].map((on) => (
        <button
          key={String(on)}
          type="button"
          onClick={() => onLabelsChange(on)}
          aria-pressed={showLabels === on}
          className={`px-3 py-1.5 transition-colors ${
            showLabels === on ? 'bg-kamo-indigo text-kamo-stone' : 'text-kamo-ink'
          }`}
        >
          {t(on ? 'mapStyle.labelsOn' : 'mapStyle.labelsOff')}
        </button>
      ))}
    </div>
  );
}
