import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildTitilerBoundsUrl,
  buildTitilerInfoUrl,
  buildTitilerTileJsonUrl,
  buildTitilerTileUrl,
  fetchTitilerBounds,
} from "./client";

const ORIGINAL_TITILER_URL = process.env.AERIAL_TITILER_URL;

afterEach(() => {
  if (ORIGINAL_TITILER_URL === undefined) {
    delete process.env.AERIAL_TITILER_URL;
  } else {
    process.env.AERIAL_TITILER_URL = ORIGINAL_TITILER_URL;
  }
  vi.restoreAllMocks();
});

describe("buildTitilerTileUrl", () => {
  it("builds a WebMercatorQuad PNG tile template using the explicit base url", () => {
    const url = buildTitilerTileUrl({
      baseUrl: "https://tiles.example.com",
      cogUrl: "https://bucket.example.com/ortho.tif",
    });
    expect(url).toBe(
      "https://tiles.example.com/cog/tiles/WebMercatorQuad/{z}/{x}/{y}.png?url=https%3A%2F%2Fbucket.example.com%2Fortho.tif",
    );
  });

  it("honours configured base url trimming trailing slash", () => {
    process.env.AERIAL_TITILER_URL = "https://tiles.example.com/";
    const url = buildTitilerTileUrl({
      cogUrl: "https://bucket.example.com/dsm.tif",
      rescale: [0, 500],
      colormapName: "viridis",
      tileFormat: "webp",
    });
    expect(url).toContain("https://tiles.example.com/cog/tiles/WebMercatorQuad/{z}/{x}/{y}.webp?");
    expect(url).toContain("rescale=0%2C500");
    expect(url).toContain("colormap_name=viridis");
  });

  it("throws when base url missing", () => {
    delete process.env.AERIAL_TITILER_URL;
    expect(() =>
      buildTitilerTileUrl({ cogUrl: "https://bucket.example.com/ortho.tif" }),
    ).toThrow(/not configured/);
  });
});

describe("buildTitilerBoundsUrl and buildTitilerInfoUrl", () => {
  it("encodes the COG URL as a query parameter", () => {
    const boundsUrl = buildTitilerBoundsUrl({
      baseUrl: "https://tiles.example.com",
      cogUrl: "https://bucket.example.com/ortho.tif",
    });
    expect(boundsUrl).toBe(
      "https://tiles.example.com/cog/bounds?url=https%3A%2F%2Fbucket.example.com%2Fortho.tif",
    );

    const infoUrl = buildTitilerInfoUrl({
      baseUrl: "https://tiles.example.com",
      cogUrl: "https://bucket.example.com/ortho.tif",
    });
    expect(infoUrl).toBe(
      "https://tiles.example.com/cog/info?url=https%3A%2F%2Fbucket.example.com%2Fortho.tif",
    );
  });
});

describe("buildTitilerTileJsonUrl", () => {
  it("builds a tilejson url including rescale params", () => {
    const url = buildTitilerTileJsonUrl({
      baseUrl: "https://tiles.example.com",
      cogUrl: "https://bucket.example.com/dsm.tif",
      rescale: [10, 1200],
      colormapName: "terrain",
    });
    expect(url).toContain("https://tiles.example.com/cog/WebMercatorQuad/tilejson.json?");
    expect(url).toContain("url=https%3A%2F%2Fbucket.example.com%2Fdsm.tif");
    expect(url).toContain("rescale=10%2C1200");
    expect(url).toContain("colormap_name=terrain");
  });
});

describe("fetchTitilerBounds", () => {
  it("returns parsed bounds when request succeeds", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({ bounds: [-123, 39, -121, 40], crs: "EPSG:4326" }),
    } as unknown as Response);

    const result = await fetchTitilerBounds({
      baseUrl: "https://tiles.example.com",
      cogUrl: "https://bucket.example.com/ortho.tif",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result.bounds).toEqual([-123, 39, -121, 40]);
    expect(fetchImpl).toHaveBeenCalledWith(
      expect.stringContaining("/cog/bounds?url="),
      { cache: "no-store" },
    );
  });

  it("throws when response is not ok", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      statusText: "Bad Gateway",
      json: async () => ({}),
    } as unknown as Response);

    await expect(
      fetchTitilerBounds({
        baseUrl: "https://tiles.example.com",
        cogUrl: "https://bucket.example.com/ortho.tif",
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toThrow(/bounds request failed/);
  });
});
