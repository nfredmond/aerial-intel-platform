// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { strFromU8, unzipSync } from "fflate";

import { parseManagedBenchmarkSummaryText } from "@/lib/managed-processing-import";

import { createConfiguredNodeOdmClient } from "./config";
import { NodeOdmError, isNodeOdmError } from "./errors";
import {
  buildSyntheticOutputZip,
  createStubNodeOdmClient,
  resetSharedStubNodeOdmClient,
} from "./stub";

afterEach(() => {
  vi.unstubAllEnvs();
  resetSharedStubNodeOdmClient();
});

describe("createStubNodeOdmClient", () => {
  it("dispatches a task and walks queued → running → completed on successive taskInfo calls", async () => {
    const client = createStubNodeOdmClient({ progressStep: 25 });
    const uuid = await client.createTask({ name: "mission-1" });
    expect(uuid).toMatch(/^stub-task-/);

    const queued = await client.taskInfo(uuid);
    expect(queued.status?.code).toBe(10);
    expect(queued.progress).toBe(0);

    await client.commitTask(uuid);
    const info25 = await client.taskInfo(uuid);
    expect(info25.status?.code).toBe(20);
    expect(info25.progress).toBe(25);

    await client.taskInfo(uuid);
    await client.taskInfo(uuid);
    const finalInfo = await client.taskInfo(uuid);
    expect(finalInfo.status?.code).toBe(40);
    expect(finalInfo.progress).toBe(100);
  });

  it("stays at terminal state after completion (no further progress on next taskInfo)", async () => {
    const client = createStubNodeOdmClient({ progressStep: 100 });
    const uuid = await client.createTask();
    await client.commitTask(uuid);
    const first = await client.taskInfo(uuid);
    expect(first.status?.code).toBe(40);
    const second = await client.taskInfo(uuid);
    expect(second.status?.code).toBe(40);
    expect(second.progress).toBe(100);
  });

  it("cancelTask flips status to 50 and blocks further progress", async () => {
    const client = createStubNodeOdmClient({ progressStep: 25 });
    const uuid = await client.createTask();
    await client.commitTask(uuid);
    await client.cancelTask(uuid);
    const info = await client.taskInfo(uuid);
    expect(info.status?.code).toBe(50);
    const info2 = await client.taskInfo(uuid);
    expect(info2.status?.code).toBe(50);
  });

  it("counts uploaded images against the task record", async () => {
    const client = createStubNodeOdmClient();
    const uuid = await client.createTask();
    await client.uploadImages(uuid, [
      { blob: new Blob([]), filename: "a.jpg" },
      { blob: new Blob([]), filename: "b.jpg" },
    ]);
    const info = await client.taskInfo(uuid);
    expect(info.imagesCount).toBe(2);
  });

  it("throws not_found on taskInfo for unknown uuid", async () => {
    const client = createStubNodeOdmClient();
    try {
      await client.taskInfo("missing");
      throw new Error("expected to throw");
    } catch (error) {
      expect(isNodeOdmError(error)).toBe(true);
      expect((error as NodeOdmError).kind).toBe("not_found");
    }
  });

  it("downloadAllAssets returns a zip Response tagged as synthetic", async () => {
    const client = createStubNodeOdmClient();
    const uuid = await client.createTask();
    await client.commitTask(uuid);
    const response = await client.downloadAllAssets(uuid);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/zip");
    expect(response.headers.get("X-Stub-NodeODM")).toBe("synthetic");
  });

  it("buildSyntheticOutputZip emits the 6 expected entries", () => {
    const bytes = buildSyntheticOutputZip("abcdef0123456789", "test-project");
    const entries = unzipSync(bytes);
    const names = Object.keys(entries).sort();
    expect(names).toEqual([
      "benchmark_summary.json",
      "logs/run.log",
      "odm_dem/dsm.tif",
      "odm_georeferencing/odm_georeferenced_model.laz",
      "odm_orthophoto/odm_orthophoto.tif",
      "odm_texturing/odm_textured_model_geo.obj",
    ]);
    for (const name of names) {
      expect(entries[name].byteLength).toBeGreaterThan(0);
    }
  });

  it("synthetic benchmark_summary.json parses through the managed import parser", () => {
    const bytes = buildSyntheticOutputZip("abcdef0123456789", "test-project");
    const entries = unzipSync(bytes);
    const summaryText = strFromU8(entries["benchmark_summary.json"]);
    const parsed = parseManagedBenchmarkSummaryText(summaryText);
    expect(parsed.outputs).toHaveLength(4);
    expect(parsed.minimumPass).toBe(true);
    expect(parsed.requiredOutputsPresent).toBe(true);
    const keys = parsed.outputs.map((o) => o.key).sort();
    expect(keys).toEqual(["dem", "mesh", "orthophoto", "point_cloud"]);
    for (const output of parsed.outputs) {
      expect(output.exists).toBe(true);
      expect(output.nonZeroSize).toBe(true);
    }
  });

  it("info reports stub version and reflects running task count", async () => {
    const client = createStubNodeOdmClient();
    const info0 = await client.info();
    expect(info0.version).toBe("stub-2.5.3");
    expect(info0.taskQueueCount).toBe(0);
    await client.createTask();
    const info1 = await client.info();
    expect(info1.taskQueueCount).toBe(1);
  });
});

describe("createConfiguredNodeOdmClient mode switch", () => {
  it("returns the stub when AERIAL_NODEODM_MODE=stub", async () => {
    vi.stubEnv("AERIAL_NODEODM_MODE", "stub");
    vi.stubEnv("NODE_ENV", "test");
    const client = createConfiguredNodeOdmClient();
    expect(client).not.toBeNull();
    const uuid = await client!.createTask({ name: "mode-switch" });
    expect(uuid).toMatch(/^stub-task-/);
  });

  it("throws when AERIAL_NODEODM_MODE=stub and NODE_ENV=production", () => {
    vi.stubEnv("AERIAL_NODEODM_MODE", "stub");
    vi.stubEnv("NODE_ENV", "production");
    expect(() => createConfiguredNodeOdmClient()).toThrow(/disallowed in production/);
  });

  it("returns null when no URL and no stub mode (real mode, unconfigured)", () => {
    vi.stubEnv("AERIAL_NODEODM_MODE", "");
    vi.stubEnv("AERIAL_NODEODM_URL", "");
    expect(createConfiguredNodeOdmClient()).toBeNull();
  });

  it("returns a real NodeOdmClient when AERIAL_NODEODM_URL is set and mode is not stub", async () => {
    vi.stubEnv("AERIAL_NODEODM_MODE", "");
    vi.stubEnv("AERIAL_NODEODM_URL", "http://localhost:3001");
    const client = createConfiguredNodeOdmClient();
    expect(client).not.toBeNull();
    expect(client?.createTask.name).toBe("createTask");
  });
});
