// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { launchNodeOdmTask } from "@/lib/dispatch-adapter-nodeodm";
import { resetSharedStubNodeOdmClient } from "@/lib/nodeodm/stub";

import { GET } from "./route";

const {
  adminSelectMock,
  updateProcessingJobMock,
  insertJobEventMock,
} = vi.hoisted(() => ({
  adminSelectMock: vi.fn(),
  updateProcessingJobMock: vi.fn(),
  insertJobEventMock: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  adminSelect: adminSelectMock,
  updateProcessingJob: updateProcessingJobMock,
  insertJobEvent: insertJobEventMock,
}));

beforeEach(() => {
  adminSelectMock.mockReset();
  updateProcessingJobMock.mockReset();
  insertJobEventMock.mockReset();
  updateProcessingJobMock.mockResolvedValue(undefined);
  insertJobEventMock.mockResolvedValue(undefined);
  vi.stubEnv("AERIAL_NODEODM_MODE", "stub");
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("CRON_SECRET", "integration-secret");
});

afterEach(() => {
  vi.unstubAllEnvs();
  resetSharedStubNodeOdmClient();
});

function authorizedPollRequest(): NextRequest {
  return new NextRequest("https://example.com/api/internal/nodeodm-poll", {
    headers: { authorization: "Bearer integration-secret" },
  });
}

