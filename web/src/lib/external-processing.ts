import type { NodeOdmPreset } from "@/lib/nodeodm/presets";

/**
 * Shared contract between this platform (the ODM processing worker) and a
 * consumer planning application such as OpenPlan.
 *
 * The wire shapes here MUST stay in lockstep with
 * schemas/aerial_processing_contract.schema.json (committed identically to
 * both repositories); a unit test parses that schema and fails on drift.
 */
export const EXTERNAL_PROCESSING_SCHEMA_VERSION = "natford-aerial-processing.v1";

export const CONTRACT_PRESET_IDS = ["fast-preview", "balanced", "high-quality"] as const;
export type ContractPresetId = (typeof CONTRACT_PRESET_IDS)[number];

/**
 * The contract deliberately abstracts over this platform's NodeODM preset
 * vocabulary so the consumer never depends on adapter internals.
 */
export const CONTRACT_PRESET_TO_NODEODM: Record<ContractPresetId, NodeOdmPreset["id"]> = {
  "fast-preview": "fast-ortho",
  balanced: "balanced",
  "high-quality": "high-quality-3d",
};

export const PROCESSING_CALLBACK_STATUSES = [
  "accepted",
  "running",
  "succeeded",
  "failed",
  "canceled",
] as const;
export type ProcessingCallbackStatus = (typeof PROCESSING_CALLBACK_STATUSES)[number];

export const PROCESSING_ARTIFACT_KINDS = [
  "orthomosaic",
  "dsm",
  "dtm",
  "point_cloud",
  "mesh",
] as const;
export type ProcessingArtifactKind = (typeof PROCESSING_ARTIFACT_KINDS)[number];

export type ProcessingArtifact = {
  kind: ProcessingArtifactKind;
  downloadUrl: string;
  expiresAt: string;
  sizeBytes?: number;
  contentType?: string;
};

export type ExternalProcessingRequest = {
  schemaVersion: typeof EXTERNAL_PROCESSING_SCHEMA_VERSION;
  requestId: string;
  callbackUrl: string;
  externalRef: {
    system: string;
    missionId: string;
    workspaceId: string;
    projectId?: string;
  };
  missionTitle: string;
  imagery: {
    type: "zip_url";
    url: string;
    imageCount?: number;
    sizeBytes?: number;
  };
  presetId: ContractPresetId;
  notes?: string;
};

export type ProcessingCallback = {
  schemaVersion: typeof EXTERNAL_PROCESSING_SCHEMA_VERSION;
  requestId: string;
  callbackId: string;
  jobReference: string;
  status: ProcessingCallbackStatus;
  occurredAt: string;
  progress?: number;
  message?: string;
  artifacts?: ProcessingArtifact[];
  benchmarkSummary?: Record<string, unknown>;
};

export type ParseProcessingRequestResult =
  | { ok: true; request: ExternalProcessingRequest }
  | { ok: false; errors: string[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function checkNoExtraKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  where: string,
  errors: string[],
) {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) {
      errors.push(`${where}: unknown property "${key}"`);
    }
  }
}

/**
 * The contract carries signed URLs in both directions; require https so a
 * token can never authorize a plaintext exfiltration target. Localhost is
 * exempt for local development loops.
 */
export function isAcceptableContractUrl(value: unknown): value is string {
  if (!isNonEmptyString(value)) return false;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  if (parsed.protocol === "https:") return true;
  if (parsed.protocol !== "http:") return false;
  return parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
}

function isContractPresetId(value: unknown): value is ContractPresetId {
  return (
    typeof value === "string" && (CONTRACT_PRESET_IDS as readonly string[]).includes(value)
  );
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1;
}

