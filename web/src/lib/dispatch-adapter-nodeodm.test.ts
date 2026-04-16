import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { launchNodeOdmTask } from "./dispatch-adapter-nodeodm";

describe("launchNodeOdmTask", () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    globalThis.fetch = originalFetch;
  });

  it("returns unconfigured when AERIAL_NODEODM_URL is unset", async () => {
    delete process.env.AERIAL_NODEODM_URL;
    const result = await launchNodeOdmTask({ jobId: "job-1", presetId: "balanced" });
    expect(result).toMatchObject({ ok: false, kind: "unconfigured" });
  });

  it("returns ok with taskUuid when NodeODM accepts the task", async () => {
    process.env.AERIAL_NODEODM_URL = "http://nodeodm.local";
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ uuid: "task-xyz" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ) as unknown as typeof fetch;

    const result = await launchNodeOdmTask({ jobId: "job-2", presetId: "fast-ortho" });
    expect(result).toMatchObject({
      ok: true,
      taskUuid: "task-xyz",
      presetId: "fast-ortho",
    });
  });

  it("maps NodeODM error responses into structured failures", async () => {
    process.env.AERIAL_NODEODM_URL = "http://nodeodm.local";
    globalThis.fetch = vi.fn(async () => new Response("", { status: 401 })) as unknown as typeof fetch;

    const result = await launchNodeOdmTask({ jobId: "job-3", presetId: "balanced" });
    expect(result).toMatchObject({ ok: false, kind: "auth" });
  });

  it("falls back to balanced preset when id is missing", async () => {
    process.env.AERIAL_NODEODM_URL = "http://nodeodm.local";
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ uuid: "task-default" }), { status: 200 }),
    ) as unknown as typeof fetch;

    const result = await launchNodeOdmTask({ jobId: "job-4", presetId: null });
    if (!result.ok) throw new Error("expected ok result");
    expect(result.presetId).toBe("balanced");
  });
});
