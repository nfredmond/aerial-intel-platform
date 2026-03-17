"use client";

import { useMemo, useState } from "react";

import { parseGeoJsonSurface } from "@/lib/geojson";
import { getGeoJsonPreviewModel } from "@/lib/geojson-preview";

type GeometryJsonFieldProps = {
  name: string;
  label: string;
  defaultValue?: string;
  mode: "mission" | "dataset";
  placeholder?: string;
};

const missionPolygonSample = JSON.stringify(
  {
    type: "Polygon",
    coordinates: [[
      [-121.056, 39.223],
      [-121.056, 39.232],
      [-121.041, 39.232],
      [-121.041, 39.223],
      [-121.056, 39.223],
    ]],
  },
  null,
  2,
);

const missionCorridorSample = JSON.stringify(
  {
    type: "Polygon",
    coordinates: [[
      [-121.062, 39.219],
      [-121.060, 39.235],
      [-121.051, 39.236],
      [-121.049, 39.220],
      [-121.062, 39.219],
    ]],
  },
  null,
  2,
);

const datasetFootprintSample = JSON.stringify(
  {
    type: "Polygon",
    coordinates: [[
      [-121.055, 39.224],
      [-121.055, 39.2305],
      [-121.044, 39.2305],
      [-121.044, 39.224],
      [-121.055, 39.224],
    ]],
  },
  null,
  2,
);

export function GeometryJsonField({
  name,
  label,
  defaultValue = "",
  mode,
  placeholder,
}: GeometryJsonFieldProps) {
  const [value, setValue] = useState(defaultValue);

  const parsedGeometry = useMemo(() => {
    if (!value.trim()) {
      return { geometry: null as ReturnType<typeof parseGeoJsonSurface> | null, error: null as string | null };
    }

    try {
      return { geometry: parseGeoJsonSurface(value), error: null as string | null };
    } catch (error) {
      return {
        geometry: null,
        error: error instanceof Error ? error.message : "Invalid GeoJSON.",
      };
    }
  }, [value]);

  const preview = useMemo(
    () => getGeoJsonPreviewModel([
      {
        label: mode === "mission" ? "Draft AOI" : "Draft footprint",
        geometry: parsedGeometry.geometry,
        stroke: mode === "mission" ? "#2563eb" : "#16a34a",
        fill: mode === "mission" ? "rgba(37, 99, 235, 0.16)" : "rgba(22, 163, 74, 0.18)",
      },
    ]),
    [mode, parsedGeometry.geometry],
  );

  return (
    <div className="stack-sm">
      <label className="stack-xs">
        <span>{label}</span>
        <textarea
          name={name}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={placeholder}
          required
        />
      </label>

      <div className="sample-button-row">
        {mode === "mission" ? (
          <>
            <button type="button" className="button button-secondary" onClick={() => setValue(missionPolygonSample)}>
              Use polygon sample
            </button>
            <button type="button" className="button button-secondary" onClick={() => setValue(missionCorridorSample)}>
              Use corridor sample
            </button>
          </>
        ) : (
          <button type="button" className="button button-secondary" onClick={() => setValue(datasetFootprintSample)}>
            Use footprint sample
          </button>
        )}
        <button type="button" className="button button-secondary" onClick={() => setValue("")}>Clear</button>
      </div>

      <div className="surface-form-shell stack-sm">
        <div className="ops-list-card-header">
          <strong>Draft preview</strong>
          {parsedGeometry.error ? (
            <span className="status-pill status-pill--warning">Invalid geometry</span>
          ) : parsedGeometry.geometry ? (
            <span className="status-pill status-pill--success">Geometry parsed</span>
          ) : (
            <span className="status-pill status-pill--info">No geometry yet</span>
          )}
        </div>

        {parsedGeometry.error ? <p className="muted">{parsedGeometry.error}</p> : null}

        {preview.hasGeometry ? (
          <svg viewBox={preview.viewBox} className="geometry-preview geometry-preview--compact" role="img" aria-label="Draft geometry preview">
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
        ) : (
          <p className="muted">Paste or load sample GeoJSON to preview the geometry before saving it.</p>
        )}
      </div>
    </div>
  );
}
