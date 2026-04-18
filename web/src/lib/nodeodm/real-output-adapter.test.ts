import { describe, expect, it } from "vitest";

import { parseManagedBenchmarkSummaryText } from "@/lib/managed-processing-import";

import {
  inventoryNodeOdmBundle,
  synthesizeBenchmarkSummary,
} from "./real-output-adapter";

const bytes = (n: number) => new Uint8Array(n);

describe("inventoryNodeOdmBundle", () => {
  it("finds each canonical output independently", () => {
    const inventory = inventoryNodeOdmBundle({
      "odm_orthophoto/odm_orthophoto.tif": bytes(32),
      "odm_dem/dsm.tif": bytes(16),
      "odm_dem/dtm.tif": bytes(24),
      "odm_georeferencing/odm_georeferenced_model.laz": bytes(64),
      "odm_texturing/odm_textured_model_geo.obj": bytes(8),
      "logs/run.log": bytes(4),
    });
    expect(inventory.hasBenchmarkSummary).toBe(false);
    expect(inventory.orthophoto).toEqual({
      path: "odm_orthophoto/odm_orthophoto.tif",
      sizeBytes: 32,
    });
    expect(inventory.dsm?.sizeBytes).toBe(16);
    expect(inventory.dtm?.sizeBytes).toBe(24);
    expect(inventory.pointCloud?.path).toBe(
      "odm_georeferencing/odm_georeferenced_model.laz",
    );
    expect(inventory.mesh?.path).toBe("odm_texturing/odm_textured_model_geo.obj");
    expect(inventory.entryCount).toBe(6);
  });

  it("reports benchmark_summary presence when found", () => {
    const inventory = inventoryNodeOdmBundle({
      "benchmark_summary.json": bytes(128),
    });
    expect(inventory.hasBenchmarkSummary).toBe(true);
  });

  it("returns null slots for missing outputs", () => {
    const inventory = inventoryNodeOdmBundle({
      "odm_orthophoto/odm_orthophoto.tif": bytes(10),
    });
    expect(inventory.orthophoto?.sizeBytes).toBe(10);
    expect(inventory.dsm).toBeNull();
    expect(inventory.dtm).toBeNull();
    expect(inventory.pointCloud).toBeNull();
    expect(inventory.mesh).toBeNull();
  });

  it("accepts entwine_pointcloud/ept.json as a point cloud variant", () => {
    const inventory = inventoryNodeOdmBundle({
      "entwine_pointcloud/ept.json": bytes(200),
    });
    expect(inventory.pointCloud?.path).toBe("entwine_pointcloud/ept.json");
  });

  it("accepts the non-geo textured model variant", () => {
    const inventory = inventoryNodeOdmBundle({
      "odm_texturing/odm_textured_model.obj": bytes(50),
    });
    expect(inventory.mesh?.path).toBe("odm_texturing/odm_textured_model.obj");
  });

  it("prefers the _geo variant when both mesh variants are present", () => {
    const inventory = inventoryNodeOdmBundle({
      "odm_texturing/odm_textured_model_geo.obj": bytes(10),
      "odm_texturing/odm_textured_model.obj": bytes(20),
    });
    expect(inventory.mesh?.path).toBe("odm_texturing/odm_textured_model_geo.obj");
  });

  it("still reports a zero-byte entry as present for downstream non_zero_size flagging", () => {
    const inventory = inventoryNodeOdmBundle({
      "odm_orthophoto/odm_orthophoto.tif": bytes(0),
    });
    expect(inventory.orthophoto).toEqual({
      path: "odm_orthophoto/odm_orthophoto.tif",
      sizeBytes: 0,
    });
  });
});

describe("synthesizeBenchmarkSummary", () => {
  const importedAt = "2026-04-18T12:00:00.000Z";
  const taskUuid = "11111111-2222-3333-4444-555555555555";

  it("round-trips through parseManagedBenchmarkSummaryText for a full bundle", () => {
    const inventory = inventoryNodeOdmBundle({
      "odm_orthophoto/odm_orthophoto.tif": bytes(32),
      "odm_dem/dsm.tif": bytes(16),
      "odm_georeferencing/odm_georeferenced_model.laz": bytes(64),
      "odm_texturing/odm_textured_model_geo.obj": bytes(8),
    });
    const summary = synthesizeBenchmarkSummary(inventory, { taskUuid, importedAt });
    const parsed = parseManagedBenchmarkSummaryText(JSON.stringify(summary));

    expect(parsed.status).toBe("success");
    expect(parsed.requiredOutputsPresent).toBe(true);
    expect(parsed.minimumPass).toBe(true);
    expect(parsed.missingRequiredOutputs).toEqual([]);

    const ortho = parsed.outputs.find((o) => o.key === "orthophoto");
    expect(ortho).toMatchObject({ exists: true, nonZeroSize: true, sizeBytes: 32 });
  });

  it("flags partial status when orthophoto is missing", () => {
    const inventory = inventoryNodeOdmBundle({
      "odm_dem/dsm.tif": bytes(16),
    });
    const summary = synthesizeBenchmarkSummary(inventory, { taskUuid, importedAt });
    const parsed = parseManagedBenchmarkSummaryText(JSON.stringify(summary));

    expect(parsed.status).toBe("partial");
    expect(parsed.requiredOutputsPresent).toBe(false);
    expect(parsed.missingRequiredOutputs).toContain("orthophoto");

    const ortho = parsed.outputs.find((o) => o.key === "orthophoto");
    expect(ortho).toMatchObject({ exists: false, nonZeroSize: false, sizeBytes: 0 });
  });

  it("flags partial when orthophoto exists but is zero bytes", () => {
    const inventory = inventoryNodeOdmBundle({
      "odm_orthophoto/odm_orthophoto.tif": bytes(0),
      "odm_dem/dsm.tif": bytes(16),
    });
    const summary = synthesizeBenchmarkSummary(inventory, { taskUuid, importedAt });
    const parsed = parseManagedBenchmarkSummaryText(JSON.stringify(summary));

    expect(parsed.status).toBe("partial");
    expect(parsed.requiredOutputsPresent).toBe(false);

    const ortho = parsed.outputs.find((o) => o.key === "orthophoto");
    expect(ortho).toMatchObject({ exists: true, nonZeroSize: false, sizeBytes: 0 });
  });

  it("embeds taskUuid and source marker in the synthesized summary", () => {
    const inventory = inventoryNodeOdmBundle({});
    const summary = synthesizeBenchmarkSummary(inventory, { taskUuid, importedAt });
    expect(summary.source).toBe("nodeodm-real-bundle");
    expect(summary.task_uuid).toBe(taskUuid);
    expect(summary.project_name).toBe(`nodeodm-${taskUuid.slice(0, 8)}`);
  });

  it("empty bundle produces partial status with both missing outputs", () => {
    const inventory = inventoryNodeOdmBundle({});
    const summary = synthesizeBenchmarkSummary(inventory, { taskUuid, importedAt });
    const parsed = parseManagedBenchmarkSummaryText(JSON.stringify(summary));

    expect(parsed.status).toBe("partial");
    expect(parsed.missingRequiredOutputs.sort()).toEqual(["dem", "orthophoto"]);
  });
});
