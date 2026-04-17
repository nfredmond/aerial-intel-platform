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

    const patches = updateProcessingJobMock.mock.calls.map((call) => call[1] as Record<string, unknown>);
    const completedPatch = patches.find((p) => p.status === "awaiting_output_import");
    expect(completedPatch).toBeDefined();
    expect(completedPatch?.stage).toBe("awaiting-output-import");

    const completedEvents = insertJobEventMock.mock.calls
      .map((call) => call[0] as Record<string, unknown>)
      .filter((e) => e.event_type === "nodeodm.task.completed");
    expect(completedEvents).toHaveLength(1);
    expect(completedEvents[0]).toMatchObject({
      job_id: "job-1",
      org_id: "org-1",
      event_type: "nodeodm.task.completed",
    });
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
