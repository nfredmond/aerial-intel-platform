"use client";

import { useState } from "react";

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
    </div>
  );
}
