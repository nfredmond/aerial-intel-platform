import { describe, expect, it } from "vitest";

import { getGeoJsonPreviewModel } from "./geojson-preview";

describe("geojson-preview", () => {
  it("builds preview paths for polygon geometry", () => {
    const preview = getGeoJsonPreviewModel([
      {
        label: "AOI",
        geometry: {
          type: "Polygon",
          coordinates: [[[-121, 39], [-121, 39.01], [-120.99, 39.01], [-120.99, 39], [-121, 39]]],
        },
        stroke: "#2563eb",
        fill: "rgba(37,99,235,0.15)",
      },
    ]);

    expect(preview.hasGeometry).toBe(true);
    expect(preview.shapes[0]?.path).toContain("M");
  });

  it("returns empty preview when no supported geometry is present", () => {
    const preview = getGeoJsonPreviewModel([
      {
        label: "AOI",
        geometry: null,
        stroke: "#2563eb",
        fill: "rgba(37,99,235,0.15)",
      },
    ]);

    expect(preview.hasGeometry).toBe(false);
    expect(preview.shapes).toHaveLength(0);
  });
});
