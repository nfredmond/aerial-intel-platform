import {
  buildProcessingCallback,
  type ProcessingArtifact,
  type ProcessingArtifactKind,
  type ProcessingCallbackStatus,
  PROCESSING_ARTIFACT_KINDS,
} from "@/lib/external-processing";
import {
  adminSelect,
  selectExternalProcessingRequestsByStatus,
  updateExternalProcessingRequest,
  type ExternalProcessingRequestRow,
} from "@/lib/supabase/admin";
import { createSignedDownloadUrl } from "@/lib/supabase/admin-storage";

export const ARTIFACT_URL_TTL_SECONDS = 24 * 60 * 60;
export const CALLBACK_TIMEOUT_MS = 10_000;

/**
 * A terminal callback the consumer keeps rejecting is retried once per cron
 * tick up to this many attempts, then the row is closed out with the delivery
 * failure recorded — the alternative is a row stuck "processing" forever.
 */
export const CALLBACK_ABANDON_ATTEMPTS = 8;

const TERMINAL_CALLBACK_STATUSES: ProcessingCallbackStatus[] = ["succeeded", "failed", "canceled"];

const ROW_STATUS_BY_TERMINAL_CALLBACK: Record<string, string> = {
  succeeded: "completed",
  failed: "failed",
  canceled: "canceled",
};

const CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
  tif: "image/tiff",
  tiff: "image/tiff",
  laz: "application/vnd.las",
  las: "application/vnd.las",
  obj: "model/obj",
  ply: "application/octet-stream",
};

export type ExternalCallbackJobView = {
  id: string;
  org_id: string;
  status: string;
  output_summary: Record<string, unknown> | null;
};

export type ExternalCallbackPlan = {
  status: ProcessingCallbackStatus;
  progress: number | null;
  message: string | null;
  terminal: boolean;
};

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function asOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function jobProgress(summary: Record<string, unknown>): number | null {
  const nodeodm = asRecord(summary.nodeodm);
  return typeof nodeodm.progress === "number" && Number.isFinite(nodeodm.progress)
    ? Math.min(100, Math.max(0, Math.round(nodeodm.progress)))
    : null;
}

function runningMessage(summary: Record<string, unknown>): string | null {
  const checkpoint = asOptionalString(summary.latestCheckpoint);
  if (checkpoint) return checkpoint;
  const nodeodm = asRecord(summary.nodeodm);
  const statusName = asOptionalString(nodeodm.statusName);
  return statusName ? `NodeODM task ${statusName}` : null;
}

function failureMessage(summary: Record<string, unknown>): string {
  const nodeodm = asRecord(summary.nodeodm);
  return (
    asOptionalString(nodeodm.statusMessage) ??
    asOptionalString(nodeodm.lastUploadError) ??
    asOptionalString(nodeodm.lastImportError) ??
    "Processing failed on the NodeODM pipeline."
  );
}

/**
 * Decide which callback (if any) a request row owes its consumer given the
 * job's current state. Pure so the decision table is unit-testable; returns
 * null when the consumer is already up to date.
 */
export function planExternalCallback(
  row: Pick<ExternalProcessingRequestRow, "last_callback_status" | "last_callback_progress">,
  job: Pick<ExternalCallbackJobView, "status" | "output_summary">,
): ExternalCallbackPlan | null {
  if (
    row.last_callback_status &&
    TERMINAL_CALLBACK_STATUSES.includes(row.last_callback_status as ProcessingCallbackStatus)
  ) {
    return null;
  }

  const summary = asRecord(job.output_summary);

  if (job.status === "succeeded") {
    return { status: "succeeded", progress: 100, message: null, terminal: true };
  }
  if (job.status === "failed") {
    return { status: "failed", progress: null, message: failureMessage(summary), terminal: true };
  }
  if (job.status === "canceled") {
    return { status: "canceled", progress: null, message: "Processing was canceled on the platform.", terminal: true };
  }

  // queued / running / needs_review: the job is still in flight from the
  // consumer's perspective. Emit "running" on the first transition and again
  // whenever reported progress moves.
  const progress = jobProgress(summary);
  if (row.last_callback_status === "running") {
    if (progress === null || progress === row.last_callback_progress) {
      return null;
    }
  }
  return { status: "running", progress, message: runningMessage(summary), terminal: false };
}

type ProcessingOutputRow = {
  kind: string;
  storage_bucket: string | null;
  storage_path: string | null;
  metadata: Record<string, unknown> | null;
};

function contentTypeForPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return CONTENT_TYPE_BY_EXTENSION[ext] ?? "application/octet-stream";
}

