import type { MapLayerTone } from "./map-view";

export type MapLegendEntry = {
  label: string;
  tone: MapLayerTone;
  note?: string;
};

export type MapLegendProps = {
  entries: MapLegendEntry[];
};

const TONE_BADGE: Record<MapLayerTone, string> = {
  neutral: "map-legend__swatch map-legend__swatch--neutral",
  info: "map-legend__swatch map-legend__swatch--info",
  success: "map-legend__swatch map-legend__swatch--success",
  warning: "map-legend__swatch map-legend__swatch--warning",
  danger: "map-legend__swatch map-legend__swatch--danger",
};

export function MapLegend({ entries }: MapLegendProps) {
  if (entries.length === 0) return null;

  return (
    <ul className="map-legend" aria-label="Map layer legend">
      {entries.map((entry) => (
        <li key={`${entry.label}-${entry.tone}`} className="map-legend__entry">
          <span className={TONE_BADGE[entry.tone]} aria-hidden="true" />
          <span className="map-legend__label">{entry.label}</span>
          {entry.note ? <span className="map-legend__note muted">{entry.note}</span> : null}
        </li>
      ))}
    </ul>
  );
}
