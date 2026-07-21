import { NextRequest, NextResponse } from "next/server";

import { launchNodeOdmTask } from "@/lib/dispatch-adapter-nodeodm";
import {
  CONTRACT_PRESET_TO_NODEODM,
  type ContractPresetId,
} from "@/lib/external-processing";
import { reconcileExternalProcessingCallbacks } from "@/lib/external-processing-callbacks";
import { checkCronAuth } from "@/lib/internal-route-auth";
import { createLogger, extractRequestId } from "@/lib/logging";
import { getNodeOdmAdapterConfig } from "@/lib/nodeodm/config";
import {
  adminSelect,
  insertJobEvent,
  selectExternalProcessingRequestsByStatus,
  updateDataset,
  updateExternalProcessingRequest,
  updateIngestSession,
  updateProcessingJob,
  type ExternalProcessingRequestRow,
} from "@/lib/supabase/admin";
import { uploadStorageBytes } from "@/lib/supabase/admin-storage";
import type { Json } from "@/lib/supabase/types";
import { streamZipImages } from "@/lib/zip-extraction";

export const dynamic = "force-dynamic";

export const MAX_INGEST_ATTEMPTS = 3;

/**
 * An 'ingesting' row younger than this is assumed to belong to a still-running
 * cron invocation (large ZIPs take a while); older ones are treated as crashed
 * claims and retried.
 */
export const INGEST_CLAIM_STALE_MS = 15 * 60 * 1000;

type ExternalJobRow = {
  id: string;
  org_id: string;
  status: string;
  output_summary: Record<string, unknown> | null;
};

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

export function shouldSkipIngestRow(
  row: Pick<ExternalProcessingRequestRow, "status" | "updated_at">,
  nowMs: number,
): boolean {
  if (row.status !== "ingesting") return false;
  const updatedMs = Date.parse(row.updated_at);
  return Number.isFinite(updatedMs) && nowMs - updatedMs < INGEST_CLAIM_STALE_MS;
}

function nodeOdmPresetFor(row: ExternalProcessingRequestRow) {
  const presetId = row.preset_id as ContractPresetId;
  return CONTRACT_PRESET_TO_NODEODM[presetId] ?? "balanced";
}

/** Permanent failures fail the JOB; the callback reconciler then closes the row. */
async function failJobPermanently(options: {
  row: ExternalProcessingRequestRow;
  jobId: string;
  reason: string;
}) {
  const jobs = await adminSelect<ExternalJobRow[]>(
    `drone_processing_jobs?id=eq.${encodeURIComponent(options.jobId)}&select=id,org_id,status,output_summary`,
  );
  const job = jobs[0];
  const summary = asRecord(job?.output_summary);
  const nodeodm = asRecord(summary.nodeodm);
  await updateProcessingJob(options.jobId, options.row.org_id, {
    status: "failed",
    stage: "failed",
    output_summary: {
      ...summary,
      latestCheckpoint: `External imagery ingest failed: ${options.reason}`,
      nodeodm: { ...nodeodm, statusMessage: options.reason },
    } as Json,
  });
  await insertJobEvent({
    org_id: options.row.org_id,
    job_id: options.jobId,
    event_type: "external.ingest.failed",
    payload: { requestId: options.row.request_id, reason: options.reason } as Json,
  });
  await updateExternalProcessingRequest(options.row.id, options.row.org_id, {
    status: "processing",
    ingest_error: options.reason,
  });
}

