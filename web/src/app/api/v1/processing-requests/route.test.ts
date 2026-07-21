// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EXTERNAL_PROCESSING_SCHEMA_VERSION } from "@/lib/external-processing";

import { POST } from "./route";

const {
  adminSelectMock,
  insertProjectMock,
  insertSiteMock,
  insertMissionMock,
  insertDatasetMock,
  insertIngestSessionMock,
  insertProcessingJobMock,
  insertJobEventMock,
  insertExternalProcessingRequestMock,
  selectExternalProcessingRequestByRequestIdMock,
  updateExternalProcessingRequestMock,
} = vi.hoisted(() => ({
  adminSelectMock: vi.fn(),
  insertProjectMock: vi.fn(),
  insertSiteMock: vi.fn(),
  insertMissionMock: vi.fn(),
  insertDatasetMock: vi.fn(),
  insertIngestSessionMock: vi.fn(),
  insertProcessingJobMock: vi.fn(),
  insertJobEventMock: vi.fn(),
  insertExternalProcessingRequestMock: vi.fn(),
  selectExternalProcessingRequestByRequestIdMock: vi.fn(),
  updateExternalProcessingRequestMock: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  adminSelect: adminSelectMock,
  insertProject: insertProjectMock,
  insertSite: insertSiteMock,
  insertMission: insertMissionMock,
  insertDataset: insertDatasetMock,
  insertIngestSession: insertIngestSessionMock,
  insertProcessingJob: insertProcessingJobMock,
  insertJobEvent: insertJobEventMock,
  insertExternalProcessingRequest: insertExternalProcessingRequestMock,
  selectExternalProcessingRequestByRequestId: selectExternalProcessingRequestByRequestIdMock,
  updateExternalProcessingRequest: updateExternalProcessingRequestMock,
}));

const TOKEN = "external-token";

function requestBody() {
  return {
    schemaVersion: EXTERNAL_PROCESSING_SCHEMA_VERSION,
    requestId: "req-openplan-0001",
    callbackUrl: "https://openplan.example.com/api/aerial/processing-callback",
    externalRef: {
      system: "openplan",
      missionId: "mission-op-1",
      workspaceId: "workspace-op-1",
    },
    missionTitle: "Corridor survey — 5th Street",
    imagery: {
      type: "zip_url",
      url: "https://storage.example.com/signed/imagery.zip",
      imageCount: 12,
    },
    presetId: "high-quality",
  };
}

