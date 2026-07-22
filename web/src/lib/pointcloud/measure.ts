// Pure geometry for in-viewer point-cloud measurement.
//
// All functions operate in the decoder's *local* space (see laz.ts): a point is
// { x: east, y: up/elevation, z: -north }, in meters. Because the decoder only
// subtracts a constant origin and applies a distance-preserving axis remap to
// the UTM coordinates, Euclidean distances in this local space equal true
// ground distances in meters — which is what makes measurement meaningful.
//
// The ground plane is (x, z); elevation is y. Area and volume are computed on
// the horizontal projection, matching how survey tools report plan area and
// cut/fill against a base surface.

export type P3 = { x: number; y: number; z: number };

/** Straight-line (slope) distance between two points, in meters. */
export function slopeDistance(a: P3, b: P3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

/** Horizontal (plan) distance, ignoring elevation, in meters. */
export function horizontalDistance(a: P3, b: P3): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/** Signed elevation change from `a` to `b` (positive = b is higher), in meters. */
export function verticalDelta(a: P3, b: P3): number {
  return b.y - a.y;
}

/** Plan (horizontal-projected) area of a polygon via the shoelace formula, m². */
export function planArea(points: P3[]): number {
  if (points.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += a.x * b.z - b.x * a.z;
  }
  return Math.abs(sum) / 2;
}

/** Total perimeter length along the closed polygon boundary (plan), meters. */
export function planPerimeter(points: P3[]): number {
  if (points.length < 2) return 0;
  let total = 0;
  const closed = points.length >= 3;
  const last = closed ? points.length : points.length - 1;
  for (let i = 0; i < last; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    total += Math.hypot(a.x - b.x, a.z - b.z);
  }
  return total;
}

/**
 * Ray-casting point-in-polygon test on the horizontal (x, z) projection.
 * Points exactly on an edge may return either result; that ambiguity is
 * immaterial for grid-cell sampling.
 */
export function pointInPolygonXZ(x: number, z: number, poly: P3[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x;
    const zi = poly[i].z;
    const xj = poly[j].x;
    const zj = poly[j].z;
    const intersects =
      zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

export type BBoxXZ = { minX: number; maxX: number; minZ: number; maxZ: number };

export function polygonBBoxXZ(points: P3[]): BBoxXZ {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.z < minZ) minZ = p.z;
    if (p.z > maxZ) maxZ = p.z;
  }
  return { minX, maxX, minZ, maxZ };
}

export type PlaneXZ = { a: number; b: number; c: number };

/**
 * Least-squares fit of a plane y = a·x + b·z + c through the given points.
 * With exactly three non-collinear points this is the exact plane through
 * them. Degenerate (collinear / coincident) inputs fall back to a horizontal
 * plane at the mean elevation, which is a safe base for volume estimation.
 */
export function fitPlaneXZ(points: P3[]): PlaneXZ {
  const n = points.length;
  const meanY = n ? points.reduce((s, p) => s + p.y, 0) / n : 0;
  if (n < 3) return { a: 0, b: 0, c: meanY };

  // Normal equations for [a, b, c] minimizing Σ(a·x + b·z + c − y)².
  let sxx = 0;
  let sxz = 0;
  let sx = 0;
  let szz = 0;
  let sz = 0;
  let sxy = 0;
  let szy = 0;
  let sy = 0;
  for (const p of points) {
    sxx += p.x * p.x;
    sxz += p.x * p.z;
    sx += p.x;
    szz += p.z * p.z;
    sz += p.z;
    sxy += p.x * p.y;
    szy += p.z * p.y;
    sy += p.y;
  }
  // Solve the 3×3 system A·[a,b,c]ᵀ = B by Cramer's rule.
  const A = [
    [sxx, sxz, sx],
    [sxz, szz, sz],
    [sx, sz, n],
  ];
  const B = [sxy, szy, sy];
  const det = det3(A);
  if (Math.abs(det) < 1e-9) return { a: 0, b: 0, c: meanY };
  const a = det3(replaceCol(A, B, 0)) / det;
  const b = det3(replaceCol(A, B, 1)) / det;
  const c = det3(replaceCol(A, B, 2)) / det;
  return { a, b, c };
}

function det3(m: number[][]): number {
  return (
    m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
    m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
    m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0])
  );
}

function replaceCol(m: number[][], col: number[], index: number): number[][] {
  return m.map((row, i) => row.map((v, j) => (j === index ? col[i] : v)));
}

export function planeHeight(plane: PlaneXZ, x: number, z: number): number {
  return plane.a * x + plane.b * z + plane.c;
}

/** A reasonable grid cell size (meters) for the polygon's plan extent. */
export function defaultCellSize(bbox: BBoxXZ): number {
  const extent = Math.max(bbox.maxX - bbox.minX, bbox.maxZ - bbox.minZ);
  return Math.max(extent / 64, 0.01);
}

/**
 * Result of a picking test: the index of the nearest cloud point to a ray, its
 * perpendicular distance to the ray, and how far along the ray it sits.
 */
export type RayPick = {
  index: number;
  point: P3;
  rayDistance: number;
  perpDistance: number;
};

