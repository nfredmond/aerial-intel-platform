import { describeArea } from "@/lib/geo/area";
import { validateGeoJson } from "@/lib/geo/validation";
import type { GeoJsonObject } from "geojson";

import { MapLegend, type MapLegendEntry } from "./map-legend";
import { MapView, type MapLayer } from "./map-view";

type GeometryPreviewMapProps = {
  title?: string;
  layers: MapLayer[];
  legendEntries?: MapLegendEntry[];
  note?: string | null;
  height?: string;
  primaryGeometry?: GeoJsonObject | null | undefined;
};

export function GeometryPreviewMap({
  title,
  layers,
  legendEntries,
  note,
  height = "320px",
  primaryGeometry,
}: GeometryPreviewMapProps) {
  const activeLayers = layers.filter((layer) => Boolean(layer.geojson));
  const hasAnyGeometry = activeLayers.length > 0;
  const validation = primaryGeometry ? validateGeoJson(primaryGeometry) : null;
  const areaNote = primaryGeometry ? describeArea(primaryGeometry) : null;

  const resolvedEntries: MapLegendEntry[] =
    legendEntries ??
    activeLayers.map((layer) => ({ label: layer.label ?? layer.id, tone: layer.tone }));

  return (
    <section className="section-card geometry-preview-map stack-xs">
      {title ? <h3>{title}</h3> : null}
      <MapView
        layers={layers}
        height={height}
        ariaLabel={title ?? "Geometry preview"}
        emptyLabel="No geometry recorded yet."
      />
      {hasAnyGeometry ? <MapLegend entries={resolvedEntries} /> : null}
      {areaNote ? <p className="muted helper-copy">Area: {areaNote}</p> : null}
      {note ? <p className="muted helper-copy">{note}</p> : null}
      {validation && !validation.ok ? (
        <p className="callout callout-warning" role="status">
          Geometry validation issues: {validation.issues.slice(0, 3).map((i) => i.message).join(" ")}
        </p>
      ) : null}
    </section>
  );
}
