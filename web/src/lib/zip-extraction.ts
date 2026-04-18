import { unzipSync } from "fflate";

import { isImageFilename } from "./nodeodm-upload";

export type ExtractedImage = { name: string; bytes: Uint8Array };

const TRAVERSAL_SEGMENTS = new Set(["..", ".", ""]);

export function sanitizeStorageFilename(rawName: string): string | null {
  const trimmed = rawName.trim();
  if (!trimmed) return null;
  const normalized = trimmed.replace(/\\/g, "/");
  const parts = normalized.split("/").filter((segment) => segment.length > 0);
  if (parts.length === 0) return null;
  if (parts.some((segment) => segment === ".." || segment === ".")) return null;
  const basename = parts[parts.length - 1];
  if (TRAVERSAL_SEGMENTS.has(basename)) return null;
  if (basename.includes("\0")) return null;
  return basename;
}

export function parseZipToImages(zipBytes: Uint8Array): ExtractedImage[] {
  const entries = unzipSync(zipBytes);
  const byName = new Map<string, ExtractedImage>();
  for (const [rawEntryName, bytes] of Object.entries(entries)) {
    if (!bytes || bytes.length === 0) continue;
    const safeName = sanitizeStorageFilename(rawEntryName);
    if (!safeName) continue;
    if (!isImageFilename(safeName)) continue;
    if (byName.has(safeName)) continue;
    byName.set(safeName, { name: safeName, bytes });
  }
  return Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name));
}
