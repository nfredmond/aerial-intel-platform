import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PROVING_HEARTBEAT_CRON_SCHEDULE, PROVING_HEARTBEAT_ROUTE_PATH } from "@/lib/proving-heartbeat";

import { GET } from "./route";

const { reconcileProvingJobsOutOfBandMock, recordProvingHeartbeatAuditMock, isProvingLaneEnabledMock } = vi.hoisted(() => ({
  reconcileProvingJobsOutOfBandMock: vi.fn(),
  recordProvingHeartbeatAuditMock: vi.fn(),
  isProvingLaneEnabledMock: vi.fn(),
}));

vi.mock("@/lib/proving-runs", () => ({
  reconcileProvingJobsOutOfBand: reconcileProvingJobsOutOfBandMock,
  recordProvingHeartbeatAudit: recordProvingHeartbeatAuditMock,
  isProvingLaneEnabled: isProvingLaneEnabledMock,
}));

describe("GET /api/internal/proving-heartbeat", () => {
  beforeEach(() => {
    reconcileProvingJobsOutOfBandMock.mockReset();
    recordProvingHeartbeatAuditMock.mockReset();
    recordProvingHeartbeatAuditMock.mockResolvedValue(1);
    isProvingLaneEnabledMock.mockReset();
    isProvingLaneEnabledMock.mockReturnValue(true);
    process.env.CRON_SECRET = "top-secret";
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  it("no-ops without touching the proving lane when the lane is disabled", async () => {
    isProvingLaneEnabledMock.mockReturnValue(false);

    const response = await GET(
      new NextRequest("https://example.com/api/internal/proving-heartbeat", {
        headers: { authorization: "Bearer top-secret" },
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.enabled).toBe(false);
    expect(body.updates).toBe(0);
    expect(reconcileProvingJobsOutOfBandMock).not.toHaveBeenCalled();
    expect(recordProvingHeartbeatAuditMock).not.toHaveBeenCalled();
  });

  it("rejects unauthorized requests", async () => {
    const response = await GET(new NextRequest("https://example.com/api/internal/proving-heartbeat"));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ ok: false, error: "unauthorized" });
  });

  it("fails closed when CRON_SECRET is not configured, even for vercel-cron user agents", async () => {
    delete process.env.CRON_SECRET;

    const response = await GET(
      new NextRequest("https://example.com/api/internal/proving-heartbeat", {
        headers: {
          "user-agent": "vercel-cron/1.0",
        },
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ ok: false, error: "cron-secret-not-configured" });
    expect(reconcileProvingJobsOutOfBandMock).not.toHaveBeenCalled();
  });

  it("runs the reconcile pass for an authorized request", async () => {
    reconcileProvingJobsOutOfBandMock.mockResolvedValue({
      scanned: 2,
      updates: 1,
      started: 1,
      completed: 0,
    });

    const request = new NextRequest("https://example.com/api/internal/proving-heartbeat", {
      headers: {
        authorization: "Bearer top-secret",
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
