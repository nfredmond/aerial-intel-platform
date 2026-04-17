import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { NodeOdmDispatchLaunchResult } from "./dispatch-adapter-nodeodm";

const { insertJobEventMock, updateProcessingJobMock } = vi.hoisted(() => ({
  insertJobEventMock: vi.fn(),
  updateProcessingJobMock: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  adminSelect: vi.fn(),
  adminRestRequest: vi.fn(),
  insertJobEvent: insertJobEventMock,
  updateProcessingJob: updateProcessingJobMock,
}));

import { recordManagedNodeOdmLaunchOutcome } from "./managed-processing";

type DetailOverrides = {
  status?: string;
  stage?: string;
  presetId?: string | null;
  source?: string;
  outputSummary?: Record<string, unknown>;
};

function createDetail(overrides: DetailOverrides = {}) {
  return {
    job: {
      id: "job-1",
      org_id: "org-1",
      project_id: "project-1",
      site_id: "site-1",
      mission_id: "mission-1",
      dataset_id: "dataset-1",
      engine: "odm",
      preset_id: overrides.presetId ?? "managed-processing-v1",
      status: overrides.status ?? "running",
      stage: overrides.stage ?? "intake_review",
      progress: 10,
      queue_position: null,
      input_summary: {
        source: overrides.source ?? "mission-detail-managed-request",
      },
      output_summary: overrides.outputSummary ?? {},
      external_job_reference: null,
      created_by: null,
      created_at: "2026-04-16T18:00:00.000Z",
      updated_at: "2026-04-16T18:00:00.000Z",
      started_at: "2026-04-16T18:00:00.000Z",
      completed_at: null,
    },
    mission: null,
    project: null,
    site: null,
    dataset: null,
    outputs: [],
    events: [],
    inputSummary: { source: overrides.source ?? "mission-detail-managed-request" },
    outputSummary: overrides.outputSummary ?? {},
  } as unknown as Parameters<typeof recordManagedNodeOdmLaunchOutcome>[0]["detail"];
}

const acceptedLaunch: NodeOdmDispatchLaunchResult = {
  ok: true,
  taskUuid: "abcdef01-2345-6789-abcd-ef0123456789",
  adapterLabel: "NodeODM direct (aerial-dispatch-adapter.nodeodm.v1)",
  presetId: "balanced",
  acceptedAt: "2026-04-16T22:00:00.000Z",
};

const networkFailureLaunch: NodeOdmDispatchLaunchResult = {
  ok: false,
  kind: "network",
  message: "NodeODM createTask: fetch failed",
};

const unconfiguredLaunch: NodeOdmDispatchLaunchResult = {
  ok: false,
  kind: "unconfigured",
  message: "NodeODM adapter is not configured. Set AERIAL_NODEODM_URL to enable direct NodeODM dispatch.",
};

