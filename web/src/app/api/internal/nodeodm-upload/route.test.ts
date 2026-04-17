// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { launchNodeOdmTask } from "@/lib/dispatch-adapter-nodeodm";
import { getSharedStubNodeOdmClient, resetSharedStubNodeOdmClient } from "@/lib/nodeodm/stub";

import { GET } from "./route";

const {
  adminSelectMock,
  updateProcessingJobMock,
  insertJobEventMock,
  listStorageObjectsMock,
  downloadStorageBytesMock,
} = vi.hoisted(() => ({
  adminSelectMock: vi.fn(),
  updateProcessingJobMock: vi.fn(),
  insertJobEventMock: vi.fn(),
  listStorageObjectsMock: vi.fn(),
  downloadStorageBytesMock: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  adminSelect: adminSelectMock,
  updateProcessingJob: updateProcessingJobMock,
  insertJobEvent: insertJobEventMock,
}));

vi.mock("@/lib/supabase/admin-storage", () => ({
  listStorageObjects: listStorageObjectsMock,
  downloadStorageBytes: downloadStorageBytesMock,
}));

beforeEach(() => {
  adminSelectMock.mockReset();
  updateProcessingJobMock.mockReset();
  insertJobEventMock.mockReset();
  listStorageObjectsMock.mockReset();
  downloadStorageBytesMock.mockReset();
  updateProcessingJobMock.mockResolvedValue(undefined);
  insertJobEventMock.mockResolvedValue(undefined);
  downloadStorageBytesMock.mockImplementation(async () => new Blob([new Uint8Array(4)], { type: "image/jpeg" }));
  vi.stubEnv("AERIAL_NODEODM_MODE", "stub");
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("CRON_SECRET", "upload-secret");
});

afterEach(() => {
  vi.unstubAllEnvs();
  resetSharedStubNodeOdmClient();
});

function authorized(): NextRequest {
  return new NextRequest("https://example.com/api/internal/nodeodm-upload", {
    headers: { authorization: "Bearer upload-secret" },
  });
}

function mockJobRow(overrides: { taskUuid: string; uploadedCount?: number; totalCount?: number | null; uploadState?: string; retryCount?: number }) {
  return {
    id: "job-1",
    org_id: "org-1",
    mission_id: "mission-1",
    status: "running",
    stage: "intake_review",
    output_summary: {
      nodeodm: {
        taskUuid: overrides.taskUuid,
        uploadState: overrides.uploadState ?? "pending",
        uploadedCount: overrides.uploadedCount ?? 0,
        totalCount: overrides.totalCount ?? null,
        uploadRetryCount: overrides.retryCount ?? 0,
      },
    },
  };
}

function makeImages(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    name: `DJI_${String(i).padStart(4, "0")}.JPG`,
    size: 1024,
  }));
}

