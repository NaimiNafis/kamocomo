import { useTranslation } from 'react-i18next';
import type { MapStyle } from '../lib/map3d';

const STYLES: MapStyle[] = ['satellite', 'hybrid', 'roadmap'];

interface MapStyleSwitchProps {
  value: MapStyle;
  onChange: (style: MapStyle) => void;
}

/** §5.3 bottom-right map-style switch. SATELLITE is photorealistic 3D with no
 * labels at all, HYBRID adds roads and place names over the same imagery, and
 * ROADMAP is the flat cartoonish basemap where the river reads as clear blue. */
export function MapStyleSwitch({ value, onChange }: MapStyleSwitchProps) {
  const { t } = useTranslation();

  return (
    <div className="flex overflow-hidden rounded-full border border-kamo-ink/15 bg-kamo-stone/90 font-ui text-xs font-medium shadow-sm backdrop-blur">
      {STYLES.map((style) => (
        <button
          key={style}
          type="button"
          onClick={() => onChange(style)}
          className={`px-3 py-1.5 transition-colors ${
            value === style ? 'bg-kamo-indigo text-kamo-stone' : 'text-kamo-ink'
          }`}
        >
          {t(`mapStyle.${style}`)}
        </button>
      ))}
    </div>
  );
}
