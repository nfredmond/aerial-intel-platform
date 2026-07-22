import { describe, expect, it } from "vitest";

import {
  defaultCellSize,
  estimateVolume,
  fitPlaneXZ,
  horizontalDistance,
  pickNearestPointToRay,
  planArea,
  planPerimeter,
  planeHeight,
  pointInPolygonXZ,
  polygonBBoxXZ,
  slopeDistance,
  verticalDelta,
  type P3,
} from "./measure";

const p = (x: number, y: number, z: number): P3 => ({ x, y, z });

describe("distances", () => {
  it("slope distance is 3D euclidean", () => {
    expect(slopeDistance(p(0, 0, 0), p(3, 4, 0))).toBeCloseTo(5, 10);
    expect(slopeDistance(p(0, 0, 0), p(1, 2, 2))).toBeCloseTo(3, 10);
  });

  it("horizontal distance ignores elevation", () => {
    expect(horizontalDistance(p(0, 100, 0), p(3, -50, 4))).toBeCloseTo(5, 10);
  });

  it("vertical delta is signed rise", () => {
    expect(verticalDelta(p(0, 10, 0), p(0, 25, 0))).toBeCloseTo(15, 10);
    expect(verticalDelta(p(0, 25, 0), p(0, 10, 0))).toBeCloseTo(-15, 10);
  });
});

describe("planar area and perimeter", () => {
  const unitSquare = [p(0, 0, 0), p(1, 0, 0), p(1, 0, 1), p(0, 0, 1)];

  it("unit square has area 1 regardless of winding", () => {
    expect(planArea(unitSquare)).toBeCloseTo(1, 10);
    expect(planArea([...unitSquare].reverse())).toBeCloseTo(1, 10);
  });

  it("area ignores elevation (uses x/z projection)", () => {
    const tilted = [p(0, 0, 0), p(2, 5, 0), p(2, 9, 2), p(0, -3, 2)];
    expect(planArea(tilted)).toBeCloseTo(4, 10);
  });

  it("triangle area via shoelace", () => {
    expect(planArea([p(0, 0, 0), p(4, 0, 0), p(0, 0, 3)])).toBeCloseTo(6, 10);
  });

  it("degenerate polygons have zero area", () => {
    expect(planArea([p(0, 0, 0), p(1, 0, 1)])).toBe(0);
  });

  it("perimeter sums closed boundary segments", () => {
    expect(planPerimeter(unitSquare)).toBeCloseTo(4, 10);
  });
});

describe("point in polygon (x/z)", () => {
  const square = [p(0, 0, 0), p(10, 0, 0), p(10, 0, 10), p(0, 0, 10)];

  it("detects interior and exterior points", () => {
    expect(pointInPolygonXZ(5, 5, square)).toBe(true);
    expect(pointInPolygonXZ(-1, 5, square)).toBe(false);
    expect(pointInPolygonXZ(5, 11, square)).toBe(false);
  });

  it("handles a concave polygon", () => {
    // An L-shape occupying three quadrants of a 2x2 block.
    const ell = [p(0, 0, 0), p(2, 0, 0), p(2, 0, 1), p(1, 0, 1), p(1, 0, 2), p(0, 0, 2)];
    expect(pointInPolygonXZ(0.5, 1.5, ell)).toBe(true);
    expect(pointInPolygonXZ(1.5, 1.5, ell)).toBe(false);
  });
});

describe("bbox", () => {
  it("computes x/z extents", () => {
    const bbox = polygonBBoxXZ([p(-2, 9, 3), p(4, -1, -5), p(1, 0, 8)]);
    expect(bbox).toEqual({ minX: -2, maxX: 4, minZ: -5, maxZ: 8 });
  });
});

