import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getSharedStubNodeOdmClient,
  resetSharedStubNodeOdmClient,
} from "@/lib/nodeodm/stub";

import { POST } from "./route";

beforeEach(() => {
  vi.stubEnv("AERIAL_NODEODM_MODE", "stub");
  vi.stubEnv("NODE_ENV", "test");
});

afterEach(() => {
  vi.unstubAllEnvs();
  resetSharedStubNodeOdmClient();
});

function postRequest(params: Record<string, string>): NextRequest {
  const url = new URL("https://example.com/api/internal/dev/nodeodm-stub-advance");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return new NextRequest(url, { method: "POST" });
}

describe("POST /api/internal/dev/nodeodm-stub-advance", () => {
  it("returns 404 when AERIAL_NODEODM_MODE is not 'stub'", async () => {
    vi.stubEnv("AERIAL_NODEODM_MODE", "real");
    const response = await POST(postRequest({ taskUuid: "x", to: "running" }));
    expect(response.status).toBe(404);
  });

  it("returns 404 when NODE_ENV is production even in stub mode", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const response = await POST(postRequest({ taskUuid: "x", to: "running" }));
    expect(response.status).toBe(404);
  });

  it("returns 400 when taskUuid is missing", async () => {
    const response = await POST(postRequest({ to: "running" }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("missing-taskUuid");
  });

  it("returns 400 when 'to' is invalid", async () => {
    const response = await POST(postRequest({ taskUuid: "x", to: "exploded" }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("invalid-to");
    expect(body.allowed).toEqual(expect.arrayContaining(["running", "completed", "failed", "canceled", "progress"]));
  });

  it("returns 404 when the task isn't known to the stub", async () => {
    const response = await POST(postRequest({ taskUuid: "never-created", to: "running" }));
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toBe("task-not-found");
  });

  it("advances a queued task to running via to=running", async () => {
    const stub = getSharedStubNodeOdmClient();
    const uuid = await stub.createTask({ name: "t1" });

    const response = await POST(postRequest({ taskUuid: uuid, to: "running" }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.taskUuid).toBe(uuid);
    expect(body.to).toBe("running");
    expect(body.statusCode).toBe(20);
  });

  it("flips to completed (40) via to=completed", async () => {
    const stub = getSharedStubNodeOdmClient();
    const uuid = await stub.createTask({ name: "t2" });

    await POST(postRequest({ taskUuid: uuid, to: "running" }));
    const response = await POST(postRequest({ taskUuid: uuid, to: "completed" }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.statusCode).toBe(40);
    expect(body.progress).toBe(100);
  });

  it("flips to failed (30) via to=failed", async () => {
    const stub = getSharedStubNodeOdmClient();
    const uuid = await stub.createTask({ name: "t3" });

    const response = await POST(postRequest({ taskUuid: uuid, to: "failed" }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.statusCode).toBe(30);
  });

  it("flips to canceled (50) via to=canceled", async () => {
    const stub = getSharedStubNodeOdmClient();
    const uuid = await stub.createTask({ name: "t4" });

    const response = await POST(postRequest({ taskUuid: uuid, to: "canceled" }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.statusCode).toBe(50);
  });

  it("ticks progress on a running task via to=progress", async () => {
    const stub = getSharedStubNodeOdmClient();
    const uuid = await stub.createTask({ name: "t5" });
    await stub.commitTask(uuid);

    const response = await POST(postRequest({ taskUuid: uuid, to: "progress" }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.progress).toBeGreaterThan(0);
    expect(body.statusCode).toBe(20);
  });
});
