import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  DISPATCH_CALLBACK_CONTRACT_VERSION,
  applyDispatchCallback,
  isDispatchCallbackAuthorized,
  parseDispatchCallbackPayload,
} from "./dispatch-callback";

const { adminSelectMock, insertJobEventMock, updateProcessingJobMock } = vi.hoisted(() => ({
  adminSelectMock: vi.fn(),
  insertJobEventMock: vi.fn(),
  updateProcessingJobMock: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  adminSelect: adminSelectMock,
  insertJobEvent: insertJobEventMock,
  updateProcessingJob: updateProcessingJobMock,
}));

describe("dispatch-callback", () => {
  beforeEach(() => {
    adminSelectMock.mockReset();
    insertJobEventMock.mockReset();
    updateProcessingJobMock.mockReset();
    delete process.env.AERIAL_DISPATCH_CALLBACK_TOKEN;
    delete process.env.AERIAL_DISPATCH_ADAPTER_TOKEN;
  });

  it("authorizes against the dedicated callback token or adapter token fallback", () => {
    process.env.AERIAL_DISPATCH_CALLBACK_TOKEN = "callback-secret";
    expect(isDispatchCallbackAuthorized("Bearer callback-secret")).toBe(true);
    expect(isDispatchCallbackAuthorized("Bearer wrong")).toBe(false);

    delete process.env.AERIAL_DISPATCH_CALLBACK_TOKEN;
    process.env.AERIAL_DISPATCH_ADAPTER_TOKEN = "adapter-secret";
    expect(isDispatchCallbackAuthorized("Bearer adapter-secret")).toBe(true);
  });

  it("parses the callback payload contract", () => {
    const payload = parseDispatchCallbackPayload({
      contractVersion: DISPATCH_CALLBACK_CONTRACT_VERSION,
      callbackId: "cb-1",
      requestId: "dispatch-job-1-odm-host-01-default",
      callbackAt: "2026-04-06T18:30:00.000Z",
      orgId: "org-1",
      job: { id: "job-1" },
      status: "running",
      progress: 61.8,
      workerStage: "nodeodm:orthophoto",
      message: "Orthophoto generation in progress",
      dispatch: { hostLabel: "odm-host-01", workerLabel: "worker-a" },
      metrics: { queuePosition: 1, startedAt: "2026-04-06T18:00:00.000Z" },
    });

    expect(payload.status).toBe("running");
    expect(payload.progress).toBe(62);
    expect(payload.dispatch?.hostLabel).toBe("odm-host-01");
    expect(payload.metrics?.queuePosition).toBe(1);
  });

  it("records a running callback without pretending outputs are done", async () => {
    adminSelectMock.mockResolvedValue([{
      id: "job-1",
      org_id: "org-1",
      status: "running",
      stage: "processing",
      progress: 45,
      preset_id: "managed-processing-v1",
      input_summary: { source: "mission-detail-managed-request" },
      output_summary: {
        dispatchAdapter: {
          mode: "webhook",
          adapterLabel: "NodeODM dispatch webhook",
          endpoint: "https://dispatch.example.com/launch",
          requestId: "dispatch-job-1-odm-host-01-default",
          status: "accepted",
          externalRunReference: "run-42",
        },
      },
      external_job_reference: "run-42",
      started_at: "2026-04-06T18:00:00.000Z",
      completed_at: null,
    }]);

    const result = await applyDispatchCallback({
      contractVersion: DISPATCH_CALLBACK_CONTRACT_VERSION,
      callbackId: "cb-2",
      requestId: "dispatch-job-1-odm-host-01-default",
      callbackAt: "2026-04-06T18:30:00.000Z",
      orgId: "org-1",
      job: { id: "job-1" },
      externalRunReference: "run-42",
      status: "running",
      progress: 68,
      workerStage: "nodeodm:orthophoto",
      message: "Orthophoto generation in progress",
      dispatch: { hostLabel: "odm-host-01", workerLabel: "worker-a" },
      metrics: { queuePosition: 1, startedAt: "2026-04-06T18:00:00.000Z" },
    });

    expect(result.action).toBe("updated");
    expect(updateProcessingJobMock).toHaveBeenCalledWith("job-1", expect.objectContaining({
      status: "running",
      stage: "processing",
      progress: 68,
      external_job_reference: "run-42",
      output_summary: expect.objectContaining({
        eta: "Worker processing in progress",
        dispatchAdapter: expect.objectContaining({
          callbackStatus: "running",
          workerStage: "nodeodm:orthophoto",
          reportedProgress: 68,
        }),
      }),
    }));
    expect(insertJobEventMock).toHaveBeenCalledWith(expect.objectContaining({
      event_type: "job.dispatch.callback.running",
    }));
  });

  it("records worker completion as awaiting output import instead of delivery-ready", async () => {
    adminSelectMock.mockResolvedValue([{
      id: "job-1",
      org_id: "org-1",
      status: "running",
      stage: "processing",
      progress: 68,
      preset_id: "managed-processing-v1",
      input_summary: { source: "mission-detail-managed-request" },
      output_summary: {
        dispatchAdapter: {
          mode: "webhook",
          requestId: "dispatch-job-1-odm-host-01-default",
          status: "accepted",
          externalRunReference: "run-42",
        },
      },
      external_job_reference: "run-42",
      started_at: "2026-04-06T18:00:00.000Z",
      completed_at: null,
    }]);

    await applyDispatchCallback({
      contractVersion: DISPATCH_CALLBACK_CONTRACT_VERSION,
      callbackId: "cb-3",
      requestId: "dispatch-job-1-odm-host-01-default",
      callbackAt: "2026-04-06T19:00:00.000Z",
      orgId: "org-1",
      job: { id: "job-1" },
      externalRunReference: "run-42",
      status: "awaiting_output_import",
      progress: 90,
      message: "Compute finished; artifacts uploaded to worker volume.",
      metrics: { finishedAt: "2026-04-06T18:59:00.000Z" },
    });

    expect(updateProcessingJobMock).toHaveBeenCalledWith("job-1", expect.objectContaining({
      status: "running",
      stage: "processing",
      progress: 90,
      output_summary: expect.objectContaining({
        eta: "Awaiting output import",
        deliveryPosture: "Compute may be complete, but outputs still need to be imported before QA or delivery can close.",
      }),
    }));

    const patch = updateProcessingJobMock.mock.calls[0][1];
    expect(patch.output_summary.logTail).toContain("Do not start QA or claim delivery until real outputs are attached/imported.");
  });

  it("treats duplicate callback ids as a noop", async () => {
    adminSelectMock.mockResolvedValue([{
      id: "job-1",
      org_id: "org-1",
      status: "running",
      stage: "processing",
      progress: 68,
      preset_id: "managed-processing-v1",
      input_summary: { source: "mission-detail-managed-request" },
      output_summary: {
        dispatchAdapter: {
          requestId: "dispatch-job-1-odm-host-01-default",
          callbackId: "cb-3",
          callbackStatus: "running",
        },
      },
      external_job_reference: "run-42",
      started_at: "2026-04-06T18:00:00.000Z",
      completed_at: null,
    }]);

    const result = await applyDispatchCallback({
      contractVersion: DISPATCH_CALLBACK_CONTRACT_VERSION,
      callbackId: "cb-3",
      requestId: "dispatch-job-1-odm-host-01-default",
      callbackAt: "2026-04-06T19:00:00.000Z",
      orgId: "org-1",
      job: { id: "job-1" },
      status: "running",
    });

    expect(result.action).toBe("noop");
    expect(updateProcessingJobMock).not.toHaveBeenCalled();
    expect(insertJobEventMock).not.toHaveBeenCalled();
  });
});
