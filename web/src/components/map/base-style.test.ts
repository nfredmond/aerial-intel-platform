import { afterEach, describe, expect, it, vi } from "vitest";

import type { StyleSpecification } from "maplibre-gl";

import {
  buildMapboxRasterStyle,
  DEFAULT_MAPBOX_STYLE_ID,
  FALLBACK_OSM_STYLE,
  resolveMapStyle,
} from "./base-style";

afterEach(() => {
  vi.unstubAllEnvs();
});

function firstTileUrl(style: string | StyleSpecification): string {
  const spec = style as StyleSpecification;
  const source = Object.values(spec.sources)[0] as { tiles: string[] };
  return source.tiles[0];
}

describe("resolveMapStyle", () => {
  it("prefers an explicit style URL over everything", () => {
    vi.stubEnv("NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN", "pk.test");
    expect(resolveMapStyle("https://example.com/style.json")).toBe("https://example.com/style.json");
  });

  it("prefers the MapLibre style env over the Mapbox token", () => {
    vi.stubEnv("NEXT_PUBLIC_MAPLIBRE_STYLE_URL", "https://tiles.example.com/style.json");
    vi.stubEnv("NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN", "pk.test");
    expect(resolveMapStyle()).toBe("https://tiles.example.com/style.json");
  });

  it("builds a Mapbox satellite-streets raster style when the token is set", () => {
    vi.stubEnv("NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN", "pk.test");
    const style = resolveMapStyle();
    const tileUrl = firstTileUrl(style);
    expect(tileUrl).toContain("https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/tiles/512/");
    expect(tileUrl).toContain("access_token=pk.test");
    const source = Object.values((style as StyleSpecification).sources)[0] as { attribution: string };
    expect(source.attribution).toContain("Mapbox");
    expect(source.attribution).toContain("OpenStreetMap");
  });

  it("honors a style id override", () => {
    vi.stubEnv("NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN", "pk.test");
    vi.stubEnv("NEXT_PUBLIC_MAPBOX_STYLE_ID", "mapbox/streets-v12");
    expect(firstTileUrl(resolveMapStyle())).toContain("/styles/v1/mapbox/streets-v12/tiles/");
  });

  it("falls back to OSM when nothing is configured", () => {
    expect(resolveMapStyle()).toBe(FALLBACK_OSM_STYLE);
  });
});

describe("buildMapboxRasterStyle", () => {
  it("uses 512px retina tiles and URL-encodes the token", () => {
    const style = buildMapboxRasterStyle("pk.a+b", DEFAULT_MAPBOX_STYLE_ID);
    const source = Object.values(style.sources)[0] as { tiles: string[]; tileSize: number };
    expect(source.tileSize).toBe(512);
    expect(source.tiles[0]).toContain("@2x?access_token=pk.a%2Bb");
  });
});
