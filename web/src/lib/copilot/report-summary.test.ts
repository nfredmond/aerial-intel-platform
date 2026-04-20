import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const generateTextMock = vi.hoisted(() => vi.fn());

vi.mock("ai", () => ({ generateText: generateTextMock }));

import type { ArtifactDetail } from "@/lib/missions/detail-data";

import {
  generateReportSummary,
  REPORT_SUMMARY_MAX_OUTPUT_TOKENS,
} from "./report-summary";
import { buildReportSummaryFacts } from "./report-summary-facts";

function createArtifactDetail(): ArtifactDetail {
  return {
    output: {
      id: "artifact-1",
      org_id: "org-1",
      job_id: "job-1",
      mission_id: "mission-1",
      dataset_id: "dataset-1",
      kind: "orthomosaic",
      status: "ready",
      storage_bucket: "drone-ops",
      storage_path: "org/jobs/job-1/outputs/orthomosaic/odm_orthophoto.cog.tif",
      metadata: {
        name: "Downtown orthomosaic",
        format: "COG GeoTIFF",
        delivery: "Planning review raster",
        handoff: {
          reviewedAt: "2026-04-20T01:00:00.000Z",
          reviewedByEmail: "reviewer@example.com",
          note: "Coverage looks acceptable for planning review.",
        },
      },
      created_at: "2026-04-20T00:00:00.000Z",
      updated_at: "2026-04-20T01:00:00.000Z",
    },
    job: {
      id: "job-1",
      org_id: "org-1",
      project_id: "project-1",
      site_id: "site-1",
      mission_id: "mission-1",
      dataset_id: "dataset-1",
      engine: "nodeodm",
      preset_id: "balanced",
      status: "succeeded",
      stage: "qa_review",
      progress: 100,
      queue_position: null,
      input_summary: {},
      output_summary: {
        latestCheckpoint: "ODM output imported and copied to protected storage.",
        benchmarkSummary: {
          project_name: "Downtown corridor",
          image_count: 20,
          duration_seconds: 410,
          status: "succeeded",
          run_exit_code: 0,
          qa_gate: {
            minimum_pass: true,
            required_outputs_present: true,
            missing_required_outputs: [],
          },
          outputs: {
            orthophoto: {
              path: "odm_orthophoto.cog.tif",
              exists: true,
              non_zero_size: true,
              size_bytes: 7800000,
            },
          },
        },
      },
      external_job_reference: "nodeodm-task-1",
      created_by: "user-1",
      created_at: "2026-04-20T00:00:00.000Z",
      updated_at: "2026-04-20T01:00:00.000Z",
      started_at: "2026-04-20T00:10:00.000Z",
      completed_at: "2026-04-20T00:50:00.000Z",
    },
    mission: {
      id: "mission-1",
      org_id: "org-1",
      project_id: "project-1",
      site_id: "site-1",
      name: "Downtown corridor baseline",
      slug: "downtown-corridor",
      mission_type: "orthomosaic",
      status: "active",
      objective: "Support planning review for downtown corridor improvements.",
      planning_geometry: null,
      summary: {},
      created_by: "user-1",
      created_at: "2026-04-20T00:00:00.000Z",
      updated_at: "2026-04-20T00:00:00.000Z",
      archived_at: null,
    },
    project: {
      id: "project-1",
      org_id: "org-1",
      name: "Downtown corridor",
      slug: "downtown-corridor",
      status: "active",
      description: "Planning corridor review.",
      created_by: "user-1",
      created_at: "2026-04-20T00:00:00.000Z",
      updated_at: "2026-04-20T00:00:00.000Z",
      archived_at: null,
    },
    site: null,
    dataset: {
      id: "dataset-1",
      org_id: "org-1",
      project_id: "project-1",
      site_id: "site-1",
      mission_id: "mission-1",
      name: "Downtown imagery batch",
      slug: "downtown-imagery",
      kind: "rgb",
      status: "ready",
      captured_at: "2026-04-19T12:00:00.000Z",
      spatial_footprint: null,
      metadata: {},
      created_by: "user-1",
      created_at: "2026-04-20T00:00:00.000Z",
      updated_at: "2026-04-20T00:00:00.000Z",
      archived_at: null,
    },
    events: [
      {
        id: "event-1",
        org_id: "org-1",
        job_id: "job-1",
        event_type: "artifact.reviewed",
        payload: { title: "Artifact reviewed" },
        created_at: "2026-04-20T01:00:00.000Z",
      },
    ],
    metadata: {
      name: "Downtown orthomosaic",
      format: "COG GeoTIFF",
      delivery: "Planning review raster",
      handoff: {
        reviewedAt: "2026-04-20T01:00:00.000Z",
        reviewedByEmail: "reviewer@example.com",
        note: "Coverage looks acceptable for planning review.",
      },
    },
    inputSummary: {},
    outputSummary: {
      latestCheckpoint: "ODM output imported and copied to protected storage.",
      benchmarkSummary: {
        project_name: "Downtown corridor",
        image_count: 20,
        duration_seconds: 410,
        status: "succeeded",
        run_exit_code: 0,
        qa_gate: {
          minimum_pass: true,
          required_outputs_present: true,
          missing_required_outputs: [],
        },
        outputs: {
          orthophoto: {
            path: "odm_orthophoto.cog.tif",
            exists: true,
            non_zero_size: true,
            size_bytes: 7800000,
          },
        },
      },
    },
  } as ArtifactDetail;
}

