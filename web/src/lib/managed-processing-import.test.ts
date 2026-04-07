import { describe, expect, it } from "vitest";

import {
  buildManagedImportStoragePath,
  inferManagedImportFormat,
  mapBenchmarkOutputKeyToArtifactKind,
  parseManagedBenchmarkSummaryText,
} from "./managed-processing-import";

describe("managed-processing-import", () => {
  it("builds deterministic managed import storage paths", () => {
    const path = buildManagedImportStoragePath({
      orgSlug: "Acme Drone Co",
      jobId: "job-123",
      kind: "review_bundle",
      filename: "Downtown Bundle.ZIP",
      uploadedAt: "2026-04-06T18:12:55.000Z",
    });

    expect(path).toBe("acme-drone-co/managed-imports/job-123/review-bundle/20260406181255-downtown-bundle.zip");
  });

  it("parses a benchmark summary and preserves QA posture", () => {
    const summary = parseManagedBenchmarkSummaryText(JSON.stringify({
      timestamp_utc: "2026-04-06T18:00:00Z",
      end_timestamp_utc: "2026-04-06T18:10:00Z",
      project_name: "gv-downtown",
      dataset_root: "/data/gv-downtown",
      image_count: 420,
      duration_seconds: 600,
      odm_image: "opendronemap/odm:latest",
      odm_args: "--project-path /datasets gv-downtown",
      docker_version: "28.0.0",
      host: "blackopal",
      run_log: "benchmark/20260406/run.log",
      status: "success",
      run_exit_code: 0,
      qa_gate: {
        required_outputs_present: true,
        minimum_pass: true,
        missing_required_outputs: [],
      },
      outputs: {
        orthophoto: { path: "orthophoto.tif", exists: true, non_zero_size: true, size_bytes: 100 },
        dem: { path: "dem.tif", exists: true, non_zero_size: true, size_bytes: 90 },
        point_cloud: { path: "cloud.laz", exists: true, non_zero_size: true, size_bytes: 80 },
        mesh: { path: "mesh.obj", exists: false, non_zero_size: false, size_bytes: 0 },
      },
    }));

    expect(summary.minimumPass).toBe(true);
    expect(summary.outputs[0].key).toBe("orthophoto");
    expect(summary.outputs[2].path).toBe("cloud.laz");
  });

  it("rejects malformed benchmark summary text", () => {
    expect(() => parseManagedBenchmarkSummaryText("not-json")).toThrow("Benchmark summary JSON could not be parsed.");
    expect(() => parseManagedBenchmarkSummaryText(JSON.stringify({ hello: "world" }))).toThrow("Benchmark summary JSON is missing required benchmark fields.");
  });

  it("maps output keys and formats for imported artifacts", () => {
    expect(mapBenchmarkOutputKeyToArtifactKind("orthophoto")).toBe("orthomosaic");
    expect(mapBenchmarkOutputKeyToArtifactKind("mesh")).toBe("mesh");
    expect(mapBenchmarkOutputKeyToArtifactKind("weird")).toBeNull();
    expect(inferManagedImportFormat("point_cloud", "cloud.ply")).toBe("PLY");
    expect(inferManagedImportFormat("mesh", "model.obj")).toBe("OBJ");
  });
});
