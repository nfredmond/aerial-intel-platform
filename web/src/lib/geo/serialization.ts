import type {
  Feature,
  FeatureCollection,
  Geometry,
  GeoJsonObject,
} from "geojson";

export function parseGeoJson(raw: string | null | undefined): GeoJsonObject | null {
  if (!raw || typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  try {
    const parsed = JSON.parse(trimmed) as GeoJsonObject | null;
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof (parsed as { type?: unknown }).type !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function stringifyGeoJson(geojson: GeoJsonObject | null | undefined): string | null {
  if (!geojson) return null;
  try {
    return JSON.stringify(geojson);
  } catch {
    return null;
  }
}

export function extractGeometry(input: GeoJsonObject | null | undefined): Geometry | null {
  if (!input) return null;

  switch (input.type) {
    case "Feature":
      return (input as Feature).geometry ?? null;
    case "FeatureCollection": {
      const fc = input as FeatureCollection;
      const first = fc.features?.[0];
      return first?.geometry ?? null;
    }
    case "Point":
    case "MultiPoint":
    case "LineString":
    case "MultiLineString":
    case "Polygon":
    case "MultiPolygon":
    case "GeometryCollection":
      return input as Geometry;
    default:
      return null;
  }
}

export function toFeature(input: GeoJsonObject | null | undefined): Feature | null {
  if (!input) return null;

  if (input.type === "Feature") return input as Feature;

  const geometry = extractGeometry(input);
  if (!geometry) return null;

  return {
    type: "Feature",
    geometry,
    properties: {},
  };
}

export function toFeatureCollection(
  inputs: Array<GeoJsonObject | null | undefined>,
): FeatureCollection {
  const features: Feature[] = [];

  inputs.forEach((input) => {
    const feature = toFeature(input);
    if (feature) features.push(feature);
  });

  return {
    type: "FeatureCollection",
    features,
  };
}