describe("buildReportSummaryFacts", () => {
  it("builds citable artifact, storage, benchmark, and review facts", () => {
    const facts = buildReportSummaryFacts({
      detail: createArtifactDetail(),
      comments: [],
      approvals: [
        {
          id: "approval-1",
          org_id: "org-1",
          artifact_id: "artifact-1",
          reviewer_user_id: "user-1",
          reviewer_email: "reviewer@example.com",
          decision: "approved",
          note: "Ready for export.",
          decided_at: "2026-04-20T01:00:00.000Z",
          created_at: "2026-04-20T01:00:00.000Z",
          updated_at: "2026-04-20T01:00:00.000Z",
        },
      ],
    });

    expect(facts.map((fact) => fact.id)).toContain("artifact:artifact-1:storage");
    expect(facts.map((fact) => fact.id)).toContain("benchmark:artifact-1:qa");
    expect(facts.map((fact) => fact.id)).toContain("review:artifact-1:approvals");
  });
});

describe("generateReportSummary", () => {
  const facts = buildReportSummaryFacts({ detail: createArtifactDetail(), comments: [], approvals: [] });

  beforeEach(() => {
    generateTextMock.mockReset();
  });

  afterEach(() => {
    generateTextMock.mockReset();
  });

  it("returns status=ok when every sentence cites known facts", async () => {
    generateTextMock.mockResolvedValueOnce({
      text: [
        "Downtown orthomosaic is a ready COG GeoTIFF for the Downtown corridor baseline mission. [fact:artifact:artifact-1:name] [fact:artifact:artifact-1:status]",
        "The file is attached in protected storage at the drone-ops bucket path. [fact:artifact:artifact-1:storage]",
        "Benchmark evidence shows the minimum QA gate passed for the run. [fact:benchmark:artifact-1:qa]",
        "The next action is to share the reviewed artifact summary with the field or client handoff lane. [fact:artifact:artifact-1:next_action]",
      ].join(" "),
      usage: { inputTokens: 900, outputTokens: 160 },
    });

    const result = await generateReportSummary({
      orgId: "org-1",
      artifactName: "Downtown orthomosaic",
      facts,
    });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.summary).toContain("[fact:artifact:artifact-1:storage]");
    expect(result.modelId).toBe("anthropic/claude-haiku-4.5");
    expect(generateTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        maxOutputTokens: REPORT_SUMMARY_MAX_OUTPUT_TOKENS,
        timeout: { totalMs: 45_000 },
      }),
    );
  });

  it("refuses when too many sentences cite unknown facts", async () => {
    generateTextMock.mockResolvedValueOnce({
      text: [
        "The artifact is final and legally certified. [fact:artifact:fake:certified]",
        "The file is attached in protected storage. [fact:artifact:artifact-1:storage]",
      ].join(" "),
      usage: { inputTokens: 400, outputTokens: 80 },
    });

    const result = await generateReportSummary({
      orgId: "org-1",
      artifactName: "Downtown orthomosaic",
      facts,
    });

    expect(result.status).toBe("refused");
    if (result.status !== "refused") return;
    expect(result.reason).toBe("too-many-dropped");
  });
});
