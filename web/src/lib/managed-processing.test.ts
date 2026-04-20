import { describe, expect, it } from "vitest";

import type { getJobDetail } from "@/lib/missions/detail-data";

import {
  buildManagedProcessingRequestSummary,
  getManagedDispatchAdapterState,
  getManagedDispatchHandoff,
  getManagedProcessingNextStep,
  isManagedProcessingJobRecord,
} from "./managed-processing";

type JobDetailResult = NonNullable<Awaited<ReturnType<typeof getJobDetail>>>;

function createDetail(input: {
  status: string;
  stage: string;
  presetId?: string | null;
  source?: string;
  outputs?: Array<{ status: string }>;
}): JobDetailResult {
  return {
    job: {
      id: "job-1",
      org_id: "org-1",
      project_id: "project-1",
      site_id: "site-1",
      mission_id: "mission-1",
      dataset_id: "dataset-1",
      engine: "odm",
      preset_id: input.presetId ?? "managed-processing-v1",
      status: input.status,
      stage: input.stage,
      progress: 0,
      queue_position: 1,
      input_summary: {
        source: input.source ?? "mission-detail-managed-request",
      },
      output_summary: {},
      external_job_reference: null,
      created_by: null,
      created_at: "2026-04-06T17:00:00.000Z",
      updated_at: "2026-04-06T17:00:00.000Z",
      started_at: null,
      completed_at: null,
    },
    mission: null,
    project: null,
    site: null,
    dataset: null,
    outputs: (input.outputs ?? []).map((output, index) => ({
      id: `out-${index}`,
      org_id: "org-1",
      job_id: "job-1",
      mission_id: "mission-1",
      dataset_id: "dataset-1",
      kind: "orthomosaic",
      status: output.status,
      storage_bucket: "drone-ops",
      storage_path: `org-1/jobs/job-1/output-${index}.tif`,
      metadata: {},
      created_at: "2026-04-06T17:00:00.000Z",
      updated_at: "2026-04-06T17:00:00.000Z",
    })),
    events: [],
    inputSummary: {},
    outputSummary: {},
  } as unknown as JobDetailResult;
}

describe("managed-processing", () => {
  it("recognizes managed-processing requests from preset or source", () => {
    expect(isManagedProcessingJobRecord({ preset_id: "managed-processing-v1", input_summary: {} })).toBe(true);
    expect(isManagedProcessingJobRecord({ preset_id: null, input_summary: { source: "mission-detail-managed-request" } })).toBe(true);
    expect(isManagedProcessingJobRecord({ preset_id: "v1-proving-run", input_summary: { source: "mission-proving-seed" } })).toBe(false);
  });

  it("builds an honest managed request summary", () => {
    const summary = buildManagedProcessingRequestSummary({
      missionName: "Grass Valley downtown curb inventory",
      datasetName: "Downtown block A",
      requestedByEmail: "ops@example.com",
    });

    expect(summary.workflowMode).toBe("managed_processing_v1");
    expect(summary.serviceModel).toBe("operator_assisted");
    expect(summary.notes).toContain("does not claim ODM extraction, host dispatch, or artifact generation has happened yet");
    expect(Array.isArray(summary.stageChecklist)).toBe(true);
  });

  it("surfaces the correct next step for a queued request", () => {
    const nextStep = getManagedProcessingNextStep(createDetail({ status: "queued", stage: "queued" }));
    expect(nextStep?.label).toBe("Start intake review");
    expect(nextStep?.disabled).toBe(false);
  });

  it("parses a recorded dispatch handoff from job summary metadata", () => {
    const dispatch = getManagedDispatchHandoff({
      dispatchHandoff: {
        hostLabel: "odm-host-01",
        workerLabel: "nodeodm-worker-a",
        externalRunReference: "run-42",
        dispatchNotes: "Single-host Docker lane",
        dispatchedAt: "2026-04-06T18:00:00.000Z",
        dispatchedByEmail: "ops@example.com",
        dispatchSource: "job detail",
      },
    });

    expect(dispatch.hostLabel).toBe("odm-host-01");
    expect(dispatch.workerLabel).toBe("nodeodm-worker-a");
    expect(dispatch.externalRunReference).toBe("run-42");
    expect(dispatch.dispatchNotes).toContain("Single-host Docker");
  });

  it("falls back to the job external reference when dispatch metadata is partial", () => {
    const dispatch = getManagedDispatchHandoff({}, "external-123");
    expect(dispatch.externalRunReference).toBe("external-123");
    expect(dispatch.hostLabel).toBeNull();
  });

  it("parses dispatch adapter state from job summary metadata", () => {
    const adapter = getManagedDispatchAdapterState({
      dispatchAdapter: {
        mode: "webhook",
        adapterLabel: "NodeODM webhook",
        endpoint: "https://dispatch.example.com/launch",
        requestId: "dispatch-job-1-odm-host-01-default",
        status: "accepted",
        responseStatus: 202,
        externalRunReference: "run-42",
        lastAttemptAt: "2026-04-06T18:00:00.000Z",
        callbackStatus: "running",
        callbackId: "cb-1",
        lastCallbackAt: "2026-04-06T18:05:00.000Z",
        workerStage: "nodeodm:orthophoto",
        lastMessage: "NodeODM is building orthophoto tiles.",
        reportedProgress: 62,
      },
    });

    expect(adapter.mode).toBe("webhook");
    expect(adapter.adapterLabel).toBe("NodeODM webhook");
    expect(adapter.responseStatus).toBe(202);
    expect(adapter.externalRunReference).toBe("run-42");
    expect(adapter.callbackStatus).toBe("running");
    expect(adapter.callbackId).toBe("cb-1");
    expect(adapter.workerStage).toBe("nodeodm:orthophoto");
    expect(adapter.reportedProgress).toBe(62);
  });

  it("blocks QA start until outputs are attached", () => {
    const nextStep = getManagedProcessingNextStep(createDetail({ status: "running", stage: "processing", outputs: [] }));
    expect(nextStep?.label).toBe("Start QA on imported outputs");
    expect(nextStep?.disabled).toBe(true);
  });

  it("asks for a real dispatch handoff record during intake review", () => {
    const nextStep = getManagedProcessingNextStep(createDetail({ status: "running", stage: "intake_review" }));
    expect(nextStep?.label).toBe("Record dispatch handoff");
    expect(nextStep?.helper).toContain("assigned host");
  });

  it("allows delivery completion only when a ready artifact exists", () => {
    const disabledNextStep = getManagedProcessingNextStep(createDetail({ status: "running", stage: "qa_review", outputs: [{ status: "pending" }] }));
    expect(disabledNextStep?.disabled).toBe(true);

    const enabledNextStep = getManagedProcessingNextStep(createDetail({ status: "running", stage: "qa_review", outputs: [{ status: "ready" }] }));
    expect(enabledNextStep?.disabled).toBe(false);
    expect(enabledNextStep?.label).toBe("Mark delivery-ready complete");
  });
});