describe("GET /api/internal/nodeodm-upload (integration)", () => {
  it("returns 401 without a valid bearer", async () => {
    const response = await GET(
      new NextRequest("https://example.com/api/internal/nodeodm-upload", {
        headers: { authorization: "Bearer wrong" },
      }),
    );
    expect(response.status).toBe(401);
  });

  it("returns 200 with processed=0 when no jobs have NodeODM cursors", async () => {
    adminSelectMock.mockResolvedValue([]);
    const response = await GET(authorized());
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.processed).toBe(0);
    expect(updateProcessingJobMock).not.toHaveBeenCalled();
  });

  it("uploads a 13-image dataset in one tick and commits the task", async () => {
    const launch = await launchNodeOdmTask({ jobId: "job-1", presetId: "balanced" });
    if (!launch.ok) throw new Error(`launch failed: ${launch.kind}`);
    const images = makeImages(13);

    adminSelectMock.mockImplementation(async (query: string) => {
      if (query.includes("drone_processing_jobs")) {
        return [mockJobRow({ taskUuid: launch.taskUuid })];
      }
      if (query.includes("drone_ingest_sessions")) {
        return [
          {
            id: "sess-1",
            mission_id: "mission-1",
            extracted_dataset_path: "orgs/org-1/missions/mission-1/extract",
            updated_at: "2026-04-17T00:00:00Z",
          },
        ];
      }
      return [];
    });
    listStorageObjectsMock.mockResolvedValue(images);

    const response = await GET(authorized());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.processed).toBe(1);
    expect(body.details[0]).toMatchObject({ jobId: "job-1", outcome: "committed" });

    expect(downloadStorageBytesMock).toHaveBeenCalledTimes(13);

    expect(updateProcessingJobMock).toHaveBeenCalledTimes(1);
    const patch = updateProcessingJobMock.mock.calls[0][1] as Record<string, unknown>;
    const summary = patch.output_summary as Record<string, unknown>;
    const nodeodm = summary.nodeodm as Record<string, unknown>;
    expect(nodeodm.uploadState).toBe("committed");
    expect(nodeodm.uploadedCount).toBe(13);
    expect(nodeodm.totalCount).toBe(13);
    expect(typeof nodeodm.uploadCommittedAt).toBe("string");

    const committedEvents = insertJobEventMock.mock.calls
      .map((call) => call[0] as Record<string, unknown>)
      .filter((e) => e.event_type === "nodeodm.task.committed");
    expect(committedEvents).toHaveLength(1);

    const stub = getSharedStubNodeOdmClient();
    const info = await stub.taskInfo(launch.taskUuid);
    expect(info.imagesCount).toBe(13);
  });

  it("uploads a 75-image dataset across two ticks, committing on the final tick", async () => {
    const launch = await launchNodeOdmTask({ jobId: "job-1", presetId: "balanced" });
    if (!launch.ok) throw new Error(`launch failed: ${launch.kind}`);
    const images = makeImages(75);

    const ingestRow = {
      id: "sess-1",
      mission_id: "mission-1",
      extracted_dataset_path: "orgs/org-1/missions/mission-1/extract",
      updated_at: "2026-04-17T00:00:00Z",
    };

    // Tick 1: uploadedCount=0, totalCount unknown (null) → 50 uploaded
    adminSelectMock.mockImplementationOnce(async () => [
      mockJobRow({ taskUuid: launch.taskUuid, uploadedCount: 0, totalCount: null }),
    ]);
    adminSelectMock.mockImplementationOnce(async () => [ingestRow]);
    listStorageObjectsMock.mockResolvedValue(images);

    const tick1 = await GET(authorized());
    expect(tick1.status).toBe(200);
    const tick1Body = await tick1.json();
    expect(tick1Body.details[0]).toMatchObject({ outcome: "uploading" });
    expect(tick1Body.details[0].detail).toMatchObject({ uploadedCount: 50, totalCount: 75 });
    expect(downloadStorageBytesMock).toHaveBeenCalledTimes(50);

    // Tick 2: uploadedCount=50, totalCount=75 → upload remaining 25 and commit
    downloadStorageBytesMock.mockClear();
    adminSelectMock.mockImplementationOnce(async () => [
      mockJobRow({ taskUuid: launch.taskUuid, uploadedCount: 50, totalCount: 75 }),
    ]);
    adminSelectMock.mockImplementationOnce(async () => [ingestRow]);

    const tick2 = await GET(authorized());
    expect(tick2.status).toBe(200);
    const tick2Body = await tick2.json();
    expect(tick2Body.details[0]).toMatchObject({ outcome: "committed" });
    expect(tick2Body.details[0].detail).toMatchObject({ uploadedCount: 75, totalCount: 75 });
    expect(downloadStorageBytesMock).toHaveBeenCalledTimes(25);

    const committedEvents = insertJobEventMock.mock.calls
      .map((call) => call[0] as Record<string, unknown>)
      .filter((e) => e.event_type === "nodeodm.task.committed");
    expect(committedEvents).toHaveLength(1);
  });

  it("records a retry when image fetch fails, without escalating on the first failure", async () => {
    const launch = await launchNodeOdmTask({ jobId: "job-1", presetId: "balanced" });
    if (!launch.ok) throw new Error(`launch failed: ${launch.kind}`);
    const images = makeImages(5);

    adminSelectMock.mockImplementation(async (query: string) => {
      if (query.includes("drone_processing_jobs")) {
        return [mockJobRow({ taskUuid: launch.taskUuid, retryCount: 0 })];
      }
      if (query.includes("drone_ingest_sessions")) {
        return [
          {
            id: "sess-1",
            mission_id: "mission-1",
            extracted_dataset_path: "orgs/org-1/missions/mission-1/extract",
            updated_at: "2026-04-17T00:00:00Z",
          },
        ];
      }
      return [];
    });
    listStorageObjectsMock.mockResolvedValue(images);
    downloadStorageBytesMock.mockRejectedValueOnce(new Error("storage-unreachable"));
    downloadStorageBytesMock.mockResolvedValue(new Blob([new Uint8Array(4)], { type: "image/jpeg" }));

    const response = await GET(authorized());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.details[0]).toMatchObject({ outcome: "retrying" });
    expect(body.details[0].detail).toMatchObject({ retryCount: 1 });

    const patch = updateProcessingJobMock.mock.calls[0][1] as Record<string, unknown>;
    expect(patch.status).toBeUndefined();
    const nodeodm = (patch.output_summary as Record<string, unknown>).nodeodm as Record<string, unknown>;
    expect(nodeodm.uploadState).toBe("uploading");
    expect(nodeodm.uploadRetryCount).toBe(1);
    expect(nodeodm.lastUploadError).toBe("storage-unreachable");
  });

  it("escalates to failed + cancels the task when retry threshold is reached", async () => {
    const launch = await launchNodeOdmTask({ jobId: "job-1", presetId: "balanced" });
    if (!launch.ok) throw new Error(`launch failed: ${launch.kind}`);
    const images = makeImages(5);

    adminSelectMock.mockImplementation(async (query: string) => {
      if (query.includes("drone_processing_jobs")) {
        return [mockJobRow({ taskUuid: launch.taskUuid, retryCount: 2 })];
      }
      if (query.includes("drone_ingest_sessions")) {
        return [
          {
            id: "sess-1",
            mission_id: "mission-1",
            extracted_dataset_path: "orgs/org-1/missions/mission-1/extract",
            updated_at: "2026-04-17T00:00:00Z",
          },
        ];
      }
      return [];
    });
    listStorageObjectsMock.mockResolvedValue(images);
    downloadStorageBytesMock.mockRejectedValue(new Error("still-broken"));

    const response = await GET(authorized());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.details[0]).toMatchObject({ outcome: "failed" });

    const patch = updateProcessingJobMock.mock.calls[0][1] as Record<string, unknown>;
    expect(patch.status).toBe("failed");
    expect(patch.stage).toBe("failed");
    const nodeodm = (patch.output_summary as Record<string, unknown>).nodeodm as Record<string, unknown>;
    expect(nodeodm.uploadState).toBe("failed");

    const failureEvents = insertJobEventMock.mock.calls
      .map((call) => call[0] as Record<string, unknown>)
      .filter((e) => e.event_type === "nodeodm.task.upload_failed");
    expect(failureEvents).toHaveLength(1);
  });

  it("skips jobs whose mission has no extracted_dataset_path yet", async () => {
    const launch = await launchNodeOdmTask({ jobId: "job-1", presetId: "balanced" });
    if (!launch.ok) throw new Error(`launch failed: ${launch.kind}`);

    adminSelectMock.mockImplementation(async (query: string) => {
      if (query.includes("drone_processing_jobs")) {
        return [mockJobRow({ taskUuid: launch.taskUuid })];
      }
      if (query.includes("drone_ingest_sessions")) {
        return [];
      }
      return [];
    });

    const response = await GET(authorized());
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.details[0].outcome).toBe("skipped:no-session");
    expect(updateProcessingJobMock).not.toHaveBeenCalled();
    expect(insertJobEventMock).not.toHaveBeenCalled();
  });
});
