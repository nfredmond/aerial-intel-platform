import { describe, expect, it } from "vitest";

import {
  computeStride,
  decodeLaz,
  elevationColor,
  parseLasHeader,
  rgbNormalizer,
  rgbOffsetForFormat,
  type Vec3,
} from "./laz";

/** Build a minimal valid LAS 1.2 public header for tests. */
function buildHeader(opts: {
  pointFormat: number;
  pointLength: number;
  count: number;
  scale: Vec3;
  offset: Vec3;
  min: Vec3;
  max: Vec3;
}): Uint8Array {
  const buf = new Uint8Array(300);
  const dv = new DataView(buf.buffer);
  buf[0] = 0x4c; // L
  buf[1] = 0x41; // A
  buf[2] = 0x53; // S
  buf[3] = 0x46; // F
  dv.setUint8(24, 1); // version major
  dv.setUint8(25, 2); // version minor
  dv.setUint8(104, opts.pointFormat);
  dv.setUint16(105, opts.pointLength, true);
  dv.setUint32(107, opts.count, true);
  dv.setFloat64(131, opts.scale[0], true);
  dv.setFloat64(139, opts.scale[1], true);
  dv.setFloat64(147, opts.scale[2], true);
  dv.setFloat64(155, opts.offset[0], true);
  dv.setFloat64(163, opts.offset[1], true);
  dv.setFloat64(171, opts.offset[2], true);
  dv.setFloat64(179, opts.max[0], true);
  dv.setFloat64(187, opts.min[0], true);
  dv.setFloat64(195, opts.max[1], true);
  dv.setFloat64(203, opts.min[1], true);
  dv.setFloat64(211, opts.max[2], true);
  dv.setFloat64(219, opts.min[2], true);
  return buf;
}

describe("parseLasHeader", () => {
  it("parses core fields and strips the LAZ compression flag from the format byte", () => {
    const header = buildHeader({
      pointFormat: 0x80 | 3, // high bit = LAZ compressed
      pointLength: 34,
      count: 2554,
      scale: [0.001, 0.001, 0.001],
      offset: [437055, 4572799, 0],
      min: [436887.36, 4572671.5, 230.0],
      max: [437151.79, 4572914.5, 255.99],
    });
    const parsed = parseLasHeader(header);
    expect(parsed.version).toBe("1.2");
    expect(parsed.pointFormat).toBe(3);
    expect(parsed.pointLength).toBe(34);
    expect(parsed.pointCount).toBe(2554);
    expect(parsed.scale).toEqual([0.001, 0.001, 0.001]);
    expect(parsed.offset).toEqual([437055, 4572799, 0]);
    expect(parsed.bounds.min[2]).toBeCloseTo(230.0, 5);
    expect(parsed.bounds.max[0]).toBeCloseTo(437151.79, 2);
  });

  it("throws on a non-LAS buffer", () => {
    expect(() => parseLasHeader(new Uint8Array([1, 2, 3, 4, 5]))).toThrow(/LASF/);
  });
});

describe("rgbOffsetForFormat", () => {
  it("maps color-bearing formats and returns null otherwise", () => {
    expect(rgbOffsetForFormat(2)).toBe(20);
    expect(rgbOffsetForFormat(3)).toBe(28);
    expect(rgbOffsetForFormat(7)).toBe(30);
    expect(rgbOffsetForFormat(0)).toBeNull();
    expect(rgbOffsetForFormat(6)).toBeNull();
  });
});

describe("computeStride", () => {
  it("returns 1 when under budget and decimates when over", () => {
    expect(computeStride(1000, 1500)).toBe(1);
    expect(computeStride(1500, 1500)).toBe(1);
    expect(computeStride(3000, 1500)).toBe(2);
    expect(computeStride(3001, 1500)).toBe(3);
    expect(computeStride(1000, 0)).toBe(1);
  });
});

describe("rgbNormalizer", () => {
  it("treats <=255 max as 8-bit and >255 as 16-bit", () => {
    expect(rgbNormalizer(255)).toBeCloseTo(1 / 255);
    expect(rgbNormalizer(200)).toBeCloseTo(1 / 255);
    expect(rgbNormalizer(256)).toBeCloseTo(1 / 65535);
    expect(rgbNormalizer(65535)).toBeCloseTo(1 / 65535);
  });
});

describe("elevationColor", () => {
  it("clamps out-of-range input to the endpoints", () => {
    expect(elevationColor(-1)).toEqual(elevationColor(0));
    expect(elevationColor(2)).toEqual(elevationColor(1));
  });
  it("returns rgb components within [0,1]", () => {
    for (const t of [0, 0.3, 0.5, 0.8, 1]) {
      const c = elevationColor(t);
      for (const ch of c) {
        expect(ch).toBeGreaterThanOrEqual(0);
        expect(ch).toBeLessThanOrEqual(1);
      }
    }
  });
});

/**
 * Fake laz-perf module: synthesizes point records into the WASM heap so the
 * decode loop (recentering, axis mapping, color normalization) is exercised
 * without the real WASM.
 */
