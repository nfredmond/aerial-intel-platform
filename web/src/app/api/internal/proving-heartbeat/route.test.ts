import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PROVING_HEARTBEAT_CRON_SCHEDULE, PROVING_HEARTBEAT_ROUTE_PATH } from "@/lib/proving-heartbeat";

import { GET } from "./route";

const { reconcileProvingJobsOutOfBandMock, recordProvingHeartbeatAuditMock } = vi.hoisted(() => ({
  reconcileProvingJobsOutOfBandMock: vi.fn(),
  recordProvingHeartbeatAuditMock: vi.fn(),
}));

vi.mock("@/lib/proving-runs", () => ({
  reconcileProvingJobsOutOfBand: reconcileProvingJobsOutOfBandMock,
  recordProvingHeartbeatAudit: recordProvingHeartbeatAuditMock,
}));

describe("GET /api/internal/proving-heartbeat", () => {
  beforeEach(() => {
    reconcileProvingJobsOutOfBandMock.mockReset();
    recordProvingHeartbeatAuditMock.mockReset();
    recordProvingHeartbeatAuditMock.mockResolvedValue(1);
    delete process.env.CRON_SECRET;
  });

  it("rejects unauthorized requests", async () => {
    const response = await GET(new NextRequest("https://example.com/api/internal/proving-heartbeat"));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ ok: false, error: "unauthorized" });
  });

  it("accepts vercel cron requests without a configured secret", async () => {
    reconcileProvingJobsOutOfBandMock.mockResolvedValue({
      scanned: 2,
      updates: 1,
      started: 1,
      completed: 0,
    });

    const request = new NextRequest("https://example.com/api/internal/proving-heartbeat", {
      headers: {
        "user-agent": "vercel-cron/1.0",
      },
    });

    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.heartbeat.routePath).toBe(PROVING_HEARTBEAT_ROUTE_PATH);
    expect(body.heartbeat.schedule).toBe(PROVING_HEARTBEAT_CRON_SCHEDULE);
    expect(body.auditRecorded).toBe(1);
    expect(body.started).toBe(1);
    expect(recordProvingHeartbeatAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        scanned: 2,
        updates: 1,
        started: 1,
        completed: 0,
      }),
    );
  });

  it("requires the bearer token when CRON_SECRET is configured", async () => {
    process.env.CRON_SECRET = "top-secret";
    reconcileProvingJobsOutOfBandMock.mockResolvedValue({
      scanned: 0,
      updates: 0,
      started: 0,
      completed: 0,
    });

    const unauthorizedResponse = await GET(
      new NextRequest("https://example.com/api/internal/proving-heartbeat", {
        headers: {
          "user-agent": "vercel-cron/1.0",
        },
      }),
    );
    expect(unauthorizedResponse.status).toBe(401);

    const authorizedResponse = await GET(
      new NextRequest("https://example.com/api/internal/proving-heartbeat", {
        headers: {
          authorization: "Bearer top-secret",
        },
      }),
    );
    expect(authorizedResponse.status).toBe(200);
  });
});