async function ingestRow(
  row: ExternalProcessingRequestRow,
  orgSlug: string,
): Promise<{ outcome: string; detail: Record<string, unknown> }> {
  if (!row.mission_id || !row.dataset_id || !row.ingest_session_id || !row.job_id) {
    // A crashed accept left the row unlinked; the consumer's idempotent retry
    // repairs it through the endpoint, so the cron only reports it.
    return { outcome: "skipped:unlinked", detail: { requestId: row.request_id } };
  }
  const jobId = row.job_id;

  const attempts = row.ingest_attempts + 1;
  await updateExternalProcessingRequest(row.id, row.org_id, {
    status: "ingesting",
    ingest_attempts: attempts,
  });

  if (attempts > MAX_INGEST_ATTEMPTS) {
    const reason = row.ingest_error
      ? `imagery ingest gave up after ${MAX_INGEST_ATTEMPTS} attempts (last error: ${row.ingest_error})`
      : `imagery ingest gave up after ${MAX_INGEST_ATTEMPTS} attempts`;
    await failJobPermanently({ row, jobId, reason });
    return { outcome: "failed:attempts-exhausted", detail: { requestId: row.request_id } };
  }

  const jobs = await adminSelect<ExternalJobRow[]>(
    `drone_processing_jobs?id=eq.${encodeURIComponent(jobId)}&select=id,org_id,status,output_summary`,
  );
  const job = jobs[0];
  if (!job) {
    return { outcome: "skipped:missing-job", detail: { requestId: row.request_id } };
  }
  const summary = asRecord(job.output_summary);
  const priorNodeodm = asRecord(summary.nodeodm);

  // A crash after launch but before the row patch leaves a job that already
  // holds a task; never launch a second one.
  if (typeof priorNodeodm.taskUuid === "string" && priorNodeodm.taskUuid.length > 0) {
    await updateExternalProcessingRequest(row.id, row.org_id, {
      status: "processing",
      ingest_error: null,
    });
    return { outcome: "repaired:already-launched", detail: { requestId: row.request_id } };
  }

  const response = await fetch(row.imagery_url, { redirect: "follow" });
  if (!response.ok || !response.body) {
    throw new Error(`imagery ZIP download failed (${response.status})`);
  }

  const destPath = `${orgSlug}/missions/${row.mission_id}/extracted/${row.ingest_session_id}`;
  const { imageCount } = await streamZipImages(response.body, async (image) => {
    await uploadStorageBytes({
      path: `${destPath}/${image.name}`,
      bytes: image.bytes,
      upsert: true,
    });
  });

  if (imageCount === 0) {
    await failJobPermanently({
      row,
      jobId,
      reason: "the imagery ZIP contained no usable images",
    });
    return { outcome: "failed:no-images", detail: { requestId: row.request_id } };
  }

  await updateIngestSession(row.ingest_session_id, row.org_id, {
    extracted_dataset_path: destPath,
    image_count: imageCount,
    status: "extracted",
  });
  await updateDataset(row.dataset_id, row.org_id, { status: "ready" });

  const launch = await launchNodeOdmTask({ jobId, presetId: nodeOdmPresetFor(row) });
  if (!launch.ok) {
    throw new Error(`NodeODM launch failed (${launch.kind}): ${launch.message}`);
  }

  await updateProcessingJob(jobId, row.org_id, {
    status: "running",
    stage: "intake_review",
    started_at: new Date().toISOString(),
    output_summary: {
      ...summary,
      eta: "Awaiting image upload to NodeODM",
      latestCheckpoint: `Imagery ingested (${imageCount} images); NodeODM task queued`,
      nodeodm: {
        ...priorNodeodm,
        taskUuid: launch.taskUuid,
        presetId: launch.presetId,
        adapterLabel: launch.adapterLabel,
        acceptedAt: launch.acceptedAt,
        lastPolledAt: null,
        statusCode: 10,
        statusName: "queued",
        progress: 0,
        uploadState: "pending",
      },
    } as Json,
  });
  await insertJobEvent({
    org_id: row.org_id,
    job_id: jobId,
    event_type: "nodeodm.task.queued",
    payload: {
      taskUuid: launch.taskUuid,
      source: "external-ingest",
      requestId: row.request_id,
      imageCount,
    } as Json,
  });
  await updateExternalProcessingRequest(row.id, row.org_id, {
    status: "processing",
    ingest_error: null,
  });

  return {
    outcome: "launched",
    detail: { requestId: row.request_id, imageCount, taskUuid: launch.taskUuid },
  };
}

export async function GET(request: NextRequest) {
  const log = createLogger("api.internal.external-ingest", {
    requestId: extractRequestId(request),
  });
  const startedAtMs = Date.now();

  const auth = checkCronAuth(request);
  if (!auth.ok) {
    log.warn(auth.reason === "missing-secret" ? "blocked.cron-secret-missing" : "blocked.unauthorized");
    return NextResponse.json(
      auth.reason === "missing-secret"
        ? { ok: false, error: "cron-secret-not-configured" }
        : { ok: false, error: "unauthorized" },
      { status: 401 },
    );
  }

  const invokedAt = new Date().toISOString();
  const config = getNodeOdmAdapterConfig();
  if (!config.configured) {
    log.info("skip.unconfigured");
    return NextResponse.json({
      ok: true,
      invokedAt,
      configured: false,
      note: "NodeODM adapter not configured (AERIAL_NODEODM_URL missing). External ingest is paused.",
      processed: 0,
    });
  }

  try {
    const rows = await selectExternalProcessingRequestsByStatus(["received", "ingesting"]);
    const eligible = rows.filter((row) => !shouldSkipIngestRow(row, Date.now()));

    const orgIds = Array.from(new Set(eligible.map((row) => row.org_id)));
    const orgs = orgIds.length
      ? await adminSelect<Array<{ id: string; slug: string | null }>>(
          `drone_orgs?id=in.(${orgIds.map((id) => encodeURIComponent(id)).join(",")})&select=id,slug`,
        )
      : [];
    const slugByOrgId = new Map(orgs.map((org) => [org.id, org.slug?.trim() || org.id]));

    const processed: Array<{ requestId: string; outcome: string; detail: Record<string, unknown> }> = [];
    const failures: Array<{ requestId: string; error: string }> = [];

    for (const row of eligible) {
      try {
        const result = await ingestRow(row, slugByOrgId.get(row.org_id) ?? row.org_id);
        processed.push({ requestId: row.request_id, ...result });
        log.info("request.advanced", { requestId: row.request_id, outcome: result.outcome });
      } catch (error) {
        const message = error instanceof Error ? error.message : "unknown-error";
        failures.push({ requestId: row.request_id, error: message });
        log.warn("request.failed", { requestId: row.request_id, error: message });
        try {
          await updateExternalProcessingRequest(row.id, row.org_id, {
            status: "received",
            ingest_error: message,
          });
        } catch (patchError) {
          log.error("request.error-patch-failed", { requestId: row.request_id, error: patchError });
        }
      }
    }

    // Catch-up sweep: emits any owed callbacks (including failures recorded
    // above and transitions the poll loop missed) and closes terminal rows.
    let callbacks: Awaited<ReturnType<typeof reconcileExternalProcessingCallbacks>> = [];
    try {
      callbacks = await reconcileExternalProcessingCallbacks();
    } catch (error) {
      log.error("callbacks.reconcile-failed", { error });
    }

    log.info("tick.complete", {
      processed: processed.length,
      failures: failures.length,
      callbacks: callbacks.length,
      durationMs: Date.now() - startedAtMs,
    });

    return NextResponse.json({
      ok: true,
      invokedAt,
      configured: true,
      processed: processed.length,
      details: processed,
      failures,
      callbacks,
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
