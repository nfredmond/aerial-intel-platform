import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DISPATCH_CALLBACK_CONTRACT_VERSION } from "@/lib/dispatch-callback";

import { POST } from "./route";

const { applyDispatchCallbackMock, isDispatchCallbackAuthorizedMock, parseDispatchCallbackPayloadMock } = vi.hoisted(() => ({
  applyDispatchCallbackMock: vi.fn(),
  isDispatchCallbackAuthorizedMock: vi.fn(),
  parseDispatchCallbackPayloadMock: vi.fn(),
}));

vi.mock("@/lib/dispatch-callback", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/dispatch-callback")>();
  return {
    ...actual,
    applyDispatchCallback: applyDispatchCallbackMock,
    isDispatchCallbackAuthorized: isDispatchCallbackAuthorizedMock,
    parseDispatchCallbackPayload: parseDispatchCallbackPayloadMock,
  };
});

describe("POST /api/dispatch/adapter/callback", () => {
  beforeEach(() => {
    applyDispatchCallbackMock.mockReset();
    isDispatchCallbackAuthorizedMock.mockReset();
    parseDispatchCallbackPayloadMock.mockReset();
  });

  it("rejects unauthorized requests", async () => {
    isDispatchCallbackAuthorizedMock.mockReturnValue(false);

    const response = await POST(new NextRequest("https://example.com/api/dispatch/adapter/callback", {
      method: "POST",
      body: JSON.stringify({}),
    }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ ok: false, error: "unauthorized" });
  });

  it("returns 400 for invalid JSON", async () => {
    isDispatchCallbackAuthorizedMock.mockReturnValue(true);

    const response = await POST(new NextRequest("https://example.com/api/dispatch/adapter/callback", {
      method: "POST",
      body: "{",
      headers: {
        authorization: "Bearer secret",
        "content-type": "application/json",
      },
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ ok: false, error: "invalid-json" });
  });

  it("accepts a valid callback and returns 202 when state changed", async () => {
    isDispatchCallbackAuthorizedMock.mockReturnValue(true);
    parseDispatchCallbackPayloadMock.mockReturnValue({
      contractVersion: DISPATCH_CALLBACK_CONTRACT_VERSION,
      callbackId: "cb-1",
      requestId: "dispatch-job-1-odm-host-01-default",
      callbackAt: "2026-04-06T18:30:00.000Z",
      orgId: "org-1",
      job: { id: "job-1" },
      status: "running",
    });
    applyDispatchCallbackMock.mockResolvedValue({
      ok: true,
      action: "updated",
      jobId: "job-1",
      status: "running",
      stage: "processing",
      progress: 62,
    });

    const response = await POST(new NextRequest("https://example.com/api/dispatch/adapter/callback", {
      method: "POST",
      headers: {
        authorization: "Bearer secret",
        "content-type": "application/json",
      },
      body: JSON.stringify({ callbackId: "cb-1" }),
    }));
    const body = await response.json();

    expect(response.status).toBe(202);
    expect(parseDispatchCallbackPayloadMock).toHaveBeenCalledOnce();
    expect(applyDispatchCallbackMock).toHaveBeenCalledOnce();
    expect(body.ok).toBe(true);
    expect(body.progress).toBe(62);
  });

  it("returns 404 when the target job does not exist", async () => {
    isDispatchCallbackAuthorizedMock.mockReturnValue(true);
    parseDispatchCallbackPayloadMock.mockImplementation(() => {
      throw new Error("Managed processing job not found for dispatch callback.");
    });

    const response = await POST(new NextRequest("https://example.com/api/dispatch/adapter/callback", {
      method: "POST",
      headers: {
        authorization: "Bearer secret",
        "content-type": "application/json",
      },
      body: JSON.stringify({ callbackId: "cb-1" }),
    }));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "Managed processing job not found for dispatch callback.",
    });
  });
});