export function parseProcessingRequest(body: unknown): ParseProcessingRequestResult {
  const errors: string[] = [];
  if (!isRecord(body)) {
    return { ok: false, errors: ["request body must be a JSON object"] };
  }

  checkNoExtraKeys(
    body,
    ["schemaVersion", "requestId", "callbackUrl", "externalRef", "missionTitle", "imagery", "presetId", "notes"],
    "request",
    errors,
  );

  if (body.schemaVersion !== EXTERNAL_PROCESSING_SCHEMA_VERSION) {
    errors.push(`schemaVersion must be "${EXTERNAL_PROCESSING_SCHEMA_VERSION}"`);
  }

  const requestId = body.requestId;
  if (typeof requestId !== "string" || requestId.length < 8 || requestId.length > 128) {
    errors.push("requestId must be a string of 8-128 characters");
  }

  if (!isAcceptableContractUrl(body.callbackUrl)) {
    errors.push("callbackUrl must be an https URL (http allowed for localhost only)");
  }

  const externalRef = body.externalRef;
  if (!isRecord(externalRef)) {
    errors.push("externalRef must be an object");
  } else {
    checkNoExtraKeys(externalRef, ["system", "missionId", "workspaceId", "projectId"], "externalRef", errors);
    if (!isNonEmptyString(externalRef.system)) errors.push("externalRef.system is required");
    if (!isNonEmptyString(externalRef.missionId)) errors.push("externalRef.missionId is required");
    if (!isNonEmptyString(externalRef.workspaceId)) errors.push("externalRef.workspaceId is required");
    if (externalRef.projectId !== undefined && !isNonEmptyString(externalRef.projectId)) {
      errors.push("externalRef.projectId must be a non-empty string when present");
    }
  }

  const missionTitle = body.missionTitle;
  if (typeof missionTitle !== "string" || missionTitle.trim().length < 1 || missionTitle.length > 256) {
    errors.push("missionTitle must be a string of 1-256 characters");
  }

  const imagery = body.imagery;
  if (!isRecord(imagery)) {
    errors.push("imagery must be an object");
  } else {
    checkNoExtraKeys(imagery, ["type", "url", "imageCount", "sizeBytes"], "imagery", errors);
    if (imagery.type !== "zip_url") errors.push('imagery.type must be "zip_url"');
    if (!isAcceptableContractUrl(imagery.url)) {
      errors.push("imagery.url must be an https URL (http allowed for localhost only)");
    }
    if (imagery.imageCount !== undefined && !isPositiveInteger(imagery.imageCount)) {
      errors.push("imagery.imageCount must be a positive integer when present");
    }
    if (imagery.sizeBytes !== undefined && !isPositiveInteger(imagery.sizeBytes)) {
      errors.push("imagery.sizeBytes must be a positive integer when present");
    }
  }

  if (body.presetId !== undefined && !isContractPresetId(body.presetId)) {
    errors.push(`presetId must be one of: ${CONTRACT_PRESET_IDS.join(", ")}`);
  }

  if (body.notes !== undefined && (typeof body.notes !== "string" || body.notes.length > 2048)) {
    errors.push("notes must be a string of at most 2048 characters when present");
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const ref = externalRef as Record<string, string>;
  const img = imagery as Record<string, unknown>;
  return {
    ok: true,
    request: {
      schemaVersion: EXTERNAL_PROCESSING_SCHEMA_VERSION,
      requestId: requestId as string,
      callbackUrl: body.callbackUrl as string,
      externalRef: {
        system: ref.system.trim(),
        missionId: ref.missionId.trim(),
        workspaceId: ref.workspaceId.trim(),
        ...(ref.projectId !== undefined ? { projectId: ref.projectId.trim() } : {}),
      },
      missionTitle: (missionTitle as string).trim(),
      imagery: {
        type: "zip_url",
        url: img.url as string,
        ...(img.imageCount !== undefined ? { imageCount: img.imageCount as number } : {}),
        ...(img.sizeBytes !== undefined ? { sizeBytes: img.sizeBytes as number } : {}),
      },
      presetId: isContractPresetId(body.presetId) ? body.presetId : "balanced",
      ...(body.notes !== undefined ? { notes: body.notes as string } : {}),
    },
  };
}

export function buildProcessingCallback(input: {
  requestId: string;
  jobReference: string;
  status: ProcessingCallbackStatus;
  occurredAt?: string;
  progress?: number | null;
  message?: string | null;
  artifacts?: ProcessingArtifact[];
  benchmarkSummary?: Record<string, unknown> | null;
}): ProcessingCallback {
  if (input.status === "succeeded" && !input.artifacts) {
    throw new Error("a succeeded ProcessingCallback must carry artifacts");
  }
  return {
    schemaVersion: EXTERNAL_PROCESSING_SCHEMA_VERSION,
    requestId: input.requestId,
    callbackId: crypto.randomUUID(),
    jobReference: input.jobReference,
    status: input.status,
    occurredAt: input.occurredAt ?? new Date().toISOString(),
    ...(typeof input.progress === "number"
      ? { progress: Math.min(100, Math.max(0, Math.round(input.progress))) }
      : {}),
    ...(input.message ? { message: input.message.slice(0, 2048) } : {}),
    ...(input.artifacts ? { artifacts: input.artifacts } : {}),
    ...(input.benchmarkSummary ? { benchmarkSummary: input.benchmarkSummary } : {}),
  };
}
