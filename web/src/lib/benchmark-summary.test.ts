import { describe, expect, it } from "vitest";

import {
  getBenchmarkOutputForArtifact,
  getBenchmarkSummaryView,
} from "./benchmark-summary";

describe("benchmark-summary", () => {
  it("parses a benchmark summary payload embedded in job output summary", () => {
    const summary = getBenchmarkSummaryView({
      benchmarkSummary: {
        timestamp_utc: "2026-03-16T20:00:00Z",
        end_timestamp_utc: "2026-03-16T20:11:00Z",
        project_name: "downtown-benchmark",
        dataset_root: "/datasets/downtown",
        image_count: 684,
        duration_seconds: 660,
        odm_image: "opendronemap/odm:3.5.5",
        odm_args: "--project-path /datasets downtown-benchmark",
        docker_version: "Docker version 28.0.0",
        host: "BlackOpal",
        run_log: "benchmark/20260316T200000Z/run.log",
        status: "success",
        run_exit_code: 0,
        qa_gate: {
          required_outputs_present: true,
          minimum_pass: true,
          missing_required_outputs: [],
        },
        outputs: {
          orthophoto: {
            path: "/datasets/downtown/odm_orthophoto/odm_orthophoto.tif",
            exists: true,
            non_zero_size: true,
            size_bytes: 12345,
          },
          dem: {
            path: "/datasets/downtown/odm_dem/dsm.tif",
            exists: true,
            non_zero_size: true,
            size_bytes: 45678,
          },
          point_cloud: {
            path: "/datasets/downtown/odm_georeferencing/odm_georeferenced_model.laz",
            exists: true,
            non_zero_size: true,
            size_bytes: 78901,
          },
          mesh: {
            path: "/datasets/downtown/odm_texturing/odm_textured_model.obj",
            exists: false,
            non_zero_size: false,
            size_bytes: 0,
          },
        },
      },
    });

    expect(summary).not.toBeNull();
    expect(summary?.projectName).toBe("downtown-benchmark");
    expect(summary?.minimumPass).toBe(true);
    expect(summary?.outputs[0]?.key).toBe("orthophoto");
    expect(summary?.outputs[0]?.sizeBytes).toBe(12345);
  });

  it("maps artifact kinds back to benchmark outputs", () => {
    const summary = getBenchmarkSummaryView({
      timestamp_utc: "2026-03-16T20:00:00Z",
      project_name: "downtown-benchmark",
      outputs: {
        orthophoto: {
          path: "/tmp/ortho.tif",
          exists: true,
          non_zero_size: true,
          size_bytes: 1,
        },
        dem: {
          path: "/tmp/dsm.tif",
          exists: true,
          non_zero_size: true,
          size_bytes: 2,
        },
        point_cloud: {
          path: "/tmp/cloud.laz",
          exists: true,
          non_zero_size: true,
          size_bytes: 3,
        },
        mesh: {
          path: "/tmp/mesh.obj",
          exists: false,
          non_zero_size: false,
          size_bytes: 0,
        },
      },
      qa_gate: {
        required_outputs_present: true,
        minimum_pass: true,
        missing_required_outputs: [],
      },
    });

    expect(getBenchmarkOutputForArtifact(summary, "orthomosaic")?.key).toBe("orthophoto");
    expect(getBenchmarkOutputForArtifact(summary, "dsm")?.key).toBe("dem");
    expect(getBenchmarkOutputForArtifact(summary, "point_cloud")?.key).toBe("point_cloud");
    expect(getBenchmarkOutputForArtifact(summary, "report")).toBeNull();
  });
});
