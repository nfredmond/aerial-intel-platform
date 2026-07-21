import { unzipSync } from "fflate";

import { isImageFilename } from "./nodeodm-upload";
import { processZipStream } from "./zip-stream";

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

/**
 * Streaming counterpart to parseZipToImages: images are handed to `handle`
 * one at a time as they finish inflating, applying the same sanitization,
 * image-extension, and first-wins dedupe rules. Use this for uploaded drone
 * ZIPs — it holds one image in memory instead of the whole archive.
 */
export async function streamZipImages(
  stream: ReadableStream<Uint8Array>,
  handle: (image: ExtractedImage) => Promise<void> | void,
): Promise<{ imageCount: number }> {
  const seen = new Set<string>();
  const { processedCount } = await processZipStream(stream, {
    filter: (entryName) => {
      const safeName = sanitizeStorageFilename(entryName);
      return Boolean(safeName && isImageFilename(safeName));
    },
    handle: async (entry) => {
      const safeName = sanitizeStorageFilename(entry.name);
      if (!safeName || entry.bytes.length === 0 || seen.has(safeName)) return;
      seen.add(safeName);
      await handle({ name: safeName, bytes: entry.bytes });
    },
  });
  void processedCount;
  return { imageCount: seen.size };
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