function makeFakeModule(points: Array<{ xi: number; yi: number; zi: number; rgb?: Vec3 }>, opts: {
  pointFormat: number;
  pointLength: number;
  rgbOffset: number | null;
}) {
  const heap = new Uint8Array(1 << 16);
  let bump = 8;
  let cursor = 0;
  return {
    _malloc(size: number) {
      const ptr = bump;
      bump += size + 8;
      return ptr;
    },
    _free() {},
    HEAPU8: heap,
    LASZip: class {
      open() {}
      getCount() {
        return points.length;
      }
      getPointFormat() {
        return opts.pointFormat;
      }
      getPointLength() {
        return opts.pointLength;
      }
      getPoint(destPtr: number) {
        const pt = points[cursor++];
        const dv = new DataView(heap.buffer, destPtr, opts.pointLength);
        dv.setInt32(0, pt.xi, true);
        dv.setInt32(4, pt.yi, true);
        dv.setInt32(8, pt.zi, true);
        if (opts.rgbOffset !== null && pt.rgb) {
          dv.setUint16(opts.rgbOffset, pt.rgb[0], true);
          dv.setUint16(opts.rgbOffset + 2, pt.rgb[1], true);
          dv.setUint16(opts.rgbOffset + 4, pt.rgb[2], true);
        }
      }
      delete() {}
    },
  };
}

describe("decodeLaz", () => {
  const header = buildHeader({
    pointFormat: 3,
    pointLength: 34,
    count: 2,
    scale: [0.01, 0.01, 0.01],
    offset: [1000, 2000, 50],
    min: [1000, 2000, 50],
    max: [1010, 2010, 60],
  });

  it("recenters positions, maps elevation to up, and normalizes 8-bit RGB", async () => {
    const fake = makeFakeModule(
      [
        { xi: 0, yi: 0, zi: 0, rgb: [200, 100, 50] }, // world (1000,2000,50)
        { xi: 1000, yi: 1000, zi: 1000, rgb: [255, 255, 255] }, // world (1010,2010,60)
      ],
      { pointFormat: 3, pointLength: 34, rgbOffset: 28 },
    );
    const cloud = await decodeLaz(header, { createModule: async () => fake });

    expect(cloud.totalCount).toBe(2);
    expect(cloud.renderedCount).toBe(2);
    expect(cloud.colorMode).toBe("rgb");
    // center = (1005, 2005, 55); x = wx-cx, y = wz-cz, z = -(wy-cy)
    expect(Array.from(cloud.positions.slice(0, 3))).toEqual([-5, -5, 5]);
    expect(Array.from(cloud.positions.slice(3, 6))).toEqual([5, 5, -5]);
    expect(cloud.colors[0]).toBeCloseTo(200 / 255, 5);
    expect(cloud.colors[1]).toBeCloseTo(100 / 255, 5);
    expect(cloud.colors[3]).toBeCloseTo(1, 5);
    expect(cloud.boundingRadius).toBeCloseTo(Math.hypot(5, 5, 5), 5);
  });

  it("falls back to an elevation ramp when the format has no RGB", async () => {
    const noRgbHeader = buildHeader({
      pointFormat: 0,
      pointLength: 20,
      count: 2,
      scale: [0.01, 0.01, 0.01],
      offset: [1000, 2000, 50],
      min: [1000, 2000, 50],
      max: [1010, 2010, 60],
    });
    const fake = makeFakeModule(
      [
        { xi: 0, yi: 0, zi: 0 },
        { xi: 1000, yi: 1000, zi: 1000 },
      ],
      { pointFormat: 0, pointLength: 20, rgbOffset: null },
    );
    const cloud = await decodeLaz(noRgbHeader, { createModule: async () => fake });
    expect(cloud.colorMode).toBe("elevation");
    // lowest point uses the ramp start, highest uses the ramp end (compared with
    // tolerance because colors round-trip through a Float32Array).
    const start = elevationColor(0);
    const end = elevationColor(1);
    for (let i = 0; i < 3; i++) {
      expect(cloud.colors[i]).toBeCloseTo(start[i], 5);
      expect(cloud.colors[3 + i]).toBeCloseTo(end[i], 5);
    }
  });

  it("decimates when the cloud exceeds maxPoints", async () => {
    const bigHeader = buildHeader({
      pointFormat: 0,
      pointLength: 20,
      count: 4,
      scale: [1, 1, 1],
      offset: [0, 0, 0],
      min: [0, 0, 0],
      max: [3, 3, 3],
    });
    const fake = makeFakeModule(
      [
        { xi: 0, yi: 0, zi: 0 },
        { xi: 1, yi: 1, zi: 1 },
        { xi: 2, yi: 2, zi: 2 },
        { xi: 3, yi: 3, zi: 3 },
      ],
      { pointFormat: 0, pointLength: 20, rgbOffset: null },
    );
    const cloud = await decodeLaz(bigHeader, { createModule: async () => fake, maxPoints: 2 });
    expect(cloud.totalCount).toBe(4);
    expect(cloud.renderedCount).toBe(2); // stride 2 → points 0 and 2
  });
});
