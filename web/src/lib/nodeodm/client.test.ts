import { describe, expect, it, vi } from "vitest";

import { NodeOdmClient } from "./client";
import { NodeOdmError, isNodeOdmError } from "./errors";

function mockFetchSequence(responses: Response[]): typeof fetch {
  let index = 0;
  return vi.fn(async () => {
    const response = responses[index] ?? responses[responses.length - 1];
    index += 1;
    return response;
  }) as unknown as typeof fetch;
}

function jsonResponse(body: unknown, init: { status?: number } = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("NodeOdmClient", () => {
  it("fetches info and validates shape", async () => {
    const fetchImpl = mockFetchSequence([
      jsonResponse({
        version: "2.5.3",
        engineVersion: "3.5",
        taskQueueCount: 0,
        maxImages: 100,
        maxParallelTasks: 2,
      }),
    ]);

    const client = new NodeOdmClient({ baseUrl: "http://node/", fetchImpl });
    const info = await client.info();
    expect(info.version).toBe("2.5.3");
    expect(info.engineVersion).toBe("3.5");
  });

  it("throws a validation error on unexpected info shape", async () => {
    const fetchImpl = mockFetchSequence([jsonResponse({ foo: "bar" })]);
    const client = new NodeOdmClient({ baseUrl: "http://node", fetchImpl });
    await expect(client.info()).rejects.toMatchObject({ kind: "validation" });
  });

  it("maps 401 to auth NodeOdmError", async () => {
    const fetchImpl = mockFetchSequence([new Response("", { status: 401 })]);
    const client = new NodeOdmClient({ baseUrl: "http://node", fetchImpl });
    try {
      await client.info();
      throw new Error("expected to throw");
    } catch (error) {
      expect(isNodeOdmError(error)).toBe(true);
      expect((error as NodeOdmError).kind).toBe("auth");
      expect((error as NodeOdmError).status).toBe(401);
    }
  });

  it("creates a task and returns uuid", async () => {
    const fetchImpl = mockFetchSequence([jsonResponse({ uuid: "task-123" })]);
    const client = new NodeOdmClient({ baseUrl: "http://node", fetchImpl });
    const uuid = await client.createTask({ name: "mission-42", options: [{ name: "dsm", value: true }] });
    expect(uuid).toBe("task-123");
  });

  it("validates taskInfo response", async () => {
    const fetchImpl = mockFetchSequence([
      jsonResponse({
        uuid: "task-123",
        progress: 42,
        status: { code: 20 },
        imagesCount: 120,
      }),
    ]);
    const client = new NodeOdmClient({ baseUrl: "http://node", fetchImpl });
    const info = await client.taskInfo("task-123");
    expect(info.uuid).toBe("task-123");
    expect(info.progress).toBe(42);
  });

  it("maps 404 to not_found", async () => {
    const fetchImpl = mockFetchSequence([new Response("", { status: 404 })]);
    const client = new NodeOdmClient({ baseUrl: "http://node", fetchImpl });
    await expect(client.taskInfo("missing")).rejects.toMatchObject({ kind: "not_found" });
  });

  it("returns output lines from taskOutput", async () => {
    const fetchImpl = mockFetchSequence([jsonResponse(["line-a", "line-b"])]);
    const client = new NodeOdmClient({ baseUrl: "http://node", fetchImpl });
    const lines = await client.taskOutput("task-123");
    expect(lines).toEqual(["line-a", "line-b"]);
  });

  it("appends token query param when configured", async () => {
    const capturedUrls: string[] = [];
    const fetchImpl = (async (input: RequestInfo | URL) => {
      capturedUrls.push(typeof input === "string" ? input : input.toString());
      return jsonResponse({ version: "2.5", engineVersion: "3.5" });
    }) as unknown as typeof fetch;

    const client = new NodeOdmClient({ baseUrl: "http://node", token: "secret", fetchImpl });
    await client.info();
    expect(capturedUrls[0]).toMatch(/token=secret$/);
  });
});
