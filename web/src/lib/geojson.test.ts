import { describe, expect, it } from "vitest";

import { formatGeoJsonSurface, parseGeoJsonSurface } from "./geojson";

describe("geojson", () => {
  it("promotes a polygon to MultiPolygon so PostGIS accepts the write", () => {
    const geometry = parseGeoJsonSurface('{"type":"Polygon","coordinates":[[[-121,39],[-121,39.01],[-120.99,39.01],[-120.99,39],[-121,39]]]}');

    expect(geometry).toEqual({
      type: "MultiPolygon",
      coordinates: [[[[-121, 39], [-121, 39.01], [-120.99, 39.01], [-120.99, 39], [-121, 39]]]],
    });
  });

  it("passes a MultiPolygon through unchanged", () => {
    const source = {
      type: "MultiPolygon",
      coordinates: [[[[-121, 39], [-121, 39.01], [-120.99, 39.01], [-120.99, 39], [-121, 39]]]],
    };
    expect(parseGeoJsonSurface(JSON.stringify(source))).toEqual(source);
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
