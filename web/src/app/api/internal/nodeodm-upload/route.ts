import { NextRequest, NextResponse } from "next/server";

import { createLogger, extractRequestId } from "@/lib/logging";
import {
  buildUploadCheckpointPatch,
  computeBatchSlice,
  extractNodeOdmUploadCursor,
  isImageFilename,
  pickLatestSessionByMission,
  shouldEscalateFailure,
  UPLOAD_CHUNK_SIZE,
  type IngestSessionRow,
  type NodeOdmJobRow,
  type NodeOdmUploadCursor,
} from "@/lib/nodeodm-upload";
import { createConfiguredNodeOdmClient, getNodeOdmAdapterConfig } from "@/lib/nodeodm/config";
import { NodeOdmError, isNodeOdmError } from "@/lib/nodeodm/errors";
import {
  adminSelect,
  insertJobEvent,
  updateProcessingJob,
} from "@/lib/supabase/admin";
import { downloadStorageBytes, listStorageObjects } from "@/lib/supabase/admin-storage";
import type { Json } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

function isAuthorized(request: NextRequest) {
  const configuredSecret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");

  if (configuredSecret) {
    return authorization === `Bearer ${configuredSecret}`;
  }

  const userAgent = request.headers.get("user-agent") ?? "";
  return userAgent.startsWith("vercel-cron/");
}

async function fetchActiveUploadCursors(): Promise<NodeOdmUploadCursor[]> {
  const rows = await adminSelect<NodeOdmJobRow[]>(
    "drone_processing_jobs?status=eq.running&stage=eq.intake_review&select=id,org_id,mission_id,status,stage,output_summary",
  );
  return rows
    .map(extractNodeOdmUploadCursor)
    .filter((cursor): cursor is NodeOdmUploadCursor => cursor !== null);
}

async function fetchSessionsForMissions(
  missionIds: string[],
): Promise<Map<string, IngestSessionRow>> {
  if (missionIds.length === 0) return new Map();
  const inList = missionIds.map((id) => encodeURIComponent(id)).join(",");
  const query =
    `drone_ingest_sessions?mission_id=in.(${inList})` +
    `&extracted_dataset_path=not.is.null` +
    `&select=id,mission_id,extracted_dataset_path,updated_at`;
  const rows = await adminSelect<IngestSessionRow[]>(query);
  return pickLatestSessionByMission(rows);
}

type UploadableImage = { name: string; size: number | null };

async function listDatasetImages(datasetPath: string): Promise<UploadableImage[]> {
  const prefix = datasetPath.replace(/^\/+/, "").replace(/\/+$/, "");
  const entries = await listStorageObjects({ prefix, limit: 1000 });
  return entries
    .filter((entry) => isImageFilename(entry.name))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((entry) => ({ name: entry.name, size: entry.size }));
}

type UploadAttemptResult =
  | { ok: true; uploadedCount: number; committed: boolean }
  | { ok: false; retryCount: number; message: string; escalated: boolean };

async function uploadChunk(
  client: NonNullable<ReturnType<typeof createConfiguredNodeOdmClient>>,
  taskUuid: string,
  datasetPath: string,
  images: UploadableImage[],
  offset: number,
  chunkStart: number,
  chunkEnd: number,
): Promise<void> {
  const prefix = datasetPath.replace(/^\/+/, "").replace(/\/+$/, "");
  const slice = images.slice(chunkStart, chunkEnd);
  const files = await Promise.all(
    slice.map(async (image) => ({
      blob: await downloadStorageBytes({ path: `${prefix}/${image.name}` }),
      filename: image.name,
    })),
  );
  await client.uploadImages(taskUuid, files);
}

