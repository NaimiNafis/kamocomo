import { useTranslation } from 'react-i18next';
import type { MapStyle } from '../lib/cesium';

const STYLES: MapStyle[] = ['photoreal', 'flat'];

interface MapStyleSwitchProps {
  value: MapStyle;
  onChange: (style: MapStyle) => void;
}

/** §5.3 bottom-right map-style switch (photoreal <-> flat imagery for now). */
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
