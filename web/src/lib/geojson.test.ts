import { describe, expect, it } from "vitest";

import { formatGeoJsonSurface, parseGeoJsonSurface } from "./geojson";

describe("geojson", () => {
  it("parses polygon geojson", () => {
    const geometry = parseGeoJsonSurface('{"type":"Polygon","coordinates":[[[-121,39],[-121,39.01],[-120.99,39.01],[-120.99,39],[-121,39]]]}');

    expect((geometry as { type: string }).type).toBe("Polygon");
  });

  it("rejects unsupported geometry types", () => {
    expect(() => parseGeoJsonSurface('{"type":"Point","coordinates":[-121,39]}')).toThrow(
      /Polygon or MultiPolygon/,
    );
  });

  it("formats geometry to readable json", () => {
    const formatted = formatGeoJsonSurface({
      type: "Polygon",
      coordinates: [[[-121, 39], [-121, 39.01], [-120.99, 39.01], [-120.99, 39], [-121, 39]]],
    });

    expect(formatted).toContain('"type": "Polygon"');
  });
});