describe("GET /api/internal/nodeodm-poll (integration)", () => {
  it("walks a job dispatched through launchNodeOdmTask from processing → awaiting_output_import across polls", async () => {
    const launch = await launchNodeOdmTask({ jobId: "job-1", presetId: "balanced" });
    if (!launch.ok) throw new Error(`expected launch to succeed, got ${launch.kind}`);

    adminSelectMock.mockResolvedValue([
      {
        id: "job-1",
        org_id: "org-1",
        status: "queued",
        stage: "dispatched",
        output_summary: { nodeodm: { taskUuid: launch.taskUuid } },
      },
    ]);

    const tick1 = await GET(authorizedPollRequest());
    expect(tick1.status).toBe(200);
    const tick1Body = await tick1.json();
    expect(tick1Body.processed).toBe(1);
    expect(tick1Body.details[0].statusName).toBe("queued");

    expect(updateProcessingJobMock).toHaveBeenCalledTimes(1);
    const firstPatch = updateProcessingJobMock.mock.calls[0][1] as Record<string, unknown>;
    expect(firstPatch.status).toBeUndefined();
    expect(firstPatch.stage).toBeUndefined();
    expect(firstPatch.output_summary).toMatchObject({
      nodeodm: { taskUuid: launch.taskUuid, statusName: "queued" },
    });

    const stubClient = (await import("@/lib/nodeodm/stub")).getSharedStubNodeOdmClient();
    await stubClient.commitTask(launch.taskUuid);

    const tick2 = await GET(authorizedPollRequest());
    expect(tick2.status).toBe(200);
    const tick2Body = await tick2.json();
    expect(tick2Body.details[0].statusName).toBe("running");
    expect(updateProcessingJobMock).toHaveBeenCalledTimes(2);
    const runningPatch = updateProcessingJobMock.mock.calls[1][1] as Record<string, unknown>;
    expect(runningPatch.status).toBe("processing");
    expect(runningPatch.stage).toBe("processing");

    await GET(authorizedPollRequest());
    await GET(authorizedPollRequest());
    const tickFinal = await GET(authorizedPollRequest());
    expect(tickFinal.status).toBe(200);
    const finalBody = await tickFinal.json();
    expect(finalBody.details[0].statusName).toBe("completed");
    expect(finalBody.details[0].importedOutputs).toBe(4);

    const patches = updateProcessingJobMock.mock.calls.map((call) => call[1] as Record<string, unknown>);
    const succeededPatch = patches.find((p) => p.status === "succeeded");
    expect(succeededPatch).toBeDefined();
    expect(succeededPatch?.stage).toBe("completed");
    expect(succeededPatch?.completed_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    const succeededSummary = (succeededPatch?.output_summary as Record<string, unknown>) ?? {};
    const succeededNodeodm = (succeededSummary.nodeodm as Record<string, unknown>) ?? {};
    expect(succeededNodeodm.importedFromTaskUuid).toBe(launch.taskUuid);
    expect(Array.isArray(succeededNodeodm.outputs)).toBe(true);
    expect((succeededNodeodm.outputs as Array<unknown>).length).toBe(4);
    expect(succeededNodeodm.benchmarkSummary).toMatchObject({
      status: "success",
      requiredOutputsPresent: true,
    });

    const completedEvents = insertJobEventMock.mock.calls
      .map((call) => call[0] as Record<string, unknown>)
      .filter((e) => e.event_type === "nodeodm.task.completed");
    expect(completedEvents).toHaveLength(1);
    expect(completedEvents[0]).toMatchObject({
      job_id: "job-1",
      org_id: "org-1",
      event_type: "nodeodm.task.completed",
    });

    const importedEvents = insertJobEventMock.mock.calls
      .map((call) => call[0] as Record<string, unknown>)
      .filter((e) => e.event_type === "nodeodm.task.imported");
    expect(importedEvents).toHaveLength(1);
    expect((importedEvents[0].payload as Record<string, unknown>).outputCount).toBe(4);
  });

  it("falls back to awaiting_output_import when benchmark_summary.json is missing from the asset bundle", async () => {
    const launch = await launchNodeOdmTask({ jobId: "job-2", presetId: "balanced" });
    if (!launch.ok) throw new Error(`expected launch to succeed, got ${launch.kind}`);

    adminSelectMock.mockResolvedValue([
      {
        id: "job-2",
        org_id: "org-2",
        status: "queued",
        stage: "dispatched",
        output_summary: { nodeodm: { taskUuid: launch.taskUuid } },
      },
    ]);

    const stubClient = (await import("@/lib/nodeodm/stub")).getSharedStubNodeOdmClient();
    const originalDownload = stubClient.downloadAllAssets.bind(stubClient);
    vi.spyOn(stubClient, "downloadAllAssets").mockImplementation(async () => {
      const { zipSync } = await import("fflate");
      const emptyBundle = zipSync({ "notes.txt": new Uint8Array([1]) });
      return new Response(new Blob([emptyBundle as BlobPart], { type: "application/zip" }), {
        status: 200,
        headers: { "content-type": "application/zip" },
      });
    });
    stubClient.completeTask(launch.taskUuid);

    try {
      await GET(authorizedPollRequest());
      const patches = updateProcessingJobMock.mock.calls.map((call) => call[1] as Record<string, unknown>);
      const awaitingPatch = patches.find((p) => p.status === "awaiting_output_import");
      expect(awaitingPatch).toBeDefined();
      expect(awaitingPatch?.stage).toBe("awaiting-output-import");
      const awaitingSummary = (awaitingPatch?.output_summary as Record<string, unknown>) ?? {};
      const awaitingNodeodm = (awaitingSummary.nodeodm as Record<string, unknown>) ?? {};
      expect(typeof awaitingNodeodm.lastImportError).toBe("string");
    } finally {
      vi.spyOn(stubClient, "downloadAllAssets").mockImplementation(originalDownload);
    }
  });

  it("returns 401 without a valid bearer", async () => {
    const response = await GET(
      new NextRequest("https://example.com/api/internal/nodeodm-poll", {
        headers: { authorization: "Bearer wrong" },
      }),
    );
    expect(response.status).toBe(401);
  });

  it("returns 200 with processed=0 when no jobs have NodeODM cursors", async () => {
    adminSelectMock.mockResolvedValue([]);
    const response = await GET(authorizedPollRequest());
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.processed).toBe(0);
    expect(updateProcessingJobMock).not.toHaveBeenCalled();
  });
});
