// @vitest-environment node
import { zipSync } from "fflate";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetSharedStubNodeOdmClient } from "@/lib/nodeodm/stub";

import { GET, INGEST_CLAIM_STALE_MS, shouldSkipIngestRow } from "./route";

const {
  adminSelectMock,
  selectExternalProcessingRequestsByStatusMock,
  updateExternalProcessingRequestMock,
  updateIngestSessionMock,
  updateDatasetMock,
  updateProcessingJobMock,
  insertJobEventMock,
  uploadStorageBytesMock,
  createSignedDownloadUrlMock,
} = vi.hoisted(() => ({
  adminSelectMock: vi.fn(),
  selectExternalProcessingRequestsByStatusMock: vi.fn(),
  updateExternalProcessingRequestMock: vi.fn(),
  updateIngestSessionMock: vi.fn(),
  updateDatasetMock: vi.fn(),
  updateProcessingJobMock: vi.fn(),
  insertJobEventMock: vi.fn(),
  uploadStorageBytesMock: vi.fn(),
  createSignedDownloadUrlMock: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  adminSelect: adminSelectMock,
  selectExternalProcessingRequestsByStatus: selectExternalProcessingRequestsByStatusMock,
  updateExternalProcessingRequest: updateExternalProcessingRequestMock,
  updateIngestSession: updateIngestSessionMock,
  updateDataset: updateDatasetMock,
  updateProcessingJob: updateProcessingJobMock,
  insertJobEvent: insertJobEventMock,
}));

vi.mock("@/lib/supabase/admin-storage", () => ({
  uploadStorageBytes: uploadStorageBytesMock,
  createSignedDownloadUrl: createSignedDownloadUrlMock,
}));

const IMAGERY_URL = "https://storage.example.com/signed/imagery.zip";
const CALLBACK_URL = "https://openplan.example.com/api/aerial/processing-callback";

function baseRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "extreq-1",
    org_id: "org-1",
    request_id: "req-openplan-0001",
    consumer_system: "openplan",
    consumer_workspace_id: "workspace-op-1",
    consumer_mission_id: "mission-op-1",
    consumer_project_id: null,
    callback_url: CALLBACK_URL,
    imagery_url: IMAGERY_URL,
    imagery_image_count: 2,
    imagery_size_bytes: null,
    preset_id: "high-quality",
    notes: null,
    mission_id: "mission-1",
    dataset_id: "dataset-1",
    ingest_session_id: "session-1",
    job_id: "job-1",
    status: "received",
    ingest_attempts: 0,
    ingest_error: null,
    last_callback_status: "accepted",
    last_callback_progress: null,
    last_callback_at: new Date().toISOString(),
    callback_attempts: 0,
    last_callback_error: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function zipFixture(): Uint8Array {
  return zipSync({
    "DJI_0001.JPG": new Uint8Array([1, 2, 3]),
    "DJI_0002.jpg": new Uint8Array([4, 5, 6]),
    "flight_log.txt": new Uint8Array([7]),
  });
}

function authorizedRequest(): NextRequest {
  return new NextRequest("https://example.com/api/internal/external-ingest", {
    headers: { authorization: "Bearer integration-secret" },
  });
}

type FetchCall = { url: string; init?: RequestInit };
let fetchCalls: FetchCall[];

beforeEach(() => {
  vi.stubEnv("AERIAL_NODEODM_MODE", "stub");
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("CRON_SECRET", "integration-secret");
  vi.stubEnv("AERIAL_PROCESSING_CALLBACK_TOKEN", "callback-token");

  fetchCalls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      fetchCalls.push({ url, init });
      if (url === IMAGERY_URL) {
        return new Response(zipFixture() as unknown as BodyInit, { status: 200 });
      }
      if (url === CALLBACK_URL) {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      throw new Error(`unexpected fetch: ${url}`);
    }),
  );

  adminSelectMock.mockReset();
  selectExternalProcessingRequestsByStatusMock.mockReset();
  updateExternalProcessingRequestMock.mockReset().mockResolvedValue({ id: "extreq-1" });
  updateIngestSessionMock.mockReset().mockResolvedValue({ id: "session-1" });
  updateDatasetMock.mockReset().mockResolvedValue({ id: "dataset-1" });
  updateProcessingJobMock.mockReset().mockResolvedValue({ id: "job-1" });
  insertJobEventMock.mockReset().mockResolvedValue(undefined);
  uploadStorageBytesMock.mockReset().mockImplementation(async ({ path }: { path: string }) => ({ path }));
  createSignedDownloadUrlMock.mockReset().mockImplementation(
    async ({ path }: { path: string }) => `https://signed.example.com/${path}`,
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  resetSharedStubNodeOdmClient();
});