async function advanceUploadForCursor(
  cursor: NodeOdmUploadCursor,
  session: IngestSessionRow | undefined,
): Promise<UploadAttemptResult | { ok: false; skipped: "no-session" | "no-images"; message: string }> {
  if (!session || !session.extracted_dataset_path) {
    return { ok: false, skipped: "no-session", message: "no extracted_dataset_path for mission" };
  }
  const client = createConfiguredNodeOdmClient();
  if (!client) {
    return { ok: false, retryCount: cursor.retryCount, message: "client-not-configured", escalated: false };
  }

  const datasetPath = session.extracted_dataset_path;
  const images = await listDatasetImages(datasetPath);
  if (images.length === 0) {
    return { ok: false, skipped: "no-images", message: `no images at ${datasetPath}` };
  }

  const totalCount = cursor.totalCount ?? images.length;
  const slice = computeBatchSlice({
    uploadedCount: cursor.uploadedCount,
    totalCount,
    chunkSize: UPLOAD_CHUNK_SIZE,
  });

  try {
    for (const chunk of slice.chunks) {
      await uploadChunk(client, cursor.taskUuid, datasetPath, images, slice.offset, chunk.start, chunk.end);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const nextRetry = cursor.retryCount + 1;
    const escalated = shouldEscalateFailure({ retryCount: nextRetry });
    if (escalated) {
      try {
        await client.cancelTask(cursor.taskUuid);
      } catch (cancelError) {
        // non-fatal; the task row moves to failed either way
        void cancelError;
      }
    }
    return { ok: false, retryCount: nextRetry, message, escalated };
  }

  const newUploadedCount = slice.sliceEnd;
  let committed = false;
  if (slice.isFinalBatch && newUploadedCount >= totalCount) {
    try {
      await client.commitTask(cursor.taskUuid);
      committed = true;
    } catch (error) {
      if (error instanceof NodeOdmError) {
        return { ok: false, retryCount: cursor.retryCount + 1, message: `commit: ${error.message}`, escalated: false };
      }
      throw error;
    }
  }

  return { ok: true, uploadedCount: newUploadedCount, committed };
}

async function applyUploadResult(
  cursor: NodeOdmUploadCursor,
  totalCount: number,
  result: Awaited<ReturnType<typeof advanceUploadForCursor>>,
): Promise<{ jobId: string; outcome: string; detail: Record<string, unknown> }> {
  const now = new Date().toISOString();
  if ("skipped" in result) {
    return { jobId: cursor.jobId, outcome: `skipped:${result.skipped}`, detail: { message: result.message } };
  }
  if (result.ok) {
    const uploadState = result.committed ? "committed" : "uploading";
    const patch = buildUploadCheckpointPatch({
      priorSummary: cursor.summary,
      uploadState,
      uploadedCount: result.uploadedCount,
      totalCount,
      retryCount: cursor.retryCount,
      lastUploadAttemptAt: now,
      committedAt: result.committed ? now : undefined,
    });
    await updateProcessingJob(cursor.jobId, patch as Parameters<typeof updateProcessingJob>[1]);
    if (result.committed) {
      await insertJobEvent({
        job_id: cursor.jobId,
        org_id: cursor.orgId,
        event_type: "nodeodm.task.committed",
        payload: {
          taskUuid: cursor.taskUuid,
          uploadedCount: result.uploadedCount,
          totalCount,
        } as Json,
      });
    } else {
      await insertJobEvent({
        job_id: cursor.jobId,
        org_id: cursor.orgId,
        event_type: "nodeodm.task.uploading",
        payload: {
          taskUuid: cursor.taskUuid,
          uploadedCount: result.uploadedCount,
          totalCount,
        } as Json,
      });
    }
    return {
      jobId: cursor.jobId,
      outcome: result.committed ? "committed" : "uploading",
      detail: { uploadedCount: result.uploadedCount, totalCount },
    };
  }

  const uploadState = result.escalated ? "failed" : "uploading";
  const patch = buildUploadCheckpointPatch({
    priorSummary: cursor.summary,
    uploadState,
    uploadedCount: cursor.uploadedCount,
    totalCount,
    retryCount: result.retryCount,
    lastUploadAttemptAt: now,
    lastUploadError: result.message,
  });
  const jobPatch: Record<string, unknown> = { ...patch };
  if (result.escalated) {
    jobPatch.status = "failed";
    jobPatch.stage = "failed";
  }
  await updateProcessingJob(cursor.jobId, jobPatch as Parameters<typeof updateProcessingJob>[1]);
  await insertJobEvent({
    job_id: cursor.jobId,
    org_id: cursor.orgId,
    event_type: result.escalated ? "nodeodm.task.upload_failed" : "nodeodm.task.upload_retrying",
    payload: {
      taskUuid: cursor.taskUuid,
      retryCount: result.retryCount,
      error: result.message,
    } as Json,
  });
  return {
    jobId: cursor.jobId,
    outcome: result.escalated ? "failed" : "retrying",
    detail: { retryCount: result.retryCount, error: result.message },
  };
}

export async function GET(request: NextRequest) {
  const log = createLogger("api.internal.nodeodm-upload", {
    requestId: extractRequestId(request),
  });
  const startedAtMs = Date.now();

  if (!isAuthorized(request)) {
    log.warn("blocked.unauthorized");
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const invokedAt = new Date().toISOString();
  const config = getNodeOdmAdapterConfig();
  if (!config.configured) {
    log.info("skip.unconfigured");
    return NextResponse.json({
      ok: true,
      invokedAt,
      configured: false,
      note: "NodeODM adapter not configured (AERIAL_NODEODM_URL missing). Nothing to upload.",
      processed: 0,
    });
  }

  try {
    const cursors = await fetchActiveUploadCursors();
    const missionIds = Array.from(
      new Set(cursors.map((c) => c.missionId).filter((id): id is string => typeof id === "string")),
    );
    const sessionsByMission = await fetchSessionsForMissions(missionIds);
    const processed: Array<{ jobId: string; outcome: string; detail: Record<string, unknown> }> = [];
    const failures: Array<{ jobId: string; error: string }> = [];

    for (const cursor of cursors) {
      try {
        const session = cursor.missionId ? sessionsByMission.get(cursor.missionId) : undefined;
        const images = session?.extracted_dataset_path
          ? await listDatasetImages(session.extracted_dataset_path)
          : [];
        const totalCount = cursor.totalCount ?? images.length;
        const result = await advanceUploadForCursor(cursor, session);
        const outcome = await applyUploadResult(cursor, totalCount, result);
        processed.push(outcome);
        log.info("job.advanced", { jobId: cursor.jobId, outcome: outcome.outcome });
      } catch (error) {
        if (isNodeOdmError(error)) {
          failures.push({ jobId: cursor.jobId, error: `${error.kind}: ${error.message}` });
          log.warn("job.failed", { jobId: cursor.jobId, kind: error.kind, message: error.message });
        } else {
          failures.push({
            jobId: cursor.jobId,
            error: error instanceof Error ? error.message : "unknown-error",
          });
          log.error("job.error", { jobId: cursor.jobId, error });
        }
      }
    }

    log.info("tick.complete", {
      processed: processed.length,
      failures: failures.length,
      durationMs: Date.now() - startedAtMs,
    });

    return NextResponse.json({
      ok: true,
      invokedAt,
      configured: true,
      processed: processed.length,
      details: processed,
      failures,
    });
  } catch (error) {
    log.error("tick.failed", { error, durationMs: Date.now() - startedAtMs });
    return NextResponse.json(
      {
        ok: false,
        invokedAt,
        error: error instanceof Error ? error.message : "unknown-error",
      },
      { status: 500 },
    );
  }
}