describe("recordManagedNodeOdmLaunchOutcome", () => {
  beforeEach(() => {
    insertJobEventMock.mockReset();
    updateProcessingJobMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns not-managed when the job is not a managed-processing request", async () => {
    const detail = createDetail({ presetId: "v1-proving-run", source: "mission-proving-seed" });

    const result = await recordManagedNodeOdmLaunchOutcome({
      orgId: "org-1",
      detail,
      source: "job-detail",
      launch: acceptedLaunch,
    });

    expect(result).toBe("not-managed");
    expect(updateProcessingJobMock).not.toHaveBeenCalled();
    expect(insertJobEventMock).not.toHaveBeenCalled();
  });

  it("returns noop when the job is not in running/intake_review state", async () => {
    const detail = createDetail({ status: "running", stage: "processing" });

    const result = await recordManagedNodeOdmLaunchOutcome({
      orgId: "org-1",
      detail,
      source: "job-detail",
      launch: acceptedLaunch,
    });

    expect(result).toBe("noop");
    expect(updateProcessingJobMock).not.toHaveBeenCalled();
    expect(insertJobEventMock).not.toHaveBeenCalled();
  });

  it("records an accepted launch with taskUuid in output_summary.nodeodm and emits nodeodm.task.launched", async () => {
    const detail = createDetail();

    const result = await recordManagedNodeOdmLaunchOutcome({
      orgId: "org-1",
      detail,
      source: "job-detail",
      launch: acceptedLaunch,
    });

    expect(result).toBe("nodeodm-launch-recorded");
    expect(updateProcessingJobMock).toHaveBeenCalledTimes(1);

    const [jobId, patch] = updateProcessingJobMock.mock.calls[0];
    expect(jobId).toBe("job-1");
    expect(patch.output_summary.nodeodm).toEqual({
      taskUuid: acceptedLaunch.taskUuid,
      presetId: "balanced",
      adapterLabel: acceptedLaunch.adapterLabel,
      acceptedAt: acceptedLaunch.acceptedAt,
      lastPolledAt: null,
      statusCode: 10,
      statusName: "queued",
      progress: 0,
      uploadState: "pending",
      launchNotes: null,
    });
    expect(patch.output_summary.latestCheckpoint).toContain("abcdef01");
    expect(patch.output_summary.latestCheckpoint).toContain("awaiting upload");
    expect(patch.output_summary.stageChecklist).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Host dispatch", status: "pending" }),
      ]),
    );

    expect(insertJobEventMock).toHaveBeenCalledTimes(1);
    expect(insertJobEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        org_id: "org-1",
        job_id: "job-1",
        event_type: "nodeodm.task.launched",
        payload: expect.objectContaining({
          taskUuid: acceptedLaunch.taskUuid,
          presetId: "balanced",
        }),
      }),
    );
  });

  it("records a launch note as a second event when provided on an accepted launch", async () => {
    const detail = createDetail();

    await recordManagedNodeOdmLaunchOutcome({
      orgId: "org-1",
      detail,
      source: "job-detail",
      launch: acceptedLaunch,
      launchNotes: "First stub-mode dry run",
    });

    expect(insertJobEventMock).toHaveBeenCalledTimes(2);
    expect(insertJobEventMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ event_type: "nodeodm.task.launch_note" }),
    );

    const [, patch] = updateProcessingJobMock.mock.calls[0];
    expect(patch.output_summary.nodeodm.launchNotes).toBe("First stub-mode dry run");
  });

  it("records a non-unconfigured failure with kind + message, no taskUuid written", async () => {
    const detail = createDetail();

    const result = await recordManagedNodeOdmLaunchOutcome({
      orgId: "org-1",
      detail,
      source: "job-detail",
      launch: networkFailureLaunch,
    });

    expect(result).toBe("nodeodm-launch-failed");
    expect(updateProcessingJobMock).toHaveBeenCalledTimes(1);

    const [, patch] = updateProcessingJobMock.mock.calls[0];
    expect(patch.output_summary.nodeodm.taskUuid).toBeUndefined();
    expect(patch.output_summary.nodeodm.lastLaunchError).toBe("NodeODM createTask: fetch failed");
    expect(patch.output_summary.nodeodm.lastLaunchKind).toBe("network");
    expect(patch.output_summary.nodeodm.lastLaunchAttemptAt).toEqual(expect.any(String));

    expect(insertJobEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: "nodeodm.task.launch_failed",
        payload: expect.objectContaining({ kind: "network" }),
      }),
    );
  });

  it("treats unconfigured as an event-only record without touching output_summary", async () => {
    const detail = createDetail();

    const result = await recordManagedNodeOdmLaunchOutcome({
      orgId: "org-1",
      detail,
      source: "job-detail",
      launch: unconfiguredLaunch,
    });

    expect(result).toBe("nodeodm-launch-unconfigured");
    expect(updateProcessingJobMock).not.toHaveBeenCalled();
    expect(insertJobEventMock).toHaveBeenCalledTimes(1);
    expect(insertJobEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ event_type: "nodeodm.task.launch_unconfigured" }),
    );
  });

  it("preserves existing output_summary.nodeodm fields when recording a failed launch", async () => {
    const detail = createDetail({
      outputSummary: { nodeodm: { taskUuid: "prior-task", presetId: "balanced" } },
    });

    await recordManagedNodeOdmLaunchOutcome({
      orgId: "org-1",
      detail,
      source: "job-detail",
      launch: networkFailureLaunch,
    });

    const [, patch] = updateProcessingJobMock.mock.calls[0];
    expect(patch.output_summary.nodeodm.taskUuid).toBe("prior-task");
    expect(patch.output_summary.nodeodm.lastLaunchError).toBe("NodeODM createTask: fetch failed");
    expect(patch.output_summary.nodeodm.lastLaunchKind).toBe("network");
  });
});
