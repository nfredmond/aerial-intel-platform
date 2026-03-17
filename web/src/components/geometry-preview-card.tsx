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

const VIEW_WIDTH = 320;
const VIEW_HEIGHT = 220;
const VIEW_CENTER_X = VIEW_WIDTH / 2;
const VIEW_CENTER_Y = VIEW_HEIGHT / 2;

export function GeometryPreviewCard({
  title,
  subtitle,
  missionGeometry,
  datasetGeometry,
}: GeometryPreviewCardProps) {
  const [showMissionGeometry, setShowMissionGeometry] = useState(true);
  const [showDatasetGeometry, setShowDatasetGeometry] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);

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

  function resetView() {
    setZoom(1);
    setOffsetX(0);
    setOffsetY(0);
  }

  function focusMission() {
    setShowMissionGeometry(true);
    setShowDatasetGeometry(false);
    resetView();
    setZoom(1.15);
  }

  function focusDataset() {
    setShowMissionGeometry(false);
    setShowDatasetGeometry(true);
    resetView();
    setZoom(1.15);
  }

  function focusAll() {
    setShowMissionGeometry(hasMissionGeometry);
    setShowDatasetGeometry(hasDatasetGeometry);
    resetView();
  }

  const transform = `translate(${offsetX} ${offsetY}) translate(${VIEW_CENTER_X} ${VIEW_CENTER_Y}) scale(${zoom}) translate(${-VIEW_CENTER_X} ${-VIEW_CENTER_Y})`;

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

      <div className="preview-toolbar">
        <div className="sample-button-row">
          <button type="button" className="button button-secondary" onClick={focusAll}>
            Fit all
          </button>
          <button type="button" className="button button-secondary" onClick={focusMission} disabled={!hasMissionGeometry}>
            Focus AOI
          </button>
          <button type="button" className="button button-secondary" onClick={focusDataset} disabled={!hasDatasetGeometry}>
            Focus footprint
          </button>
          <button type="button" className="button button-secondary" onClick={resetView}>
            Reset view
          </button>
        </div>

        <div className="preview-pan-row">
          <label className="stack-xs preview-zoom-field">
            <span>Zoom</span>
            <input
              type="range"
              min="1"
              max="2"
              step="0.05"
              value={zoom}
              onChange={(event) => setZoom(Number(event.target.value))}
            />
          </label>
          <div className="sample-button-row">
            <button type="button" className="button button-secondary" onClick={() => setOffsetY((value) => value + 10)}>Pan up</button>
            <button type="button" className="button button-secondary" onClick={() => setOffsetX((value) => value + 10)}>Pan left</button>
            <button type="button" className="button button-secondary" onClick={() => setOffsetX((value) => value - 10)}>Pan right</button>
            <button type="button" className="button button-secondary" onClick={() => setOffsetY((value) => value - 10)}>Pan down</button>
          </div>
        </div>
      </div>

      {preview.hasGeometry ? (
        <>
          <svg viewBox={preview.viewBox} className="geometry-preview" role="img" aria-label={title}>
            <rect x="0" y="0" width="100%" height="100%" rx="16" fill="#f8fafc" />
            <g transform={transform}>
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
            </g>
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