function postRequest(body: unknown, token: string | null = TOKEN): NextRequest {
  return new NextRequest("https://aerial.example.com/api/v1/processing-requests", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.stubEnv("AERIAL_EXTERNAL_PROCESSING_TOKEN", TOKEN);
  vi.stubEnv("AERIAL_EXTERNAL_PROCESSING_ORG_SLUG", "gv-ops");

  adminSelectMock.mockReset();
  adminSelectMock.mockImplementation(async (query: string) => {
    if (query.startsWith("drone_orgs?")) return [{ id: "org-1", slug: "gv-ops" }];
    if (query.startsWith("drone_projects?")) return [];
    if (query.startsWith("drone_sites?")) return [];
    throw new Error(`unexpected adminSelect: ${query}`);
  });
  insertProjectMock.mockReset().mockResolvedValue({ id: "project-1" });
  insertSiteMock.mockReset().mockResolvedValue({ id: "site-1" });
  insertMissionMock.mockReset().mockResolvedValue({ id: "mission-1" });
  insertDatasetMock.mockReset().mockResolvedValue({ id: "dataset-1" });
  insertIngestSessionMock.mockReset().mockResolvedValue({ id: "session-1" });
  insertProcessingJobMock.mockReset().mockResolvedValue({ id: "job-1" });
  insertJobEventMock.mockReset().mockResolvedValue(undefined);
  insertExternalProcessingRequestMock.mockReset().mockImplementation(async (input) => ({
    id: "extreq-1",
    job_id: null,
    ...input,
  }));
  selectExternalProcessingRequestByRequestIdMock.mockReset().mockResolvedValue(null);
  updateExternalProcessingRequestMock.mockReset().mockResolvedValue({ id: "extreq-1" });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/v1/processing-requests", () => {
  it("fails closed when the token env is not configured", async () => {
    vi.stubEnv("AERIAL_EXTERNAL_PROCESSING_TOKEN", "");
    const response = await POST(postRequest(requestBody()));
    expect(response.status).toBe(401);
    expect((await response.json()).error).toBe("external-processing-token-not-configured");
    expect(insertProcessingJobMock).not.toHaveBeenCalled();
  });

  it("rejects a wrong bearer token", async () => {
    const response = await POST(postRequest(requestBody(), "wrong"));
    expect(response.status).toBe(401);
  });

  it("rejects an invalid payload with the validation details", async () => {
    const body = requestBody();
    (body as Record<string, unknown>).schemaVersion = "nope";
    const response = await POST(postRequest(body));
    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.error).toBe("invalid-processing-request");
    expect(payload.details.join(" ")).toContain("schemaVersion");
  });

  it("returns 503 when the external org is not configured", async () => {
    vi.stubEnv("AERIAL_EXTERNAL_PROCESSING_ORG_SLUG", "");
    const response = await POST(postRequest(requestBody()));
    expect(response.status).toBe(503);
  });

  it("accepts a fresh request: claims the requestId, creates the pipeline entities, and answers with an accepted callback", async () => {
    const response = await POST(postRequest(requestBody()));
    expect(response.status).toBe(202);
    const payload = await response.json();
    expect(payload).toMatchObject({
      schemaVersion: EXTERNAL_PROCESSING_SCHEMA_VERSION,
      requestId: "req-openplan-0001",
      jobReference: "job-1",
      status: "accepted",
    });
    expect(payload.callbackId.length).toBeGreaterThanOrEqual(8);

    // Claim first, entities second.
    expect(insertExternalProcessingRequestMock).toHaveBeenCalledTimes(1);
    const claim = insertExternalProcessingRequestMock.mock.calls[0][0];
    expect(claim).toMatchObject({
      org_id: "org-1",
      request_id: "req-openplan-0001",
      consumer_system: "openplan",
      consumer_mission_id: "mission-op-1",
      consumer_workspace_id: "workspace-op-1",
      preset_id: "high-quality",
      last_callback_status: "accepted",
    });

    expect(insertProjectMock).toHaveBeenCalledWith(
      expect.objectContaining({ org_id: "org-1", slug: "external-openplan" }),
    );
    expect(insertSiteMock).toHaveBeenCalledWith(
      expect.objectContaining({ project_id: "project-1", slug: "external-openplan-intake" }),
    );
    expect(insertMissionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        org_id: "org-1",
        mission_type: "external_processing",
        status: "queued",
        name: "Corridor survey — 5th Street",
      }),
    );
    expect(insertIngestSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({ source_type: "external_zip", status: "zip_received", dataset_id: "dataset-1" }),
    );

    const jobInsert = insertProcessingJobMock.mock.calls[0][0];
    expect(jobInsert).toMatchObject({
      org_id: "org-1",
      dataset_id: "dataset-1",
      mission_id: "mission-1",
      status: "queued",
      stage: "queued",
      preset_id: "high-quality-3d",
      external_job_reference: "req-openplan-0001",
    });
    expect(jobInsert.output_summary.external).toEqual({
      system: "openplan",
      requestId: "req-openplan-0001",
    });

    expect(updateExternalProcessingRequestMock).toHaveBeenCalledWith("extreq-1", "org-1", {
      mission_id: "mission-1",
      dataset_id: "dataset-1",
      ingest_session_id: "session-1",
      job_id: "job-1",
    });
    expect(insertJobEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ event_type: "external.request.accepted", job_id: "job-1" }),
    );
  });

  it("replays an already-linked requestId with 200 and creates nothing", async () => {
    selectExternalProcessingRequestByRequestIdMock.mockResolvedValue({
      id: "extreq-1",
      job_id: "job-existing",
    });
    const response = await POST(postRequest(requestBody()));
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.jobReference).toBe("job-existing");
    expect(payload.status).toBe("accepted");
    expect(insertExternalProcessingRequestMock).not.toHaveBeenCalled();
    expect(insertMissionMock).not.toHaveBeenCalled();
    expect(insertProcessingJobMock).not.toHaveBeenCalled();
  });

  it("falls back to the race winner when the claim insert collides", async () => {
    insertExternalProcessingRequestMock.mockRejectedValue(
      new Error('duplicate key value violates unique constraint'),
    );
    selectExternalProcessingRequestByRequestIdMock
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "extreq-1", job_id: "job-winner" });
    const response = await POST(postRequest(requestBody()));
    expect(response.status).toBe(200);
    expect((await response.json()).jobReference).toBe("job-winner");
    expect(insertProcessingJobMock).not.toHaveBeenCalled();
  });

  it("repairs a crashed claim by finishing entity creation", async () => {
    selectExternalProcessingRequestByRequestIdMock.mockResolvedValue({
      id: "extreq-1",
      org_id: "org-1",
      job_id: null,
    });
    const response = await POST(postRequest(requestBody()));
    expect(response.status).toBe(202);
    expect((await response.json()).jobReference).toBe("job-1");
    expect(insertExternalProcessingRequestMock).not.toHaveBeenCalled();
    expect(insertProcessingJobMock).toHaveBeenCalledTimes(1);
  });
});
