import { describe, expect, it } from "vitest";

import { describeArea, formatArea, geometryArea } from "./area";

const acrePolygon = {
  type: "Polygon" as const,
  // ~0.5 acres near Grass Valley
  coordinates: [
    [
      [-121.0611, 39.2191],
      [-121.0605, 39.2191],
      [-121.0605, 39.2195],
      [-121.0611, 39.2195],
      [-121.0611, 39.2191],
    ],
  ],
};

const largePolygon = {
  type: "Polygon" as const,
  coordinates: [
    [
      [-122.0, 38.0],
      [-120.0, 38.0],
      [-120.0, 40.0],
      [-122.0, 40.0],
      [-122.0, 38.0],
    ],
  ],
};

describe("geo/area", () => {
  it("returns null for null input", () => {
    expect(geometryArea(null)).toBeNull();
  });

  it("reports small areas in m²", () => {
    const area = geometryArea(acrePolygon);
    expect(area).not.toBeNull();
    expect(formatArea(area)).toMatch(/m²/);
  });

  it("reports large areas in km²", () => {
    expect(describeArea(largePolygon)).toMatch(/km²/);
  });

  it("falls back when input is invalid", () => {
    expect(formatArea(null)).toBe("Unknown area");
  });
});
