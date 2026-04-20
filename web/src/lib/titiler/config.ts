export type TitilerConfig = {
  configured: boolean;
  baseUrl: string | null;
};

function normalizeEnvString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function stripTrailingSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

export function getTitilerConfig(): TitilerConfig {
  const raw = normalizeEnvString(process.env.AERIAL_TITILER_URL);
  const baseUrl = raw ? stripTrailingSlash(raw) : null;
  return {
    configured: Boolean(baseUrl),
    baseUrl,
  };
}
