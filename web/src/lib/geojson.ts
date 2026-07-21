import type { Json } from "@/lib/supabase/types";

export function parseGeoJsonSurface(input: string): Json {
  const parsed = JSON.parse(input) as unknown;

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Geometry must be a GeoJSON object.");
  }

  const candidate = parsed as { type?: unknown; coordinates?: unknown };
  if (candidate.type !== "Polygon" && candidate.type !== "MultiPolygon") {
    throw new Error("Geometry must be a GeoJSON Polygon or MultiPolygon.");
  }

  if (!Array.isArray(candidate.coordinates)) {
    throw new Error("Geometry coordinates are missing or invalid.");
  }

  // drone_missions.planning_geometry is geometry(MultiPolygon, 4326); PostGIS
  // rejects a bare Polygon at write time, so every surface normalizes to
  // MultiPolygon here — the one boundary both the mission AOI and dataset
  // footprint save paths share.
  if (candidate.type === "Polygon") {
    return { type: "MultiPolygon", coordinates: [candidate.coordinates] } as Json;
  }

  return parsed as Json;
}

export function formatGeoJsonSurface(value: Json | null | undefined) {
  if (!value) {
    return "";
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "";
  }
}
