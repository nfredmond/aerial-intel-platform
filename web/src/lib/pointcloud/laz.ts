// Browser-side LAZ/LAS point-cloud decoder built on laz-perf (WASM).
//
// ODM emits georeferenced `.laz` point clouds. This module parses the
// uncompressed LAS public header itself and streams the compressed point
// records through laz-perf, producing recentered Float32 position + color
// buffers ready for a three.js BufferGeometry.
//
// Real-world notes baked in from decoding actual ODM output:
//  - Coordinates are UTM (~4e5, ~4.5e6); float32 loses centimeter precision at
//    that magnitude, so positions are recentered to a local origin.
//  - The LAS spec stores RGB as 16-bit, but ODM (and many tools) write 8-bit
//    values into those fields. We auto-detect the range instead of assuming.

export type Vec3 = [number, number, number];

export type LasHeader = {
  version: string;
  pointFormat: number;
  pointLength: number;
  pointCount: number;
  scale: Vec3;
  offset: Vec3;
  bounds: { min: Vec3; max: Vec3 };
};

// Byte offset of the first RGB channel within a point record, per LAS point
// data record format. Formats without color are absent.
const RGB_OFFSET: Record<number, number> = { 2: 20, 3: 28, 5: 28, 7: 30, 8: 30, 10: 30 };

export function rgbOffsetForFormat(pointFormat: number): number | null {
  return RGB_OFFSET[pointFormat] ?? null;
}

/** Parse the uncompressed LAS 1.x public header block. */
export function parseLasHeader(bytes: Uint8Array): LasHeader {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const signature = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  if (signature !== "LASF") {
    throw new Error("Not a LAS/LAZ file (missing LASF signature).");
  }
  const versionMajor = dv.getUint8(24);
  const versionMinor = dv.getUint8(25);
  // The high bit of the point-data-format byte flags LAZ compression.
  const pointFormat = dv.getUint8(104) & 0x3f;
  const pointLength = dv.getUint16(105, true);
  const legacyCount = dv.getUint32(107, true);
  const scale: Vec3 = [
    dv.getFloat64(131, true),
    dv.getFloat64(139, true),
    dv.getFloat64(147, true),
  ];
  const offset: Vec3 = [
    dv.getFloat64(155, true),
    dv.getFloat64(163, true),
    dv.getFloat64(171, true),
  ];
  const bounds = {
    max: [dv.getFloat64(179, true), dv.getFloat64(195, true), dv.getFloat64(211, true)] as Vec3,
    min: [dv.getFloat64(187, true), dv.getFloat64(203, true), dv.getFloat64(219, true)] as Vec3,
  };
  // LAS 1.4 moves the authoritative count to a 64-bit field at byte 247.
  let pointCount = legacyCount;
  if (versionMinor >= 4) {
    const extended = Number(dv.getBigUint64(247, true));
    if (extended > 0) pointCount = extended;
  }
  return {
    version: `${versionMajor}.${versionMinor}`,
    pointFormat,
    pointLength,
    pointCount,
    scale,
    offset,
    bounds,
  };
}

/** Stride to keep the rendered point total at or under `maxPoints`. */
export function computeStride(count: number, maxPoints: number): number {
  if (maxPoints <= 0 || count <= maxPoints) return 1;
  return Math.ceil(count / maxPoints);
}

/**
 * Divisor that normalizes raw RGB channel values into [0, 1]. LAS RGB is
 * nominally 16-bit, but 8-bit-in-16-bit-fields is common; pick based on the
 * observed maximum channel value.
 */
export function rgbNormalizer(maxChannel: number): number {
  return maxChannel > 255 ? 1 / 65535 : 1 / 255;
}

/**
 * Perceptual-ish elevation ramp (blue → cyan → green → yellow → red) used when
 * a cloud has no RGB. `t` is clamped to [0, 1]; returns rgb in [0, 1].
 */
export function elevationColor(t: number): Vec3 {
  const x = Math.min(1, Math.max(0, t));
  const stops: Array<{ at: number; c: Vec3 }> = [
    { at: 0.0, c: [0.27, 0.0, 0.33] },
    { at: 0.25, c: [0.13, 0.37, 0.55] },
    { at: 0.5, c: [0.13, 0.62, 0.53] },
    { at: 0.75, c: [0.48, 0.82, 0.32] },
    { at: 1.0, c: [0.99, 0.91, 0.14] },
  ];
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i];
    const b = stops[i + 1];
    if (x <= b.at) {
      const f = (x - a.at) / (b.at - a.at || 1);
      return [
        a.c[0] + (b.c[0] - a.c[0]) * f,
        a.c[1] + (b.c[1] - a.c[1]) * f,
        a.c[2] + (b.c[2] - a.c[2]) * f,
      ];
    }
  }
  return stops[stops.length - 1].c;
}

export type DecodedPointCloud = {
  header: LasHeader;
  /** Recentered local coordinates (three.js: x=east, y=up/elevation, z=south). */
  positions: Float32Array;
  /** Per-point RGB in [0, 1], same length as positions. */
  colors: Float32Array;
  /** World-coordinate origin subtracted from every point. */
  center: Vec3;
  totalCount: number;
  renderedCount: number;
  colorMode: "rgb" | "elevation";
  /** Local bounding radius (meters) for framing the camera. */
  boundingRadius: number;
};

