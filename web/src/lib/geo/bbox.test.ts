import { describe, expect, it } from "vitest";

import { centerOfBbox, combineBboxes, computeBbox, expandBbox } from "./bbox";

const polygonA = {
  type: "Polygon" as const,
  coordinates: [
    [
      [-120.5, 39.0],
      [-120.0, 39.0],
      [-120.0, 39.5],
      [-120.5, 39.5],
      [-120.5, 39.0],
    ],
  ],
};

const polygonB = {
  type: "Polygon" as const,
  coordinates: [
    [
      [-119.5, 39.2],
      [-119.0, 39.2],
      [-119.0, 39.7],
      [-119.5, 39.7],
      [-119.5, 39.2],
    ],
  ],
};

describe("geo/bbox", () => {
  it("computes a tight bbox for a polygon", () => {
    const bbox = computeBbox(polygonA);
    expect(bbox).toEqual([-120.5, 39.0, -120.0, 39.5]);
  });

  it("combines multiple bboxes", () => {
    const combined = combineBboxes([polygonA, polygonB]);
    expect(combined).toEqual([-120.5, 39.0, -119.0, 39.7]);
  });

  it("returns null when no inputs have geometry", () => {
    expect(combineBboxes([null, undefined])).toBeNull();
  });

  it("expands a bbox by a pad percent", () => {
    const padded = expandBbox([0, 0, 10, 10], 0.1);
    expect(padded).toEqual([-1, -1, 11, 11]);
  });

  it("computes a midpoint", () => {
    const center = centerOfBbox([-120.5, 39.0, -120.0, 39.5]);
    expect(center).toEqual({ lon: -120.25, lat: 39.25 });
  });
});
