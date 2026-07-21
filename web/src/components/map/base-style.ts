import type { StyleSpecification } from "maplibre-gl";

/**
 * Shared basemap resolution for every MapLibre surface in the app.
 * NEXT_PUBLIC_MAPLIBRE_STYLE_URL should point at a proper tile provider in
 * production; the OSM raster fallback exists so maps render in development
 * without configuration.
 */
export const FALLBACK_OSM_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: [
        "https://a.tile.openstreetmap.org/{z}/{x}/{y}.png",
        "https://b.tile.openstreetmap.org/{z}/{x}/{y}.png",
        "https://c.tile.openstreetmap.org/{z}/{x}/{y}.png",
      ],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors",
    },
  },
  layers: [
    {
      id: "osm",
      type: "raster",
      source: "osm",
    },
  ],
};

export function resolveMapStyle(styleUrl?: string | null): string | StyleSpecification {
  const envStyle = typeof process !== "undefined" ? process.env.NEXT_PUBLIC_MAPLIBRE_STYLE_URL : undefined;
  if (styleUrl) return styleUrl;
  if (envStyle) return envStyle;
  return FALLBACK_OSM_STYLE;
}
