import type { Json } from "@/lib/supabase/types";

type Position = [number, number];

type SupportedGeometry =
  | { type: "Polygon"; coordinates: Position[][] }
  | { type: "MultiPolygon"; coordinates: Position[][][] };

export type PreviewLayerInput = {
  label: string;
  geometry: Json | null | undefined;
  stroke: string;
  fill: string;
};

export type PreviewShape = {
  label: string;
  path: string;
  stroke: string;
  fill: string;
};

export type PreviewModel = {
  hasGeometry: boolean;
  viewBox: string;
  shapes: PreviewShape[];
};

function isPosition(value: unknown): value is Position {
  return Array.isArray(value)
    && value.length >= 2
    && typeof value[0] === "number"
    && typeof value[1] === "number"
    && Number.isFinite(value[0])
    && Number.isFinite(value[1]);
}

function asSupportedGeometry(value: Json | null | undefined): SupportedGeometry | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const candidate = value as { type?: unknown; coordinates?: unknown };
  if (candidate.type === "Polygon" && Array.isArray(candidate.coordinates)) {
    const coordinates = candidate.coordinates as unknown[];
    if (coordinates.every((ring) => Array.isArray(ring) && ring.every(isPosition))) {
      return { type: "Polygon", coordinates: coordinates as Position[][] };
    }
  }

  if (candidate.type === "MultiPolygon" && Array.isArray(candidate.coordinates)) {
    const coordinates = candidate.coordinates as unknown[];
    if (coordinates.every((polygon) => Array.isArray(polygon) && polygon.every((ring) => Array.isArray(ring) && ring.every(isPosition)))) {
      return { type: "MultiPolygon", coordinates: coordinates as Position[][][] };
    }
  }

  return null;
}

function getRings(geometry: SupportedGeometry) {
  return geometry.type === "Polygon" ? geometry.coordinates : geometry.coordinates.flat();
}

function toPath(rings: Position[][], project: (position: Position) => Position) {
  return rings
    .map((ring) => ring.map((position, index) => {
      const [x, y] = project(position);
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    }).join(" ") + " Z")
    .join(" ");
}

export function getGeoJsonPreviewModel(layers: PreviewLayerInput[]): PreviewModel {
  const parsedLayers = layers
    .map((layer) => ({ ...layer, geometry: asSupportedGeometry(layer.geometry) }))
    .filter((layer): layer is PreviewLayerInput & { geometry: SupportedGeometry } => layer.geometry !== null);

  if (parsedLayers.length === 0) {
    return {
      hasGeometry: false,
      viewBox: "0 0 320 220",
      shapes: [],
    };
  }

  const positions = parsedLayers.flatMap((layer) => getRings(layer.geometry).flat());
  const longitudes = positions.map(([lon]) => lon);
  const latitudes = positions.map(([, lat]) => lat);
  const minLon = Math.min(...longitudes);
  const maxLon = Math.max(...longitudes);
  const minLat = Math.min(...latitudes);
  const maxLat = Math.max(...latitudes);

  const width = 320;
  const height = 220;
  const padding = 18;
  const lonSpan = Math.max(0.000001, maxLon - minLon);
  const latSpan = Math.max(0.000001, maxLat - minLat);
  const scale = Math.min((width - padding * 2) / lonSpan, (height - padding * 2) / latSpan);

  const project = ([lon, lat]: Position): Position => {
    const x = padding + (lon - minLon) * scale;
    const y = height - padding - (lat - minLat) * scale;
    return [x, y];
  };

  return {
    hasGeometry: true,
    viewBox: `0 0 ${width} ${height}`,
    shapes: parsedLayers.map((layer) => ({
      label: layer.label,
      path: toPath(getRings(layer.geometry), project),
      stroke: layer.stroke,
      fill: layer.fill,
    })),
  };
}
