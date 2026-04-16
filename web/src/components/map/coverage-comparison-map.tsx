import type { GeoJsonObject } from "geojson";

import { describeArea, geometryArea } from "@/lib/geo/area";

import { MapLegend } from "./map-legend";
import { MapView, type MapLayer } from "./map-view";

type CoverageComparisonMapProps = {
  plannedGeometry: GeoJsonObject | null | undefined;
  capturedGeometry: GeoJsonObject | null | undefined;
  imagePoints?: GeoJsonObject | null | undefined;
  height?: string;
};

function formatOverlapPct(planned: GeoJsonObject | null | undefined, captured: GeoJsonObject | null | undefined): string {
  const plannedArea = geometryArea(planned);
  const capturedArea = geometryArea(captured);
  if (!plannedArea || !capturedArea) return "Unknown overlap";
  const ratio = Math.min(capturedArea, plannedArea) / Math.max(capturedArea, plannedArea);
  return `${Math.round(ratio * 100)}% extent overlap`;
}

export function CoverageComparisonMap({
  plannedGeometry,
  capturedGeometry,
  imagePoints,
  height = "360px",
}: CoverageComparisonMapProps) {
  const layers: MapLayer[] = [
    {
      id: "planned",
      label: "Planned AOI",
      tone: "info",
      geojson: plannedGeometry,
      outlineOnly: true,
      dashed: true,
    },
    {
      id: "captured",
      label: "Captured footprint",
      tone: "success",
      geojson: capturedGeometry,
      opacity: 0.3,
    },
    {
      id: "images",
      label: "Image thumbprints",
      tone: "warning",
      geojson: imagePoints,
    },
  ];

  return (
    <section className="coverage-comparison-map stack-xs">
      <MapView layers={layers} height={height} ariaLabel="Coverage comparison map" />
      <MapLegend
        entries={[
          { label: "Planned AOI (dashed)", tone: "info" },
          { label: "Captured footprint", tone: "success" },
          { label: "Image points", tone: "warning" },
        ]}
      />
      <p className="muted helper-copy">
        Planned area: {describeArea(plannedGeometry)} · Captured area: {describeArea(capturedGeometry)} ·{" "}
        {formatOverlapPct(plannedGeometry, capturedGeometry)}
      </p>
    </section>
  );
}
