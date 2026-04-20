import {
  updateArtifactHandoffMetadata,
  type ArtifactMetadataRecord,
} from "@/lib/artifact-handoff";
import type { Json } from "@/lib/supabase/types";

type JsonRecord = Record<string, Json | undefined>;

type RetryOutputSeedInput = {
  id: string;
  kind: string;
  status: string;
  storage_bucket: string | null;
  storage_path: string | null;
  metadata: Json | null;
  mission_id: string | null;
  dataset_id: string | null;
};

function asRecord(value: Json | null | undefined): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as JsonRecord;
}

function rewriteRetryStoragePath(storagePath: string | null, previousJobId: string, nextJobId: string) {
  if (!storagePath) {
    return null;
  }

  return storagePath.includes(`/jobs/${previousJobId}/`)
    ? storagePath.replace(`/jobs/${previousJobId}/`, `/jobs/${nextJobId}/`)
    : storagePath;
}

export function buildRetryJobInputSummary(options: {
  inputSummary: Json | null | undefined;
  engine: string;
  previousJobId: string;
}): JsonRecord {
  const inputSummary = asRecord(options.inputSummary);
  const existingName = typeof inputSummary.name === "string" && inputSummary.name.trim().length > 0
    ? inputSummary.name
    : `${options.engine.toUpperCase()} job`;

  return {
    ...inputSummary,
    name: `${existingName} retry`,
    retryOfJobId: options.previousJobId,
  };
}

export function buildRetryJobOutputSummary(options: {
  outputSummary: Json | null | undefined;
  previousJobId: string;
}): JsonRecord {
  const outputSummary = asRecord(options.outputSummary);

  return {
    ...outputSummary,
    eta: "Pending queue pickup",
    notes: `Retry requested from job ${options.previousJobId}.`,
    latestCheckpoint: "Retry queued",
    stageChecklist: [
      { label: "Queue handoff", status: "pending" },
      { label: "Orthomosaic", status: "pending" },
      { label: "DSM", status: "pending" },
      { label: "Point cloud", status: "pending" },
      { label: "Mission brief", status: "pending" },
    ],
    logTail: [
      `Retry requested from job ${options.previousJobId}.`,
      "Awaiting worker pickup.",
    ],
  };
}

export function buildRetryOutputSeeds(options: {
  outputs: RetryOutputSeedInput[];
  orgId: string;
  nextJobId: string;
  previousJobId: string;
}) {
  return options.outputs.map((output) => {
    const metadata = asRecord(output.metadata);
    const resetMetadata = updateArtifactHandoffMetadata(metadata as ArtifactMetadataRecord, {
      reviewedAt: null,
      reviewedByEmail: null,
      sharedAt: null,
      sharedByEmail: null,
      exportedAt: null,
      exportedByEmail: null,
      nextAction: null,
      note:
        typeof metadata.name === "string" && metadata.name.trim().length > 0
          ? `Retry placeholder restaged from prior job ${options.previousJobId}. Re-review this regenerated artifact before sharing.`
          : `Retry placeholder restaged from prior job ${options.previousJobId}. Re-review before sharing.`,
    });

    return {
      org_id: options.orgId,
      job_id: options.nextJobId,
      mission_id: output.mission_id,
      dataset_id: output.dataset_id,
      kind: output.kind,
      status: "pending",
      storage_bucket: output.storage_bucket,
      storage_path: rewriteRetryStoragePath(output.storage_path, options.previousJobId, options.nextJobId),
      metadata: {
        ...resetMetadata,
        delivery:
          output.kind === "report"
            ? "Share/export pending"
            : output.kind === "point_cloud"
              ? "Hold for QA"
              : "Review pending",
      },
    };
  });
}
