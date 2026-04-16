import turfArea from "@turf/area";
import type { Feature, FeatureCollection, Geometry, GeoJsonObject } from "geojson";

const SQ_METERS_PER_HECTARE = 10_000;
const SQ_METERS_PER_ACRE = 4046.8564224;
const SQ_METERS_PER_SQ_KM = 1_000_000;
const SQ_METERS_PER_SQ_MILE = 2_589_988.110336;

export type AreaBreakdown = {
  squareMeters: number;
  hectares: number;
  acres: number;
  squareKilometers: number;
  squareMiles: number;
};

export function geometryArea(geojson: GeoJsonObject | null | undefined): number | null {
  if (!geojson) return null;

  try {
    const value = turfArea(geojson as Feature | FeatureCollection | Geometry);
    if (!Number.isFinite(value) || value <= 0) return null;
    return value;
  } catch {
    return null;
  }
}

export function areaBreakdown(squareMeters: number): AreaBreakdown {
  return {
    squareMeters,
    hectares: squareMeters / SQ_METERS_PER_HECTARE,
    acres: squareMeters / SQ_METERS_PER_ACRE,
    squareKilometers: squareMeters / SQ_METERS_PER_SQ_KM,
    squareMiles: squareMeters / SQ_METERS_PER_SQ_MILE,
  };
}

export function formatArea(squareMeters: number | null): string {
  if (squareMeters === null || !Number.isFinite(squareMeters) || squareMeters <= 0) {
    return "Unknown area";
  }

  const breakdown = areaBreakdown(squareMeters);

  if (breakdown.squareKilometers >= 1) {
    return `${breakdown.squareKilometers.toFixed(2)} km² (${breakdown.squareMiles.toFixed(2)} mi²)`;
  }

  if (breakdown.hectares >= 1) {
    return `${breakdown.hectares.toFixed(2)} ha (${breakdown.acres.toFixed(2)} ac)`;
  }

  return `${Math.round(squareMeters).toLocaleString()} m² (${breakdown.acres.toFixed(3)} ac)`;
}

export function describeArea(geojson: GeoJsonObject | null | undefined): string {
  return formatArea(geometryArea(geojson));
}