type LazPerfModule = {
  _malloc(size: number): number;
  _free(ptr: number): void;
  HEAPU8: Uint8Array;
  LASZip: new () => {
    open(dataPtr: number, length: number): void;
    getPoint(destPtr: number): void;
    getCount(): number;
    getPointFormat(): number;
    getPointLength(): number;
    delete(): void;
  };
};

export type DecodeLazOptions = {
  maxPoints?: number;
  wasmBinary?: ArrayBuffer;
  /** Injectable factory for tests; defaults to the bundled laz-perf web build. */
  createModule?: (init: { wasmBinary?: ArrayBuffer }) => Promise<LazPerfModule>;
};

const DEFAULT_MAX_POINTS = 1_500_000;

export async function decodeLaz(
  bytes: Uint8Array,
  options: DecodeLazOptions = {},
): Promise<DecodedPointCloud> {
  const header = parseLasHeader(bytes);
  const maxPoints = options.maxPoints ?? DEFAULT_MAX_POINTS;

  const createModule =
    options.createModule ??
    (async (init) => {
      const mod = (await import("laz-perf/lib/web")) as {
        createLazPerf: (i: { wasmBinary?: ArrayBuffer }) => Promise<LazPerfModule>;
      };
      return mod.createLazPerf(init);
    });

  const lp = await createModule({ wasmBinary: options.wasmBinary });

  const filePtr = lp._malloc(bytes.byteLength);
  lp.HEAPU8.set(bytes, filePtr);
  const zip = new lp.LASZip();
  let pointPtr = 0;
  try {
    zip.open(filePtr, bytes.byteLength);
    const count = zip.getCount();
    const pointFormat = zip.getPointFormat();
    const pointLength = zip.getPointLength();
    const rgbOffset = rgbOffsetForFormat(pointFormat);
    const colorMode: "rgb" | "elevation" = rgbOffset === null ? "elevation" : "rgb";

    const stride = computeStride(count, maxPoints);
    const renderedCount = stride === 1 ? count : Math.ceil(count / stride);

    const center: Vec3 = [
      (header.bounds.min[0] + header.bounds.max[0]) / 2,
      (header.bounds.min[1] + header.bounds.max[1]) / 2,
      (header.bounds.min[2] + header.bounds.max[2]) / 2,
    ];
    const minZ = header.bounds.min[2];
    const zSpan = header.bounds.max[2] - minZ || 1;

    const positions = new Float32Array(renderedCount * 3);
    const colors = new Float32Array(renderedCount * 3);

    pointPtr = lp._malloc(pointLength);
    let view = new DataView(lp.HEAPU8.buffer, pointPtr, pointLength);
    let maxChannel = 0;
    let out = 0;
    for (let i = 0; i < count; i++) {
      zip.getPoint(pointPtr);
      if (stride !== 1 && i % stride !== 0) continue;
      // Guard against WASM heap growth detaching the backing buffer.
      if (view.buffer !== lp.HEAPU8.buffer) {
        view = new DataView(lp.HEAPU8.buffer, pointPtr, pointLength);
      }
      const wx = view.getInt32(0, true) * header.scale[0] + header.offset[0];
      const wy = view.getInt32(4, true) * header.scale[1] + header.offset[1];
      const wz = view.getInt32(8, true) * header.scale[2] + header.offset[2];
      const p = out * 3;
      // Elevation (wz) maps to three.js up axis (y); ground plane is x/z.
      positions[p] = wx - center[0];
      positions[p + 1] = wz - center[2];
      positions[p + 2] = -(wy - center[1]);

      if (rgbOffset !== null) {
        const r = view.getUint16(rgbOffset, true);
        const g = view.getUint16(rgbOffset + 2, true);
        const b = view.getUint16(rgbOffset + 4, true);
        if (r > maxChannel) maxChannel = r;
        if (g > maxChannel) maxChannel = g;
        if (b > maxChannel) maxChannel = b;
        colors[p] = r;
        colors[p + 1] = g;
        colors[p + 2] = b;
      } else {
        const [cr, cg, cb] = elevationColor((wz - minZ) / zSpan);
        colors[p] = cr;
        colors[p + 1] = cg;
        colors[p + 2] = cb;
      }
      out++;
    }

    if (rgbOffset !== null) {
      const norm = rgbNormalizer(maxChannel);
      for (let i = 0; i < colors.length; i++) colors[i] *= norm;
    }

    const local = header.bounds.max.map((m, i) => (m - header.bounds.min[i]) / 2);
    const boundingRadius = Math.hypot(local[0], local[1], local[2]) || 1;

    return {
      header,
      positions,
      colors,
      center,
      totalCount: count,
      renderedCount: out,
      colorMode,
      boundingRadius,
    };
  } finally {
    zip.delete();
    if (pointPtr) lp._free(pointPtr);
    lp._free(filePtr);
  }
}
