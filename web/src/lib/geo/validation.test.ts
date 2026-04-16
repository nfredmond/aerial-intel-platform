import type { Feature, GeoJsonObject } from "geojson";
import { describe, expect, it } from "vitest";

import {
  ensureClosedRing,
  isClockwise,
  isClosedRing,
  isValidPosition,
  validateGeoJson,
} from "./validation";

describe("geo/validation", () => {
  it("validates WGS84 positions", () => {
    expect(isValidPosition([0, 0])).toBe(true);
    expect(isValidPosition([-120.5, 39.1])).toBe(true);
    expect(isValidPosition([200, 0])).toBe(false);
    expect(isValidPosition([0, 99])).toBe(false);
    expect(isValidPosition([Number.NaN, 0])).toBe(false);
  });

  it("detects closed rings", () => {
    expect(
      isClosedRing([
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 0],
      ]),
    ).toBe(true);
    expect(
      isClosedRing([
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ]),
    ).toBe(false);
  });

  it("closes an open ring", () => {
    const ring = ensureClosedRing([
      [0, 0],
      [1, 0],
      [1, 1],
    ]);
    expect(ring[ring.length - 1]).toEqual(ring[0]);
  });

  it("identifies clockwise vs counterclockwise rings", () => {
    const ccw = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
      [0, 0],
    ];
    const cw = [
      [0, 0],
      [0, 1],
      [1, 1],
      [1, 0],
      [0, 0],
    ];
    expect(isClockwise(ccw)).toBe(false);
    expect(isClockwise(cw)).toBe(true);
  });

  it("accepts a valid polygon feature", () => {
    const feature: Feature = {
      type: "Feature",
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [-120, 39],
            [-119, 39],
            [-119, 40],
            [-120, 40],
            [-120, 39],
          ],
        ],
      },
      properties: {},
    };
    const result = validateGeoJson(feature);
    expect(result.ok).toBe(true);
  });

  it("rejects polygon with out-of-range coordinates", () => {
    const geojson: GeoJsonObject = {
      type: "Polygon",
      coordinates: [
        [
          [-200, 39],
          [-119, 39],
          [-119, 40],
          [-120, 40],
          [-200, 39],
        ],
      ],
    } as GeoJsonObject;
    const result = validateGeoJson(geojson);
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => /WGS84/.test(issue.message))).toBe(true);
  });

  it("rejects polygon with an unclosed ring", () => {
    const geojson: GeoJsonObject = {
      type: "Polygon",
      coordinates: [
        [
          [-120, 39],
          [-119, 39],
          [-119, 40],
          [-120, 40],
        ],
      ],
    } as GeoJsonObject;
    const result = validateGeoJson(geojson);
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => /closed/.test(issue.message))).toBe(true);
  });
});
