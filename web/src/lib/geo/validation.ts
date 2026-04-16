import type {
  Feature,
  FeatureCollection,
  Geometry,
  GeoJsonObject,
  LineString,
  MultiPolygon,
  Point,
  Polygon,
  Position,
} from "geojson";

export type ValidationIssue = {
  path: string;
  message: string;
};

export type ValidationResult = {
  ok: boolean;
  issues: ValidationIssue[];
};

const LON_MIN = -180;
const LON_MAX = 180;
const LAT_MIN = -90;
const LAT_MAX = 90;

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function isValidPosition(position: unknown): position is Position {
  if (!Array.isArray(position) || position.length < 2) return false;
  const [lon, lat] = position;
  if (!isFiniteNumber(lon) || !isFiniteNumber(lat)) return false;
  if (lon < LON_MIN || lon > LON_MAX) return false;
  if (lat < LAT_MIN || lat > LAT_MAX) return false;
  return true;
}

export function isClosedRing(ring: Position[]): boolean {
  if (!Array.isArray(ring) || ring.length < 4) return false;
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (!isValidPosition(first) || !isValidPosition(last)) return false;
  return first[0] === last[0] && first[1] === last[1];
}

export function ensureClosedRing(ring: Position[]): Position[] {
  if (ring.length < 3) return ring;
  if (isClosedRing(ring)) return ring;
  return [...ring, [...ring[0]] as Position];
}

export function ringSignedArea(ring: Position[]): number {
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i += 1) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[i + 1];
    sum += (x2 - x1) * (y2 + y1);
  }
  return sum / 2;
}

export function isClockwise(ring: Position[]): boolean {
  return ringSignedArea(ring) > 0;
}

export function validateGeometry(geometry: Geometry, path = "geometry"): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  switch (geometry.type) {
    case "Point": {
      const { coordinates } = geometry as Point;
      if (!isValidPosition(coordinates)) {
        issues.push({ path, message: "Point coordinates must be [lon, lat] within WGS84 bounds." });
      }
      break;
    }
    case "LineString": {
      const { coordinates } = geometry as LineString;
      if (!Array.isArray(coordinates) || coordinates.length < 2) {
        issues.push({ path, message: "LineString requires at least two valid positions." });
      } else {
        coordinates.forEach((pos, index) => {
          if (!isValidPosition(pos)) {
            issues.push({ path: `${path}.coordinates[${index}]`, message: "Position out of WGS84 bounds." });
          }
        });
      }
      break;
    }
    case "Polygon": {
      const { coordinates } = geometry as Polygon;
      if (!Array.isArray(coordinates) || coordinates.length === 0) {
        issues.push({ path, message: "Polygon must have at least one ring." });
        break;
      }
      coordinates.forEach((ring, ringIndex) => {
        if (!Array.isArray(ring) || ring.length < 4) {
          issues.push({ path: `${path}.coordinates[${ringIndex}]`, message: "Polygon rings need at least 4 positions including closure." });
          return;
        }
        ring.forEach((pos, index) => {
          if (!isValidPosition(pos)) {
            issues.push({ path: `${path}.coordinates[${ringIndex}][${index}]`, message: "Position out of WGS84 bounds." });
          }
        });
        if (!isClosedRing(ring)) {
          issues.push({ path: `${path}.coordinates[${ringIndex}]`, message: "Ring must be closed (first and last positions equal)." });
        }
      });
      break;
    }
    case "MultiPolygon": {
      const { coordinates } = geometry as MultiPolygon;
      if (!Array.isArray(coordinates) || coordinates.length === 0) {
        issues.push({ path, message: "MultiPolygon must have at least one polygon." });
        break;
      }
      coordinates.forEach((polygonCoords, polyIndex) => {
        const subIssues = validateGeometry(
          { type: "Polygon", coordinates: polygonCoords } as Polygon,
          `${path}.coordinates[${polyIndex}]`,
        );
        issues.push(...subIssues);
      });
      break;
    }
    default:
      issues.push({ path, message: `Unsupported geometry type: ${geometry.type}` });
  }

  return issues;
}

export function validateFeature(feature: Feature, path = "feature"): ValidationIssue[] {
  if (!feature || feature.type !== "Feature" || !feature.geometry) {
    return [{ path, message: "Feature must include a geometry." }];
  }
  return validateGeometry(feature.geometry, `${path}.geometry`);
}

export function validateGeoJson(input: GeoJsonObject | null | undefined): ValidationResult {
  if (!input) {
    return { ok: false, issues: [{ path: "root", message: "GeoJSON value missing." }] };
  }

  const issues: ValidationIssue[] = [];

  switch (input.type) {
    case "Feature":
      issues.push(...validateFeature(input as Feature, "feature"));
      break;
    case "FeatureCollection": {
      const fc = input as FeatureCollection;
      if (!Array.isArray(fc.features) || fc.features.length === 0) {
        issues.push({ path: "featureCollection", message: "FeatureCollection must include at least one feature." });
        break;
      }
      fc.features.forEach((feature, index) => {
        issues.push(...validateFeature(feature, `featureCollection.features[${index}]`));
      });
      break;
    }
    case "Point":
    case "LineString":
    case "Polygon":
    case "MultiPolygon":
      issues.push(...validateGeometry(input as Geometry, "geometry"));
      break;
    default:
      issues.push({ path: "root", message: `Unsupported GeoJSON type: ${input.type}` });
  }

  return { ok: issues.length === 0, issues };
}
