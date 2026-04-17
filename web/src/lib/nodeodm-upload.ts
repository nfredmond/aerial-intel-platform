export type NodeOdmUploadState = "pending" | "uploading" | "committed" | "failed";

export const UPLOAD_BATCH_CAP = 50;
export const UPLOAD_CHUNK_SIZE = 10;
export const UPLOAD_RETRY_THRESHOLD = 3;

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".tif", ".tiff"]);

export function isImageFilename(name: string): boolean {
  const lower = name.toLowerCase();
  const dot = lower.lastIndexOf(".");
  if (dot < 0) return false;
  return IMAGE_EXTENSIONS.has(lower.slice(dot));
}

export type NodeOdmJobRow = {
  id: string;
  org_id: string;
  mission_id: string | null;
  status: string;
  stage: string | null;
  output_summary: Record<string, unknown> | null;
};

export type NodeOdmUploadCursor = {
  jobId: string;
  orgId: string;
  missionId: string | null;
  taskUuid: string;
  uploadState: NodeOdmUploadState;
  uploadedCount: number;
  totalCount: number | null;
  retryCount: number;
  summary: Record<string, unknown>;
  nodeodm: Record<string, unknown>;
};

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function asInt(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : fallback;
}

function asUploadState(value: unknown): NodeOdmUploadState | null {
  if (value === "pending" || value === "uploading" || value === "committed" || value === "failed") {
    return value;
  }
  return null;
}

export function extractNodeOdmUploadCursor(row: NodeOdmJobRow): NodeOdmUploadCursor | null {
  const summary = asRecord(row.output_summary);
  const nodeodm = asRecord(summary.nodeodm);
  const taskUuid = typeof nodeodm.taskUuid === "string" ? nodeodm.taskUuid : null;
  if (!taskUuid) return null;
  const uploadState = asUploadState(nodeodm.uploadState) ?? "pending";
  if (uploadState === "committed" || uploadState === "failed") return null;
  return {
    jobId: row.id,
    orgId: row.org_id,
    missionId: row.mission_id,
    taskUuid,
    uploadState,
    uploadedCount: asInt(nodeodm.uploadedCount, 0),
    totalCount: typeof nodeodm.totalCount === "number" ? nodeodm.totalCount : null,
    retryCount: asInt(nodeodm.uploadRetryCount, 0),
    summary,
    nodeodm,
  };
}

export type IngestSessionRow = {
  id: string;
  mission_id: string | null;
  extracted_dataset_path: string | null;
  updated_at: string | null;
};

export function pickLatestSessionByMission(
  sessions: IngestSessionRow[],
): Map<string, IngestSessionRow> {
  const byMission = new Map<string, IngestSessionRow>();
  for (const session of sessions) {
    if (!session.mission_id || !session.extracted_dataset_path) continue;
    const existing = byMission.get(session.mission_id);
    if (!existing) {
      byMission.set(session.mission_id, session);
      continue;
    }
    const existingStamp = existing.updated_at ?? "";
    const candidateStamp = session.updated_at ?? "";
    if (candidateStamp > existingStamp) {
      byMission.set(session.mission_id, session);
    }
  }
  return byMission;
}

export type BatchSlice = {
  offset: number;
  sliceEnd: number;
  isFinalBatch: boolean;
  chunks: Array<{ start: number; end: number }>;
};

export function computeBatchSlice(input: {
  uploadedCount: number;
  totalCount: number;
  batchCap?: number;
  chunkSize?: number;
}): BatchSlice {
  const batchCap = input.batchCap ?? UPLOAD_BATCH_CAP;
  const chunkSize = input.chunkSize ?? UPLOAD_CHUNK_SIZE;
  const offset = Math.max(0, input.uploadedCount);
  const remaining = Math.max(0, input.totalCount - offset);
  const sliceSize = Math.min(remaining, batchCap);
  const sliceEnd = offset + sliceSize;
  const chunks: Array<{ start: number; end: number }> = [];
  for (let start = offset; start < sliceEnd; start += chunkSize) {
    chunks.push({ start, end: Math.min(start + chunkSize, sliceEnd) });
  }
  return {
    offset,
    sliceEnd,
    isFinalBatch: sliceEnd >= input.totalCount,
    chunks,
  };
}

export function shouldEscalateFailure(input: {
  retryCount: number;
  threshold?: number;
}): boolean {
  const threshold = input.threshold ?? UPLOAD_RETRY_THRESHOLD;
  return input.retryCount >= threshold;
}

export type UploadCheckpointInput = {
  priorSummary: Record<string, unknown>;
  uploadState: NodeOdmUploadState;
  uploadedCount: number;
  totalCount: number | null;
  retryCount: number;
  lastUploadAttemptAt: string;
  lastUploadError?: string | null;
  committedAt?: string | null;
};

export function buildUploadCheckpointPatch(input: UploadCheckpointInput): {
  output_summary: Record<string, unknown>;
} {
  const priorNodeodm = asRecord(input.priorSummary.nodeodm);
  const mergedNodeodm: Record<string, unknown> = {
    ...priorNodeodm,
    uploadState: input.uploadState,
    uploadedCount: input.uploadedCount,
    totalCount: input.totalCount,
    uploadRetryCount: input.retryCount,
    lastUploadAttemptAt: input.lastUploadAttemptAt,
  };
  if (input.lastUploadError !== undefined) {
    mergedNodeodm.lastUploadError = input.lastUploadError;
  }
  if (input.committedAt !== undefined) {
    mergedNodeodm.uploadCommittedAt = input.committedAt;
  }
  return {
    output_summary: {
      ...input.priorSummary,
      nodeodm: mergedNodeodm,
    },
  };
}