describe("base plane fitting", () => {
  it("passes exactly through three non-collinear points", () => {
    const tri = [p(0, 1, 0), p(2, 5, 0), p(0, 3, 4)];
    const plane = fitPlaneXZ(tri);
    for (const v of tri) {
      expect(planeHeight(plane, v.x, v.z)).toBeCloseTo(v.y, 8);
    }
  });

  it("recovers a known tilted plane by least squares", () => {
    // y = 0.5x + 2z + 3 sampled on a grid.
    const pts: P3[] = [];
    for (let x = 0; x <= 4; x++) {
      for (let z = 0; z <= 4; z++) {
        pts.push(p(x, 0.5 * x + 2 * z + 3, z));
      }
    }
    const plane = fitPlaneXZ(pts);
    expect(plane.a).toBeCloseTo(0.5, 6);
    expect(plane.b).toBeCloseTo(2, 6);
    expect(plane.c).toBeCloseTo(3, 6);
  });

  it("falls back to mean elevation for collinear vertices", () => {
    const collinear = [p(0, 2, 0), p(1, 4, 1), p(2, 6, 2)];
    const plane = fitPlaneXZ(collinear);
    expect(plane.a).toBe(0);
    expect(plane.b).toBe(0);
    expect(plane.c).toBeCloseTo(4, 10);
  });
});

describe("ray picking", () => {
  const positions = new Float32Array([
    0, 0, 0, // index 0
    5, 0, 0, // index 1
    0, 5, 0, // index 2
    0, 0, 5, // index 3
  ]);

  it("picks the point nearest the ray in front of the origin", () => {
    // Ray from (-1,0,0) pointing +x passes through index 0 and 1; index 0 is
    // on the ray (perp 0) and closer along the ray.
    const pick = pickNearestPointToRay(positions, p(-1, 0, 0), p(1, 0, 0));
    expect(pick?.index).toBe(0);
    expect(pick?.perpDistance).toBeCloseTo(0, 10);
  });

  it("ignores points behind the origin", () => {
    // Ray from (2,0,0) pointing +x: index 0 and 1 are behind/at; only points
    // with t>0 count. Aim slightly so index 1 is behind and 3 is off-axis.
    const pick = pickNearestPointToRay(new Float32Array([-5, 0, 0, 10, 0, 0]), p(0, 0, 0), p(1, 0, 0));
    expect(pick?.index).toBe(1);
  });

  it("returns null when nothing is within the perpendicular limit", () => {
    const pick = pickNearestPointToRay(positions, p(-1, 100, 0), p(1, 0, 0), 1);
    expect(pick).toBeNull();
  });
});

describe("volume estimation", () => {
  it("returns null for polygons with fewer than three vertices", () => {
    expect(estimateVolume(new Float32Array(), [p(0, 0, 0), p(1, 0, 1)])).toBeNull();
  });

  it("estimates a flat slab volume as area × height", () => {
    // A 10×10 flat top at y=2 over a base plane at y=0. Fill a dense grid.
    const pts: number[] = [];
    for (let x = 0; x <= 10; x += 0.5) {
      for (let z = 0; z <= 10; z += 0.5) {
        pts.push(x, 2, z);
      }
    }
    const polygon = [p(0, 0, 0), p(10, 0, 0), p(10, 0, 10), p(0, 0, 10)];
    const result = estimateVolume(new Float32Array(pts), polygon, {
      cellSize: 0.5,
      basePlane: { a: 0, b: 0, c: 0 },
    });
    expect(result).not.toBeNull();
    // Expected 10*10*2 = 200 m³; grid sampling is within a few percent.
    expect(result!.cut).toBeGreaterThan(180);
    expect(result!.cut).toBeLessThan(220);
    expect(result!.fill).toBeCloseTo(0, 5);
    expect(result!.area).toBeCloseTo(100, 6);
  });

  it("reports fill when the surface sits below the base plane", () => {
    const pts: number[] = [];
    for (let x = 0; x <= 4; x += 0.5) {
      for (let z = 0; z <= 4; z += 0.5) {
        pts.push(x, -1, z);
      }
    }
    const polygon = [p(0, 0, 0), p(4, 0, 0), p(4, 0, 4), p(0, 0, 4)];
    const result = estimateVolume(new Float32Array(pts), polygon, {
      cellSize: 0.5,
      basePlane: { a: 0, b: 0, c: 0 },
    });
    expect(result!.cut).toBeCloseTo(0, 5);
    expect(result!.fill).toBeGreaterThan(12);
    expect(result!.net).toBeLessThan(0);
  });

  it("default cell size scales with polygon extent", () => {
    expect(defaultCellSize({ minX: 0, maxX: 64, minZ: 0, maxZ: 32 })).toBeCloseTo(1, 10);
    expect(defaultCellSize({ minX: 0, maxX: 0.1, minZ: 0, maxZ: 0.1 })).toBe(0.01);
  });
});
