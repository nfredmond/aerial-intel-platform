import { describe, expect, it } from "vitest";

import {
  buildRetryJobInputSummary,
  buildRetryJobOutputSummary,
  buildRetryOutputSeeds,
} from "./job-retries";

describe("job retry helpers", () => {
  it("clones input summary with retry lineage", () => {
    const summary = buildRetryJobInputSummary({
      inputSummary: {
        name: "Colgate baseline processing",
        source: "mission-detail-action",
      },
      engine: "odm",
      previousJobId: "job-123",
    });

    expect(summary.name).toBe("Colgate baseline processing retry");
    expect(summary.retryOfJobId).toBe("job-123");
    expect(summary.source).toBe("mission-detail-action");
  });

  it("resets output summary to an honest queued retry posture", () => {
    const summary = buildRetryJobOutputSummary({
      outputSummary: {
        eta: "18 min",
        notes: "Old run state",
        runLogPath: "proving-runs/job-123.log",
      },
      previousJobId: "job-123",
    });

    expect(summary.eta).toBe("Pending queue pickup");
    expect(summary.notes).toContain("job-123");
    expect(summary.latestCheckpoint).toBe("Retry queued");
    expect(Array.isArray(summary.stageChecklist)).toBe(true);
    expect(Array.isArray(summary.logTail)).toBe(true);
    expect(summary.runLogPath).toBe("proving-runs/job-123.log");
  });

  it("restages retry outputs with pending status, rewritten storage path, and reset handoff state", () => {
    const outputs = buildRetryOutputSeeds({
      orgId: "org-1",
      previousJobId: "job-123",
      nextJobId: "job-456",
      outputs: [
        {
          id: "output-1",
          kind: "orthomosaic",
          status: "ready",
          storage_bucket: "drone-ops",
          storage_path: "org/jobs/job-123/orthomosaic.tif",
          mission_id: "mission-1",
          dataset_id: "dataset-1",
          metadata: {
            name: "South slope orthomosaic",
            format: "COG",
            delivery: "Internal QA share",
            handoff: {
              reviewedAt: "2026-04-04T20:00:00.000Z",
              reviewedByEmail: "reviewer@example.com",
              sharedAt: "2026-04-04T20:05:00.000Z",
              sharedByEmail: "ops@example.com",
            },
          },
        },
      ],
    });

    expect(outputs).toHaveLength(1);
    expect(outputs[0]?.job_id).toBe("job-456");
    expect(outputs[0]?.status).toBe("pending");
    expect(outputs[0]?.storage_path).toBe("org/jobs/job-456/orthomosaic.tif");

    const metadata = outputs[0]?.metadata as Record<string, unknown>;
    const handoff = metadata.handoff as Record<string, unknown>;
    expect(handoff.reviewedAt).toBeNull();
    expect(handoff.sharedAt).toBeNull();
    expect(handoff.exportedAt).toBeNull();
    expect(handoff.stage).toBe("pending_review");
    expect(handoff.nextAction).toContain("Review artifact quality");
    expect(String(handoff.note)).toContain("Retry placeholder restaged");
    expect(metadata.delivery).toBe("Review pending");
  });
});
