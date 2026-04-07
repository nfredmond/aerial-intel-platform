import { createSignedDownloadUrl } from "@/lib/supabase/admin-storage";

export type StorageDownloadRef = {
  bucket: string;
  path: string;
};

function normalizePart(value: string | null | undefined) {
  return typeof value === "string" ? value.trim() : "";
}

function looksLikeLocalPath(value: string) {
  return value.startsWith("/") || /^[A-Za-z]:[\\/]/.test(value);
}

function looksLikeUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

export function parseStorageDownloadRef(input: {
  bucket?: string | null;
  path?: string | null;
}): StorageDownloadRef | null {
  const explicitBucket = normalizePart(input.bucket);
  const explicitPath = normalizePart(input.path);

  if (explicitBucket && explicitPath) {
    if (looksLikeLocalPath(explicitPath) || looksLikeUrl(explicitPath)) {
      return null;
    }

    return {
      bucket: explicitBucket,
      path: explicitPath,
    };
  }

  if (!explicitPath || looksLikeLocalPath(explicitPath) || looksLikeUrl(explicitPath)) {
    return null;
  }

  const slashIndex = explicitPath.indexOf("/");
  if (slashIndex <= 0 || slashIndex === explicitPath.length - 1) {
    return null;
  }

  return {
    bucket: explicitPath.slice(0, slashIndex),
    path: explicitPath.slice(slashIndex + 1),
  };
}

export async function tryCreateSignedDownloadUrl(input: {
  bucket?: string | null;
  path?: string | null;
  expiresInSeconds?: number;
  download?: string | boolean;
}) {
  const ref = parseStorageDownloadRef(input);
  if (!ref) {
    return null;
  }

  try {
    return await createSignedDownloadUrl({
      bucket: ref.bucket,
      path: ref.path,
      expiresInSeconds: input.expiresInSeconds,
      download: input.download,
    });
  } catch {
    return null;
  }
}