async function collectJobArtifacts(job: ExternalCallbackJobView): Promise<ProcessingArtifact[]> {
  const outputs = await adminSelect<ProcessingOutputRow[]>(
    `drone_processing_outputs?job_id=eq.${encodeURIComponent(job.id)}&org_id=eq.${encodeURIComponent(job.org_id)}&status=eq.ready&select=kind,storage_bucket,storage_path,metadata`,
  );

  const artifacts: ProcessingArtifact[] = [];
  for (const output of outputs) {
    if (!(PROCESSING_ARTIFACT_KINDS as readonly string[]).includes(output.kind)) continue;
    if (!output.storage_path) continue;
    const signedUrl = await createSignedDownloadUrl({
      bucket: output.storage_bucket ?? undefined,
      path: output.storage_path,
      expiresInSeconds: ARTIFACT_URL_TTL_SECONDS,
    });
    const metadata = asRecord(output.metadata);
    const sizeBytes = typeof metadata.sizeBytes === "number" ? metadata.sizeBytes : undefined;
    artifacts.push({
      kind: output.kind as ProcessingArtifactKind,
      downloadUrl: signedUrl,
      expiresAt: new Date(Date.now() + ARTIFACT_URL_TTL_SECONDS * 1000).toISOString(),
      ...(sizeBytes !== undefined ? { sizeBytes } : {}),
      contentType: contentTypeForPath(output.storage_path),
    });
  }
  return artifacts;
}

async function deliverProcessingCallback(
  callbackUrl: string,
  callback: ReturnType<typeof buildProcessingCallback>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const token = process.env.AERIAL_PROCESSING_CALLBACK_TOKEN;
  if (!token) {
    return { ok: false, error: "AERIAL_PROCESSING_CALLBACK_TOKEN is not configured" };
  }

  try {
    const response = await fetch(callbackUrl, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(callback),
      signal: AbortSignal.timeout(CALLBACK_TIMEOUT_MS),
    });
    if (!response.ok) {
      return { ok: false, error: `callback endpoint returned ${response.status}` };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "callback delivery failed" };
  }
}

export type ExternalCallbackOutcome = {
  requestId: string;
  jobId: string;
  emitted: ProcessingCallbackStatus | null;
  delivered: boolean;
  error: string | null;
};

/**
 * Reconcile external request rows against their jobs and deliver any owed
 * ProcessingCallbacks. Called from the nodeodm-poll cron (immediately after
 * it advances jobs) and from the external-ingest cron as the catch-up sweep
 * for transitions the poll loop never sees (upload-lane failures, user
 * cancellations, missed deliveries).
 */
export async function reconcileExternalProcessingCallbacks(options?: {
  jobIds?: string[];
}): Promise<ExternalCallbackOutcome[]> {
  const jobIdFilter = options?.jobIds;
  if (jobIdFilter && jobIdFilter.length === 0) return [];

  const rows = (await selectExternalProcessingRequestsByStatus(["processing"])).filter(
    (row) => row.job_id && (!jobIdFilter || jobIdFilter.includes(row.job_id)),
  );
  if (rows.length === 0) return [];

  const jobIds = Array.from(new Set(rows.map((row) => row.job_id as string)));
  const jobs = await adminSelect<ExternalCallbackJobView[]>(
    `drone_processing_jobs?id=in.(${jobIds.map((id) => encodeURIComponent(id)).join(",")})&select=id,org_id,status,output_summary`,
  );
  const jobsById = new Map(jobs.map((job) => [job.id, job]));

  const outcomes: ExternalCallbackOutcome[] = [];
  for (const row of rows) {
    const job = jobsById.get(row.job_id as string);
    if (!job || job.org_id !== row.org_id) continue;

    const plan = planExternalCallback(row, job);
    if (!plan) continue;

    const summary = asRecord(job.output_summary);
    let artifacts: ProcessingArtifact[] | undefined;
    if (plan.status === "succeeded") {
      artifacts = await collectJobArtifacts(job);
    }

    const callback = buildProcessingCallback({
      requestId: row.request_id,
      jobReference: job.id,
      status: plan.status,
      progress: plan.progress,
      message: plan.message,
      ...(artifacts ? { artifacts } : {}),
      ...(plan.status === "succeeded" && typeof summary.benchmarkSummary === "object" && summary.benchmarkSummary
        ? { benchmarkSummary: summary.benchmarkSummary as Record<string, unknown> }
        : {}),
    });

    const delivery = await deliverProcessingCallback(row.callback_url, callback);

    if (delivery.ok) {
      await updateExternalProcessingRequest(row.id, row.org_id, {
        last_callback_status: plan.status,
        last_callback_progress: plan.progress,
        last_callback_at: callback.occurredAt,
        callback_attempts: 0,
        last_callback_error: null,
        ...(plan.terminal ? { status: ROW_STATUS_BY_TERMINAL_CALLBACK[plan.status] } : {}),
      });
      outcomes.push({ requestId: row.request_id, jobId: job.id, emitted: plan.status, delivered: true, error: null });
    } else {
      const attempts = row.callback_attempts + 1;
      const abandon = plan.terminal && attempts >= CALLBACK_ABANDON_ATTEMPTS;
      await updateExternalProcessingRequest(row.id, row.org_id, {
        callback_attempts: attempts,
        last_callback_error: abandon
          ? `delivery abandoned after ${attempts} attempts: ${delivery.error}`
          : delivery.error,
        ...(abandon ? { status: ROW_STATUS_BY_TERMINAL_CALLBACK[plan.status] } : {}),
      });
      outcomes.push({ requestId: row.request_id, jobId: job.id, emitted: plan.status, delivered: false, error: delivery.error });
    }
  }

  return outcomes;
}