describe("shouldSkipIngestRow", () => {
  it("skips only fresh ingesting claims", () => {
    const now = Date.now();
    const fresh = baseRow({ status: "ingesting", updated_at: new Date(now - 1000).toISOString() });
    const stale = baseRow({
      status: "ingesting",
      updated_at: new Date(now - INGEST_CLAIM_STALE_MS - 1000).toISOString(),
    });
    expect(shouldSkipIngestRow(fresh, now)).toBe(true);
    expect(shouldSkipIngestRow(stale, now)).toBe(false);
    expect(shouldSkipIngestRow(baseRow({ status: "received" }), now)).toBe(false);
  });
});

describe("GET /api/internal/external-ingest", () => {
  it("rejects requests without the cron bearer", async () => {
    const response = await GET(
      new NextRequest("https://example.com/api/internal/external-ingest"),
    );
    expect(response.status).toBe(401);
  });

  it("ingests a received request: streams the ZIP into storage, launches NodeODM, and flips the row to processing", async () => {
    selectExternalProcessingRequestsByStatusMock.mockImplementation(async (statuses: string[]) =>
      statuses.includes("received") ? [baseRow()] : [],
    );
    adminSelectMock.mockImplementation(async (query: string) => {
      if (query.startsWith("drone_orgs?")) return [{ id: "org-1", slug: "gv-ops" }];
      if (query.startsWith("drone_processing_jobs?id=eq.job-1")) {
        return [
          {
            id: "job-1",
            org_id: "org-1",
            status: "queued",
            output_summary: { external: { system: "openplan", requestId: "req-openplan-0001" } },
          },
        ];
      }
      throw new Error(`unexpected adminSelect: ${query}`);
    });

    const response = await GET(authorizedRequest());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.processed).toBe(1);
    expect(body.details[0].outcome).toBe("launched");
    expect(body.details[0].detail.imageCount).toBe(2);

    // Only the two images land in storage, under the shared extract layout.
    const uploadedPaths = uploadStorageBytesMock.mock.calls.map((call) => call[0].path);
    expect(uploadedPaths).toEqual([
      "gv-ops/missions/mission-1/extracted/session-1/DJI_0001.JPG",
      "gv-ops/missions/mission-1/extracted/session-1/DJI_0002.jpg",
    ]);

    expect(updateIngestSessionMock).toHaveBeenCalledWith("session-1", "org-1", {
      extracted_dataset_path: "gv-ops/missions/mission-1/extracted/session-1",
      image_count: 2,
      status: "extracted",
    });
    expect(updateDatasetMock).toHaveBeenCalledWith("dataset-1", "org-1", { status: "ready" });

    const jobPatch = updateProcessingJobMock.mock.calls[0][2] as Record<string, unknown>;
    expect(jobPatch.status).toBe("running");
    expect(jobPatch.stage).toBe("intake_review");
    const nodeodm = (jobPatch.output_summary as Record<string, unknown>).nodeodm as Record<string, unknown>;
    expect(typeof nodeodm.taskUuid).toBe("string");
    expect(nodeodm.presetId).toBe("high-quality-3d");
    expect(nodeodm.uploadState).toBe("pending");

    expect(insertJobEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ event_type: "nodeodm.task.queued", job_id: "job-1" }),
    );

    const rowPatches = updateExternalProcessingRequestMock.mock.calls.map((call) => call[2]);
    expect(rowPatches[0]).toMatchObject({ status: "ingesting", ingest_attempts: 1 });
    expect(rowPatches.at(-1)).toMatchObject({ status: "processing", ingest_error: null });
  });

  it("does not relaunch a job that already holds a NodeODM task", async () => {
    selectExternalProcessingRequestsByStatusMock.mockImplementation(async (statuses: string[]) =>
      statuses.includes("received") ? [baseRow({ ingest_attempts: 1 })] : [],
    );
    adminSelectMock.mockImplementation(async (query: string) => {
      if (query.startsWith("drone_orgs?")) return [{ id: "org-1", slug: "gv-ops" }];
      if (query.startsWith("drone_processing_jobs?id=eq.job-1")) {
        return [
          {
            id: "job-1",
            org_id: "org-1",
            status: "running",
            output_summary: { nodeodm: { taskUuid: "task-already" } },
          },
        ];
      }
      throw new Error(`unexpected adminSelect: ${query}`);
    });

    const response = await GET(authorizedRequest());
    const body = await response.json();
    expect(body.details[0].outcome).toBe("repaired:already-launched");
    expect(uploadStorageBytesMock).not.toHaveBeenCalled();
    expect(updateProcessingJobMock).not.toHaveBeenCalled();
  });

  it("fails the job permanently once ingest attempts are exhausted", async () => {
    selectExternalProcessingRequestsByStatusMock.mockImplementation(async (statuses: string[]) =>
      statuses.includes("received")
        ? [baseRow({ ingest_attempts: 3, ingest_error: "imagery ZIP download failed (403)" })]
        : [],
    );
    adminSelectMock.mockImplementation(async (query: string) => {
      if (query.startsWith("drone_orgs?")) return [{ id: "org-1", slug: "gv-ops" }];
      if (query.startsWith("drone_processing_jobs?id=eq.job-1")) {
        return [{ id: "job-1", org_id: "org-1", status: "queued", output_summary: {} }];
      }
      throw new Error(`unexpected adminSelect: ${query}`);
    });

    const response = await GET(authorizedRequest());
    const body = await response.json();
    expect(body.details[0].outcome).toBe("failed:attempts-exhausted");

    const jobPatch = updateProcessingJobMock.mock.calls[0][2] as Record<string, unknown>;
    expect(jobPatch.status).toBe("failed");
    expect(jobPatch.stage).toBe("failed");
    expect(insertJobEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ event_type: "external.ingest.failed" }),
    );
    expect(uploadStorageBytesMock).not.toHaveBeenCalled();
  });

  it("records a retryable error and returns the row to received when the ZIP download fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 403 })),
    );
    selectExternalProcessingRequestsByStatusMock.mockImplementation(async (statuses: string[]) =>
      statuses.includes("received") ? [baseRow()] : [],
    );
    adminSelectMock.mockImplementation(async (query: string) => {
      if (query.startsWith("drone_orgs?")) return [{ id: "org-1", slug: "gv-ops" }];
      if (query.startsWith("drone_processing_jobs?id=eq.job-1")) {
        return [{ id: "job-1", org_id: "org-1", status: "queued", output_summary: {} }];
      }
      throw new Error(`unexpected adminSelect: ${query}`);
    });

    const response = await GET(authorizedRequest());
    const body = await response.json();
    expect(body.failures).toHaveLength(1);
    expect(body.failures[0].error).toContain("403");
    const lastPatch = updateExternalProcessingRequestMock.mock.calls.at(-1)![2];
    expect(lastPatch).toMatchObject({ status: "received" });
    expect(lastPatch.ingest_error).toContain("403");
  });

  it("sweeps owed callbacks: delivers a succeeded callback with signed artifacts and closes the row", async () => {
    selectExternalProcessingRequestsByStatusMock.mockImplementation(async (statuses: string[]) => {
      if (statuses.includes("received")) return [];
      return [
        baseRow({
          status: "processing",
          last_callback_status: "running",
          last_callback_progress: 90,
        }),
      ];
    });
    adminSelectMock.mockImplementation(async (query: string) => {
      if (query.startsWith("drone_processing_jobs?id=in.")) {
        return [
          {
            id: "job-1",
            org_id: "org-1",
            status: "succeeded",
            output_summary: { benchmarkSummary: { status: "success" } },
          },
        ];
      }
      if (query.startsWith("drone_processing_outputs?")) {
        return [
          {
            kind: "orthomosaic",
            storage_bucket: "drone-ops",
            storage_path: "gv-ops/jobs/job-1/outputs/orthomosaic/odm_orthophoto.tif",
            metadata: { sizeBytes: 1234 },
          },
          {
            kind: "report",
            storage_bucket: "drone-ops",
            storage_path: "gv-ops/jobs/job-1/outputs/report/report.pdf",
            metadata: {},
          },
        ];
      }
      throw new Error(`unexpected adminSelect: ${query}`);
    });

    const response = await GET(authorizedRequest());
    const body = await response.json();
    expect(body.callbacks).toHaveLength(1);
    expect(body.callbacks[0]).toMatchObject({ emitted: "succeeded", delivered: true });

    const callbackCall = fetchCalls.find((call) => call.url === CALLBACK_URL);
    expect(callbackCall).toBeDefined();
    const headers = callbackCall!.init!.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer callback-token");
    const payload = JSON.parse(String(callbackCall!.init!.body));
    expect(payload.status).toBe("succeeded");
    expect(payload.requestId).toBe("req-openplan-0001");
    expect(payload.jobReference).toBe("job-1");
    expect(payload.benchmarkSummary).toEqual({ status: "success" });
    // Only contract artifact kinds go out; the report stays internal.
    expect(payload.artifacts).toHaveLength(1);
    expect(payload.artifacts[0]).toMatchObject({
      kind: "orthomosaic",
      sizeBytes: 1234,
      contentType: "image/tiff",
    });
    expect(payload.artifacts[0].downloadUrl).toContain("https://signed.example.com/");

    expect(updateExternalProcessingRequestMock).toHaveBeenCalledWith(
      "extreq-1",
      "org-1",
      expect.objectContaining({ status: "completed", last_callback_status: "succeeded" }),
    );
  });
});
