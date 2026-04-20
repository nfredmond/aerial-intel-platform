import { describe, expect, it } from "vitest";

import type { DatasetDetail } from "@/lib/missions/detail-data";

import { buildDataScoutInputs } from "./data-scout-facts";

type PerImageEntry = {
  basename: string;
  has_gps?: boolean;
  has_timestamp?: boolean;
  has_exif?: boolean;
  blur_variance?: number;
};

function stubDetail(
  perImage: PerImageEntry[],
  opts: { imageCount?: number; name?: string; capturedAt?: string | null } = {},
): DatasetDetail {
  const now = "2026-04-15T00:00:00Z";
  const dataset = {
    id: "d-1",
    org_id: "org-1",
    project_id: "p-1",
    site_id: "s-1",
    mission_id: "m-1",
    name: opts.name ?? "Toledo-20 RGB",
    slug: "toledo-20-rgb",
    kind: "images",
    status: "ready",
    captured_at: opts.capturedAt === undefined ? "2026-04-15" : opts.capturedAt,
    spatial_footprint: null,
    metadata: {
      image_count: opts.imageCount ?? perImage.length,
      per_image_summary: perImage,
    },
    created_by: null,
    created_at: now,
    updated_at: now,
    archived_at: null,
  } as unknown as DatasetDetail["dataset"];
  return {
    dataset,
    mission: null,
    project: null,
    site: null,
    jobs: [],
    outputs: [],
    events: [],
    metadata: {},
  };
}

describe("buildDataScoutInputs", () => {
  it("produces no flags on a fully clean dataset", () => {
    const detail = stubDetail([
      { basename: "DJI_0001.JPG", has_gps: true, has_timestamp: true, has_exif: true, blur_variance: 450 },
      { basename: "DJI_0002.JPG", has_gps: true, has_timestamp: true, has_exif: true, blur_variance: 300 },
    ]);
    const result = buildDataScoutInputs(detail);
    expect(result.flags).toEqual([]);
    expect(result.imageCount).toBe(2);
    expect(result.facts.some((f) => f.id === "dataset:d-1:name")).toBe(true);
    // No scout:* aggregation facts should appear when nothing is flagged.
    expect(result.facts.some((f) => f.id.startsWith("scout:") && f.id.endsWith(":missing_gps"))).toBe(false);
  });

  it("flags missing-gps, missing-exif, missing-timestamp and surfaces matching scout facts", () => {
    const detail = stubDetail([
      { basename: "A.JPG", has_gps: false, has_timestamp: true, has_exif: true, blur_variance: 200 },
      { basename: "B.JPG", has_gps: true, has_timestamp: false, has_exif: false, blur_variance: 200 },
      { basename: "C.JPG", has_gps: true, has_timestamp: true, has_exif: true, blur_variance: 200 },
    ]);
    const result = buildDataScoutInputs(detail);

    const kinds = result.flags.map((f) => f.kind).sort();
    expect(kinds).toEqual(["missing-exif", "missing-gps", "missing-timestamp"]);

    const factIds = result.facts.map((f) => f.id);
    expect(factIds).toContain("scout:d-1:missing_gps");
    expect(factIds).toContain("scout:d-1:missing_exif");
    expect(factIds).toContain("scout:d-1:missing_timestamp");
  });

  it("flags low-variance images below the 80 threshold and preserves the measured value", () => {
    const detail = stubDetail([
      { basename: "Sharp.JPG", has_gps: true, has_timestamp: true, has_exif: true, blur_variance: 250 },
      { basename: "Blurry.JPG", has_gps: true, has_timestamp: true, has_exif: true, blur_variance: 42.5 },
      { basename: "OnThreshold.JPG", has_gps: true, has_timestamp: true, has_exif: true, blur_variance: 80 },
    ]);
    const result = buildDataScoutInputs(detail);
    const blurFlags = result.flags.filter((f) => f.kind === "low-variance");
    expect(blurFlags).toHaveLength(1);
    expect(blurFlags[0].basename).toBe("Blurry.JPG");
    expect(blurFlags[0].detail).toContain("42.5");
    expect(blurFlags[0].detail).toContain("80");
  });

  it("flags duplicate basenames and counts them once per basename", () => {
    const detail = stubDetail([
      { basename: "DUP.JPG", has_gps: true, has_timestamp: true, has_exif: true, blur_variance: 300 },
      { basename: "DUP.JPG", has_gps: true, has_timestamp: true, has_exif: true, blur_variance: 300 },
      { basename: "UNIQUE.JPG", has_gps: true, has_timestamp: true, has_exif: true, blur_variance: 300 },
    ]);
    const result = buildDataScoutInputs(detail);
    const dupFlags = result.flags.filter((f) => f.kind === "duplicate-basename");
    expect(dupFlags).toHaveLength(1);
    expect(dupFlags[0].basename).toBe("DUP.JPG");
    expect(dupFlags[0].detail).toContain("2 times");
  });

  it("treats unknown fields as unknown (no flag) and only explicit negatives trigger flags", () => {
    const detail = stubDetail([
      // No has_gps / has_exif / has_timestamp / blur_variance — all unknown.
      { basename: "Unknown.JPG" },
    ]);
    const result = buildDataScoutInputs(detail);
    expect(result.flags).toEqual([]);
    expect(result.imageCount).toBe(1);
  });

  it("falls back to perImage length when declared image_count is missing", () => {
    const detail = stubDetail(
      [
        { basename: "A.JPG", has_gps: true, has_timestamp: true, has_exif: true, blur_variance: 300 },
        { basename: "B.JPG", has_gps: true, has_timestamp: true, has_exif: true, blur_variance: 300 },
      ],
      { imageCount: 0 },
    );
    // imageCount 0 in metadata but two per_image rows — scout should report 2.
    expect(detail.dataset.metadata).toBeTruthy();
    const result = buildDataScoutInputs(detail);
    expect(result.imageCount).toBe(2);
  });
});