/**
 * Find the cloud point closest (perpendicularly) to a ray, considering only
 * points in front of the ray origin. Positions are a flat [x,y,z,…] buffer in
 * the same local space as the ray. Returns null if no point lies within
 * `maxPerpDistance` (when provided) of the ray.
 */
export function pickNearestPointToRay(
  positions: Float32Array,
  origin: P3,
  direction: P3,
  maxPerpDistance = Infinity,
): RayPick | null {
  // Normalize the direction so projections are true distances.
  const dlen = Math.hypot(direction.x, direction.y, direction.z) || 1;
  const dx = direction.x / dlen;
  const dy = direction.y / dlen;
  const dz = direction.z / dlen;

  let bestPerp = maxPerpDistance;
  let bestIndex = -1;
  let bestRay = 0;
  for (let i = 0; i < positions.length; i += 3) {
    const px = positions[i] - origin.x;
    const py = positions[i + 1] - origin.y;
    const pz = positions[i + 2] - origin.z;
    const t = px * dx + py * dy + pz * dz;
    if (t <= 0) continue; // behind the camera
    const ex = px - t * dx;
    const ey = py - t * dy;
    const ez = pz - t * dz;
    const perp = Math.hypot(ex, ey, ez);
    if (perp < bestPerp) {
      bestPerp = perp;
      bestIndex = i / 3;
      bestRay = t;
    }
  }
  if (bestIndex < 0) return null;
  return {
    index: bestIndex,
    point: {
      x: positions[bestIndex * 3],
      y: positions[bestIndex * 3 + 1],
      z: positions[bestIndex * 3 + 2],
    },
    rayDistance: bestRay,
    perpDistance: bestPerp,
  };
}

export type VolumeEstimate = {
  /** Material above the base plane (net requires subtracting fill), m³. */
  cut: number;
  /** Void below the base plane, m³. */
  fill: number;
  /** cut − fill, m³. */
  net: number;
  /** True polygon plan area (shoelace), m². */
  area: number;
  /** Grid cell edge length used, meters. */
  cellSize: number;
  /** Cells inside the polygon that had at least one cloud point. */
  filledCells: number;
  /** Cells whose center fell inside the polygon. */
  polygonCells: number;
  /** Cloud points that fell inside the polygon's bounding box. */
  sampledPoints: number;
  /** Base plane the volume was measured against. */
  basePlane: PlaneXZ;
};

/**
 * Estimate cut/fill volume of a point cloud within a polygon, measured against
 * a base plane fitted to the polygon's vertices (the "triangulated" base used
 * by survey tools). The cloud's upper surface is sampled onto a regular grid
 * (max elevation per cell), and per-cell height differences are integrated over
 * cell area. Returns null for polygons with fewer than three vertices.
 */
export function estimateVolume(
  positions: Float32Array,
  polygon: P3[],
  options: { cellSize?: number; basePlane?: PlaneXZ } = {},
): VolumeEstimate | null {
  if (polygon.length < 3) return null;
  const bbox = polygonBBoxXZ(polygon);
  const cellSize = options.cellSize ?? defaultCellSize(bbox);
  const basePlane = options.basePlane ?? fitPlaneXZ(polygon);

  const nx = Math.max(1, Math.ceil((bbox.maxX - bbox.minX) / cellSize));
  const nz = Math.max(1, Math.ceil((bbox.maxZ - bbox.minZ) / cellSize));
  const maxY = new Float32Array(nx * nz).fill(-Infinity);
  const hasData = new Uint8Array(nx * nz);

  let sampledPoints = 0;
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i];
    const z = positions[i + 2];
    if (x < bbox.minX || x > bbox.maxX || z < bbox.minZ || z > bbox.maxZ) continue;
    const ix = Math.min(nx - 1, Math.floor((x - bbox.minX) / cellSize));
    const iz = Math.min(nz - 1, Math.floor((z - bbox.minZ) / cellSize));
    const cell = iz * nx + ix;
    const y = positions[i + 1];
    if (!hasData[cell] || y > maxY[cell]) maxY[cell] = y;
    hasData[cell] = 1;
    sampledPoints++;
  }

  const cellArea = cellSize * cellSize;
  let cut = 0;
  let fill = 0;
  let filledCells = 0;
  let polygonCells = 0;
  for (let iz = 0; iz < nz; iz++) {
    const cz = bbox.minZ + (iz + 0.5) * cellSize;
    for (let ix = 0; ix < nx; ix++) {
      const cx = bbox.minX + (ix + 0.5) * cellSize;
      if (!pointInPolygonXZ(cx, cz, polygon)) continue;
      polygonCells++;
      const cell = iz * nx + ix;
      if (!hasData[cell]) continue;
      filledCells++;
      const dh = maxY[cell] - planeHeight(basePlane, cx, cz);
      if (dh >= 0) cut += dh * cellArea;
      else fill += -dh * cellArea;
    }
  }

  return {
    cut,
    fill,
    net: cut - fill,
    area: planArea(polygon),
    cellSize,
    filledCells,
    polygonCells,
    sampledPoints,
    basePlane,
  };
}
