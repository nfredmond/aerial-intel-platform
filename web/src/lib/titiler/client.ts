import { getTitilerConfig } from "./config";

export type TitilerTileUrlOptions = {
  cogUrl: string;
  baseUrl?: string;
  tileFormat?: "png" | "webp" | "jpg";
  tileMatrixSetId?: string;
  rescale?: [number, number];
  colormapName?: string;
  expression?: string;
};

export type TitilerInfoUrlOptions = {
  cogUrl: string;
  baseUrl?: string;
};

function requireBaseUrl(explicit?: string): string {
  if (explicit && explicit.length > 0) return explicit;
  const config = getTitilerConfig();
  if (!config.baseUrl) {
    throw new Error(
      "TiTiler is not configured. Set AERIAL_TITILER_URL or pass an explicit baseUrl.",
    );
  }
  return config.baseUrl;
}

export function buildTitilerTileUrl(options: TitilerTileUrlOptions): string {
  const base = requireBaseUrl(options.baseUrl);
  const format = options.tileFormat ?? "png";
  const tms = options.tileMatrixSetId ?? "WebMercatorQuad";
  const params = new URLSearchParams();
  params.set("url", options.cogUrl);
  if (options.rescale) {
    params.set("rescale", `${options.rescale[0]},${options.rescale[1]}`);
  }
  if (options.colormapName) {
    params.set("colormap_name", options.colormapName);
  }
  if (options.expression) {
    params.set("expression", options.expression);
  }
  return `${base}/cog/tiles/${tms}/{z}/{x}/{y}.${format}?${params.toString()}`;
}

export function buildTitilerBoundsUrl(options: TitilerInfoUrlOptions): string {
  const base = requireBaseUrl(options.baseUrl);
  const params = new URLSearchParams({ url: options.cogUrl });
  return `${base}/cog/bounds?${params.toString()}`;
}

export function buildTitilerInfoUrl(options: TitilerInfoUrlOptions): string {
  const base = requireBaseUrl(options.baseUrl);
  const params = new URLSearchParams({ url: options.cogUrl });
  return `${base}/cog/info?${params.toString()}`;
}

export function buildTitilerTileJsonUrl(
  options: TitilerTileUrlOptions,
): string {
  const base = requireBaseUrl(options.baseUrl);
  const tms = options.tileMatrixSetId ?? "WebMercatorQuad";
  const params = new URLSearchParams();
  params.set("url", options.cogUrl);
  if (options.rescale) {
    params.set("rescale", `${options.rescale[0]},${options.rescale[1]}`);
  }
  if (options.colormapName) {
    params.set("colormap_name", options.colormapName);
  }
  if (options.expression) {
    params.set("expression", options.expression);
  }
  return `${base}/cog/${tms}/tilejson.json?${params.toString()}`;
}

export type TitilerBounds = {
  bounds: [number, number, number, number];
  crs?: string;
};

export async function fetchTitilerBounds(
  options: TitilerInfoUrlOptions & { fetchImpl?: typeof fetch },
): Promise<TitilerBounds> {
  const url = buildTitilerBoundsUrl(options);
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(
      `TiTiler bounds request failed: ${response.status} ${response.statusText}`,
    );
  }
  const payload = (await response.json()) as TitilerBounds;
  if (!Array.isArray(payload.bounds) || payload.bounds.length !== 4) {
    throw new Error("TiTiler bounds response missing bounds array");
  }
  return payload;
}
