import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildProcessingCallback,
  CONTRACT_PRESET_IDS,
  CONTRACT_PRESET_TO_NODEODM,
  EXTERNAL_PROCESSING_SCHEMA_VERSION,
  isAcceptableContractUrl,
  parseProcessingRequest,
  PROCESSING_ARTIFACT_KINDS,
  PROCESSING_CALLBACK_STATUSES,
} from "./external-processing";
import { getPreset } from "./nodeodm/presets";

const CONTRACT_SCHEMA = path.resolve(
  __dirname,
  "../../../schemas/aerial_processing_contract.schema.json",
);

function validRequestBody() {
  return {
    schemaVersion: EXTERNAL_PROCESSING_SCHEMA_VERSION,
    requestId: "req-openplan-0001",
    callbackUrl: "https://openplan.example.com/api/aerial/processing-callback",
    externalRef: {
      system: "openplan",
      missionId: "8c1a4a52-13ab-4f01-9f7e-0b34ed9a6f10",
      workspaceId: "b7a7e6a2-91d0-4f7f-8b7e-1a2b3c4d5e6f",
    },
    missionTitle: "Corridor survey — 5th Street",
    imagery: {
      type: "zip_url",
      url: "https://storage.example.com/signed/imagery.zip?token=abc",
      imageCount: 42,
      sizeBytes: 1024,
    },
    presetId: "balanced",
  };
}

describe("contract pinning against schemas/aerial_processing_contract.schema.json", () => {
  const schema = JSON.parse(readFileSync(CONTRACT_SCHEMA, "utf8"));

  it("matches the schemaVersion const", () => {
    expect(schema.$defs.ProcessingRequest.properties.schemaVersion.const).toBe(
      EXTERNAL_PROCESSING_SCHEMA_VERSION,
    );
  });

  it("matches the preset id enum", () => {
    expect(schema.$defs.ProcessingRequest.properties.presetId.enum).toEqual([
      ...CONTRACT_PRESET_IDS,
    ]);
  });

  it("matches the callback status enum", () => {
    expect(schema.$defs.ProcessingCallback.properties.status.enum).toEqual([
      ...PROCESSING_CALLBACK_STATUSES,
    ]);
  });

  it("matches the artifact kind enum", () => {
    expect(schema.$defs.ProcessingCallback.properties.artifacts.items.properties.kind.enum).toEqual(
      [...PROCESSING_ARTIFACT_KINDS],
    );
  });
});

describe("CONTRACT_PRESET_TO_NODEODM", () => {
  it("maps every contract preset onto a real NodeODM preset", () => {
    for (const contractId of CONTRACT_PRESET_IDS) {
      const nodeOdmId = CONTRACT_PRESET_TO_NODEODM[contractId];
      expect(getPreset(nodeOdmId)).toBeDefined();
    }
  });
});

describe("parseProcessingRequest", () => {
  it("accepts a valid request and defaults presetId to balanced", () => {
    const body = validRequestBody();
    delete (body as Record<string, unknown>).presetId;
    const result = parseProcessingRequest(body);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.request.presetId).toBe("balanced");
    expect(result.request.externalRef.system).toBe("openplan");
    expect(result.request.imagery.imageCount).toBe(42);
  });

  it("rejects a wrong schemaVersion", () => {
    const result = parseProcessingRequest({ ...validRequestBody(), schemaVersion: "v2" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.join(" ")).toContain("schemaVersion");
  });

  it("rejects a short requestId", () => {
    const result = parseProcessingRequest({ ...validRequestBody(), requestId: "short" });
    expect(result.ok).toBe(false);
  });

  it("rejects unknown top-level and nested properties (additionalProperties: false)", () => {
    const withTopLevel = parseProcessingRequest({ ...validRequestBody(), extra: 1 });
    expect(withTopLevel.ok).toBe(false);

    const body = validRequestBody();
    (body.imagery as Record<string, unknown>).surprise = true;
    const withNested = parseProcessingRequest(body);
    expect(withNested.ok).toBe(false);
  });

  it("rejects plain-http URLs except on localhost", () => {
    const remote = parseProcessingRequest({
      ...validRequestBody(),
      callbackUrl: "http://openplan.example.com/callback",
    });
    expect(remote.ok).toBe(false);

    const local = parseProcessingRequest({
      ...validRequestBody(),
      callbackUrl: "http://localhost:3000/api/aerial/processing-callback",
    });
    expect(local.ok).toBe(true);
  });

  it("rejects a missing externalRef field and a bad preset", () => {
    const body = validRequestBody();
    delete (body.externalRef as Record<string, unknown>).workspaceId;
    expect(parseProcessingRequest(body).ok).toBe(false);

    expect(
      parseProcessingRequest({ ...validRequestBody(), presetId: "ultra" }).ok,
    ).toBe(false);
  });

  it("rejects a non-zip imagery type and a fractional imageCount", () => {
    const badType = validRequestBody();
    (badType.imagery as Record<string, unknown>).type = "folder";
    expect(parseProcessingRequest(badType).ok).toBe(false);

    const badCount = validRequestBody();
    (badCount.imagery as Record<string, unknown>).imageCount = 1.5;
    expect(parseProcessingRequest(badCount).ok).toBe(false);
  });
});

describe("isAcceptableContractUrl", () => {
  it("accepts https anywhere and http only on localhost", () => {
    expect(isAcceptableContractUrl("https://example.com/a.zip")).toBe(true);
    expect(isAcceptableContractUrl("http://127.0.0.1:9000/a.zip")).toBe(true);
    expect(isAcceptableContractUrl("http://example.com/a.zip")).toBe(false);
    expect(isAcceptableContractUrl("ftp://example.com/a.zip")).toBe(false);
    expect(isAcceptableContractUrl("not a url")).toBe(false);
  });
});

describe("buildProcessingCallback", () => {
  it("builds a schema-shaped callback with a fresh callbackId", () => {
    const callback = buildProcessingCallback({
      requestId: "req-openplan-0001",
      jobReference: "job-1",
      status: "running",
      progress: 41.7,
      message: "NodeODM task running",
    });
    expect(callback.schemaVersion).toBe(EXTERNAL_PROCESSING_SCHEMA_VERSION);
    expect(callback.callbackId.length).toBeGreaterThanOrEqual(8);
    expect(callback.progress).toBe(42);
    expect(callback.occurredAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    const second = buildProcessingCallback({
      requestId: "req-openplan-0001",
      jobReference: "job-1",
      status: "running",
    });
    expect(second.callbackId).not.toBe(callback.callbackId);
    expect(second.progress).toBeUndefined();
  });

  it("refuses a succeeded callback without artifacts", () => {
    expect(() =>
      buildProcessingCallback({
        requestId: "req-openplan-0001",
        jobReference: "job-1",
        status: "succeeded",
      }),
    ).toThrow(/artifacts/);
  });
});
