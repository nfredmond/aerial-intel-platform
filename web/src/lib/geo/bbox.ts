import turfBbox from "@turf/bbox";
import type {
  BBox,
  Feature,
  FeatureCollection,
  Geometry,
  GeoJsonObject,
  Position,
} from "geojson";

export type BoundingBox = [number, number, number, number];

export function emptyBbox(): BoundingBox {
  return [Infinity, Infinity, -Infinity, -Infinity];
}

function expandBboxWithPosition(bbox: BoundingBox, position: Position): BoundingBox {
  const [lon, lat] = position;
  return [
    Math.min(bbox[0], lon),
    Math.min(bbox[1], lat),
    Math.max(bbox[2], lon),
    Math.max(bbox[3], lat),
  ];
}

export function isValidBbox(bbox: BoundingBox): boolean {
  return bbox.every((value) => Number.isFinite(value));
}

export function computeBbox(geojson: GeoJsonObject | null | undefined): BoundingBox | null {
  if (!geojson) return null;

  try {
    const rawBbox = turfBbox(geojson as Feature | FeatureCollection | Geometry) as BBox;
    const bbox: BoundingBox = [rawBbox[0], rawBbox[1], rawBbox[2], rawBbox[3]];
    return isValidBbox(bbox) ? bbox : null;
  } catch {
    return null;
  }
}

export function combineBboxes(inputs: Array<GeoJsonObject | null | undefined>): BoundingBox | null {
  let combined = emptyBbox();
  let touched = false;

  inputs.forEach((input) => {
    const bbox = computeBbox(input);
    if (!bbox) return;
    combined = [
      Math.min(combined[0], bbox[0]),
      Math.min(combined[1], bbox[1]),
      Math.max(combined[2], bbox[2]),
      Math.max(combined[3], bbox[3]),
    ];
    touched = true;
  });

  if (!touched || !isValidBbox(combined)) return null;
  return combined;
}

export function expandBbox(bbox: BoundingBox, padPercent = 0): BoundingBox {
  if (!isValidBbox(bbox)) return bbox;
  const [w, s, e, n] = bbox;
  const dx = (e - w) * padPercent;
  const dy = (n - s) * padPercent;
  return [w - dx, s - dy, e + dx, n + dy];
}

export function centerOfBbox(bbox: BoundingBox): { lon: number; lat: number } | null {
  if (!isValidBbox(bbox)) return null;
  return {
    lon: (bbox[0] + bbox[2]) / 2,
    lat: (bbox[1] + bbox[3]) / 2,
  };
}

// Re-export so components don't have to import turf directly
export { expandBboxWithPosition as _expandBboxWithPosition };
