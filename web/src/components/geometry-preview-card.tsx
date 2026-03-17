"use client";

import { useMemo, useState } from "react";

import { getGeoJsonPreviewModel } from "@/lib/geojson-preview";
import type { Json } from "@/lib/supabase/types";

type GeometryPreviewCardProps = {
  title: string;
  subtitle: string;
  missionGeometry?: Json | null;
  datasetGeometry?: Json | null;
};

export function GeometryPreviewCard({
  title,
  subtitle,
  missionGeometry,
  datasetGeometry,
}: GeometryPreviewCardProps) {
  const [showMissionGeometry, setShowMissionGeometry] = useState(true);
  const [showDatasetGeometry, setShowDatasetGeometry] = useState(true);

  const preview = useMemo(
    () => getGeoJsonPreviewModel([
      {
        label: "Mission AOI",
        geometry: showMissionGeometry ? missionGeometry : null,
        stroke: "#2563eb",
        fill: "rgba(37, 99, 235, 0.16)",
      },
      {
        label: "Dataset footprint",
        geometry: showDatasetGeometry ? datasetGeometry : null,
        stroke: "#16a34a",
        fill: "rgba(22, 163, 74, 0.18)",
      },
    ]),
    [datasetGeometry, missionGeometry, showDatasetGeometry, showMissionGeometry],
  );

  const hasMissionGeometry = Boolean(missionGeometry);
  const hasDatasetGeometry = Boolean(datasetGeometry);

  return (
    <article className="surface stack-sm info-card">
      <div className="stack-xs">
        <p className="eyebrow">Geometry preview</p>
        <h2>{title}</h2>
        <p className="muted">{subtitle}</p>
      </div>

      <div className="preview-controls">
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={showMissionGeometry}
            onChange={(event) => setShowMissionGeometry(event.target.checked)}
            disabled={!hasMissionGeometry}
          />
          <span>Show mission AOI</span>
        </label>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={showDatasetGeometry}
            onChange={(event) => setShowDatasetGeometry(event.target.checked)}
            disabled={!hasDatasetGeometry}
          />
          <span>Show dataset footprint</span>
        </label>
      </div>

      {preview.hasGeometry ? (
        <>
          <svg viewBox={preview.viewBox} className="geometry-preview" role="img" aria-label={title}>
            <rect x="0" y="0" width="100%" height="100%" rx="16" fill="#f8fafc" />
            {preview.shapes.map((shape) => (
              <path
                key={`${shape.label}-${shape.stroke}`}
                d={shape.path}
                fill={shape.fill}
                stroke={shape.stroke}
                strokeWidth="2.5"
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </svg>

          <div className="preview-legend">
            {preview.shapes.map((shape) => (
              <div key={shape.label} className="preview-legend-item">
                <span className="preview-legend-swatch" style={{ background: shape.stroke }} />
                <span>{shape.label}</span>
              </div>
            ))}
          </div>
        </>
      ) : (
        <p className="muted">No supported geometry is currently visible in the preview. Toggle a layer on or attach GeoJSON first.</p>
      )}
    </article>
  );
}
