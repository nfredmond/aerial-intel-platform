import { describe, expect, it } from "vitest";

import { formatFileSize, summarizeV1IngestSession } from "./v1-ingest";

describe("summarizeV1IngestSession", () => {
  it("marks a session truthful-ready only when the full evidence contract is present", () => {
    const summary = summarizeV1IngestSession({
      status: "review_bundle_ready",
      sourceType: "local_zip",
      sourceFilename: "gv-downtown.zip",
      sourceZipPath: "/data/uploads/gv-downtown.zip",
      extractedDatasetPath: "/data/v1_slice_gv/dataset",
      benchmarkSummaryPath: "/benchmark/20260405_gv/summary.json",
      runLogPath: "/benchmark/20260405_gv/run.log",
      reviewBundleZipPath: "/data/v1_slice_gv/export_bundle_gv.zip",
      imageCount: 214,
      fileSizeBytes: 734003200,
      reviewBundleReady: true,
      truthfulPass: true,
    });

    expect(summary.contractCleared).toBe(true);
    expect(summary.stageLabel).toBe("Truthful v1 ready");
    expect(summary.blockers).toEqual([]);
  });

  it("surfaces exact blockers when the evidence chain is incomplete", () => {
    const summary = summarizeV1IngestSession({
      status: "recorded",
      sourceType: "browser_zip",
      sourceFilename: null,
      sourceZipPath: null,
      extractedDatasetPath: null,
      benchmarkSummaryPath: null,
      runLogPath: null,
      reviewBundleZipPath: null,
      imageCount: null,
      fileSizeBytes: null,
      reviewBundleReady: false,
      truthfulPass: null,
    });

    expect(summary.contractCleared).toBe(false);
    expect(summary.stageLabel).toBe("Intake recorded");
    expect(summary.blockers).toContain("Source ZIP evidence is not recorded yet.");
    expect(summary.blockers).toContain("Review bundle is not marked ready for operator download yet.");
    expect(summary.blockers).toContain("Truthful v1 pass/fail has not been recorded yet.");
  });

  it("keeps failed runs honest even when a bundle path exists", () => {
    const summary = summarizeV1IngestSession({
      status: "review_bundle_ready",
      sourceType: "local_zip",
      sourceFilename: "gv-downtown.zip",
      sourceZipPath: "/data/uploads/gv-downtown.zip",
      extractedDatasetPath: "/data/v1_slice_gv/dataset",
      benchmarkSummaryPath: "/benchmark/20260405_gv/summary.json",
      runLogPath: "/benchmark/20260405_gv/run.log",
      reviewBundleZipPath: "/data/v1_slice_gv/export_bundle_gv.zip",
      imageCount: 214,
      fileSizeBytes: 734003200,
      reviewBundleReady: true,
      truthfulPass: false,
    });

    expect(summary.contractCleared).toBe(false);
    expect(summary.stageLabel).toBe("Bundle ready for review");
    expect(summary.blockers).toContain("Latest recorded run did not clear the truthful v1 pass bar.");
  });
});

describe("formatFileSize", () => {
  it("formats bytes into human-readable units", () => {
    expect(formatFileSize(1536)).toBe("1.50 KB");
    expect(formatFileSize(734003200)).toBe("700 MB");
    expect(formatFileSize(null)).toBe("Not recorded");
  });
});
