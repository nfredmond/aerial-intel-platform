import type { StyleSpecification } from "maplibre-gl";

/**
 * Shared basemap resolution for every MapLibre surface in the app.
 *
 * Precedence: explicit style argument, then NEXT_PUBLIC_MAPLIBRE_STYLE_URL,
 * then Mapbox Static Tiles when NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN is set, and
 * finally the OSM raster fallback so maps still render in development with
 * no configuration. The OSM fallback is NOT suitable for production traffic
 * (openstreetmap.org tile usage policy) — set the Mapbox token instead.
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

/**
 * Default Mapbox style for the platform: satellite imagery with streets and
 * labels — the right context for planning drone missions and reviewing
 * orthomosaics against real ground truth.
 */
export const DEFAULT_MAPBOX_STYLE_ID = "mapbox/satellite-streets-v12";

const MAPBOX_ATTRIBUTION =
  '© <a href="https://www.mapbox.com/about/maps/">Mapbox</a> © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> <a href="https://apps.mapbox.com/feedback/" target="_blank" rel="noreferrer">Improve this map</a>';

/**
 * Build a MapLibre-compatible raster style from the Mapbox Static Tiles API.
 * Raster tiles keep the existing MapLibre + terra-draw stack untouched —
 * no mapbox-gl dependency and no mapbox:// protocol handling needed.
 */
export function buildMapboxRasterStyle(
  accessToken: string,
  styleId: string = DEFAULT_MAPBOX_STYLE_ID,
): StyleSpecification {
  const normalizedStyleId = styleId.replace(/^\/+|\/+$/g, "");
  return {
    version: 8,
    sources: {
      "mapbox-tiles": {
        type: "raster",
        tiles: [
          `https://api.mapbox.com/styles/v1/${normalizedStyleId}/tiles/512/{z}/{x}/{y}@2x?access_token=${encodeURIComponent(accessToken)}`,
        ],
        tileSize: 512,
        attribution: MAPBOX_ATTRIBUTION,
      },
    },
    layers: [
      {
        id: "mapbox-tiles",
        type: "raster",
        source: "mapbox-tiles",
      },
    ],
  };
}

export function resolveMapStyle(styleUrl?: string | null): string | StyleSpecification {
  const env = typeof process !== "undefined" ? process.env : undefined;
  if (styleUrl) return styleUrl;

  const envStyle = env?.NEXT_PUBLIC_MAPLIBRE_STYLE_URL;
  if (envStyle) return envStyle;

  const mapboxToken = env?.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN?.trim();
  if (mapboxToken) {
    return buildMapboxRasterStyle(
      mapboxToken,
      env?.NEXT_PUBLIC_MAPBOX_STYLE_ID?.trim() || DEFAULT_MAPBOX_STYLE_ID,
    );
  }

  return FALLBACK_OSM_STYLE;
}
