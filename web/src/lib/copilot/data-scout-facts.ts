import type { DatasetDetail } from "@/lib/missions/detail-data";
import type { Json } from "@/lib/supabase/types";

import type { DataScoutFact, DataScoutFlag } from "./data-scout";

function pushFact(out: DataScoutFact[], id: string, label: string, value: unknown): void {
  if (value === undefined || value === null) return;
  const s = typeof value === "string" ? value : String(value);
  if (!s.trim()) return;
  out.push({ id, label, value: s });
}

function readRecord(value: Json | null | undefined): Record<string, Json> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, Json>;
}

function readArray(value: Json | null | undefined): Json[] {
  return Array.isArray(value) ? value : [];
}

function readNumber(v: Json | undefined): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function readString(v: Json | undefined): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v : null;
}

function readBoolean(v: Json | undefined): boolean | null {
  return typeof v === "boolean" ? v : null;
}

export type DataScoutBuildResult = {
  imageCount: number;
  flags: DataScoutFlag[];
  facts: DataScoutFact[];
};

const LOW_VARIANCE_THRESHOLD = 80;

/**
 * Deterministic classification of per-image metadata on a dataset. Pulls from
 * `dataset.metadata.per_image_summary[]` if present. Each entry is expected to
 * have `{ basename, has_gps?, has_exif?, has_timestamp?, blur_variance?,
 * duplicate_of? }`. Missing fields are treated as "unknown" and do NOT trigger
 * a flag — only explicit negatives do.
 *
 * The scout is advisory, not a gate: it lights up whatever is already present
 * in the dataset row. If the ingest pipeline later starts writing richer
 * per-image fields, this function picks them up automatically.
 */
export function buildDataScoutInputs(detail: DatasetDetail): DataScoutBuildResult {
  const flags: DataScoutFlag[] = [];
  const facts: DataScoutFact[] = [];
  const dataset = detail.dataset;
  const meta = readRecord(dataset.metadata ?? null);

  const declaredCount = meta ? readNumber(meta.image_count) : null;
  let imageCount = declaredCount ?? 0;

  pushFact(facts, `dataset:${dataset.id}:name`, "Dataset", dataset.name);
  pushFact(facts, `dataset:${dataset.id}:kind`, "Kind", dataset.kind);
  if (dataset.captured_at) {
    pushFact(facts, `dataset:${dataset.id}:captured_at`, "Captured at", dataset.captured_at);
  }
  if (declaredCount !== null) {
    pushFact(
      facts,
      `dataset:${dataset.id}:image_count`,
      "Image count",
      String(declaredCount),
    );
  }

  const perImage = meta ? readArray(meta.per_image_summary) : [];
  if (perImage.length > 0 && imageCount === 0) {
    imageCount = perImage.length;
  }

  const seenBasenames = new Map<string, number>();
  let missingGps = 0;
  let missingTimestamp = 0;
  let missingExif = 0;
  let lowVariance = 0;
  let duplicates = 0;

  for (const entry of perImage) {
    const row = readRecord(entry);
    if (!row) continue;
    const basename = readString(row.basename);
    if (!basename) continue;

    const count = (seenBasenames.get(basename) ?? 0) + 1;
    seenBasenames.set(basename, count);

    const hasGps = readBoolean(row.has_gps);
    const hasTimestamp = readBoolean(row.has_timestamp);
    const hasExif = readBoolean(row.has_exif);
    const variance = readNumber(row.blur_variance);

    if (hasExif === false) {
      missingExif += 1;
      flags.push({
        basename,
        kind: "missing-exif",
        detail: "EXIF block is absent on this image.",
      });
    }
    if (hasGps === false) {
      missingGps += 1;
      flags.push({
        basename,
        kind: "missing-gps",
        detail: "No GPS coordinates recorded.",
      });
    }
    if (hasTimestamp === false) {
      missingTimestamp += 1;
      flags.push({
        basename,
        kind: "missing-timestamp",
        detail: "No capture timestamp recorded.",
      });
    }
    if (variance !== null && variance < LOW_VARIANCE_THRESHOLD) {
      lowVariance += 1;
      flags.push({
        basename,
        kind: "low-variance",
        detail: `Laplacian variance ${variance.toFixed(1)} is below the ${LOW_VARIANCE_THRESHOLD} blur threshold.`,
      });
    }
  }

  for (const [basename, count] of seenBasenames) {
    if (count > 1) {
      duplicates += 1;
      flags.push({
        basename,
        kind: "duplicate-basename",
        detail: `Basename appears ${count} times; one of these is likely a duplicate.`,
      });
    }
  }

  if (imageCount > 0) {
    pushFact(
      facts,
      `scout:${dataset.id}:image_count`,
      "Images inspected",
      String(imageCount),
    );
  }
  if (missingExif > 0) {
    pushFact(
      facts,
      `scout:${dataset.id}:missing_exif`,
      "Images missing EXIF",
      String(missingExif),
    );
  }
  if (missingGps > 0) {
    pushFact(
      facts,
      `scout:${dataset.id}:missing_gps`,
      "Images missing GPS",
      String(missingGps),
    );
  }
  if (missingTimestamp > 0) {
    pushFact(
      facts,
      `scout:${dataset.id}:missing_timestamp`,
      "Images missing capture timestamp",
      String(missingTimestamp),
    );
  }
  if (lowVariance > 0) {
    pushFact(
      facts,
      `scout:${dataset.id}:low_variance`,
      `Images below blur-variance threshold (${LOW_VARIANCE_THRESHOLD})`,
      String(lowVariance),
    );
  }
  if (duplicates > 0) {
    pushFact(
      facts,
      `scout:${dataset.id}:duplicate_basenames`,
      "Duplicate basenames",
      String(duplicates),
    );
  }

  return { imageCount, flags, facts };
}
