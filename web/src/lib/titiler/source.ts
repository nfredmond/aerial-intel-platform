import { getSupabaseEnv } from "@/lib/supabase/env";

function safeOrigin(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

/**
 * Swap the origin (scheme + host + port) of `url` to the origin of `toBaseUrl`,
 * preserving the path and query string (which for a Supabase signed URL carries
 * the signing token). Returns the URL unchanged when it cannot be parsed, when
 * `toBaseUrl` has no usable origin, or when a known `fromOrigin` does not match
 * `url`'s origin (so unrelated URLs are never rewritten).
 */
export function rewriteStorageOrigin(
  url: string,
  fromOrigin: string | null,
  toBaseUrl: string,
): string {
  const toOrigin = safeOrigin(toBaseUrl);
  if (!toOrigin) return url;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }

  if (fromOrigin && parsed.origin !== fromOrigin) return url;

  const target = new URL(toOrigin);
  parsed.protocol = target.protocol;
  parsed.host = target.host; // host includes the port
  return parsed.toString();
}

/**
 * Resolve the COG URL that TiTiler should fetch from.
 *
 * TiTiler reads the COG server-side — commonly from inside a Docker container
 * where the app's Supabase storage origin (e.g. `http://127.0.0.1:55321` on a
 * self-host) is unreachable, because `127.0.0.1` inside the container is the
 * container's own loopback, not the host. When `AERIAL_TITILER_STORAGE_URL` is
 * set, rewrite the signed COG URL's origin to that TiTiler-reachable origin
 * (e.g. the docker bridge gateway `http://172.17.0.1:55321`) before handing it
 * to TiTiler. Only the copy passed to TiTiler is rewritten; the browser-facing
 * signed URL used for direct downloads is left untouched.
 *
 * No-op when the variable is unset — the correct behavior when TiTiler can
 * already reach the app's storage origin (hosted Supabase behind a public URL).
 */
export function resolveTitilerSourceUrl(cogUrl: string): string {
  const storageBaseUrl = process.env.AERIAL_TITILER_STORAGE_URL?.trim();
  if (!storageBaseUrl) return cogUrl;

  let appStorageOrigin: string | null = null;
  try {
    appStorageOrigin = safeOrigin(getSupabaseEnv().url);
  } catch {
    appStorageOrigin = null;
  }

  return rewriteStorageOrigin(cogUrl, appStorageOrigin, storageBaseUrl);
}
