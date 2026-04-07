import { adminSelect, insertJobEvent, updateProcessingJob } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/types";

import { getManagedDispatchAdapterState, isManagedProcessingJobRecord } from "@/lib/managed-processing";

type JsonRecord = Record<string, Json | undefined>;

type ManagedJobRow = {
  id: string;
  org_id: string;
  status: string;
  stage: string;
  progress: number;
  preset_id: string | null;
  input_summary: Json | null;
  output_summary: Json | null;
  external_job_reference: string | null;
  started_at: string | null;
  completed_at: string | null;
};

export const DISPATCH_CALLBACK_CONTRACT_VERSION = "aerial-dispatch-adapter-callback.v1" as const;

export type DispatchCallbackStatus = "accepted" | "running" | "awaiting_output_import" | "failed" | "canceled";

export type DispatchCallbackPayload = {
  contractVersion: typeof DISPATCH_CALLBACK_CONTRACT_VERSION;
  callbackId: string;
  requestId: string;
  callbackAt: string;
  orgId: string;
  job: {
    id: string;
  };
  externalRunReference?: string | null;
  status: DispatchCallbackStatus;
  progress?: number | null;
  workerStage?: string | null;
  message?: string | null;
  dispatch?: {
    hostLabel?: string | null;
    workerLabel?: string | null;
  } | null;
  metrics?: {
    queuePosition?: number | null;
    startedAt?: string | null;
    finishedAt?: string | null;
  } | null;
};

export type DispatchCallbackResult = {
  ok: true;
  action: "updated" | "noop";
  jobId: string;
  status: string;
  stage: string;
  progress: number;
};

function asRecord(value: Json | null | undefined) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {} as JsonRecord;
  }

  return value as JsonRecord;
}

function normalizeOptionalString(value: string | null | undefined) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function normalizeIsoString(value: string | null | undefined) {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    return null;
  }

  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function normalizeProgress(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(100, Math.max(0, Math.round(value)))
    : null;
}

function getDispatchCallbackToken() {
  return normalizeOptionalString(process.env.AERIAL_DISPATCH_CALLBACK_TOKEN)
    ?? normalizeOptionalString(process.env.AERIAL_DISPATCH_ADAPTER_TOKEN);
}

export function isDispatchCallbackAuthorized(authorizationHeader: string | null) {
  const token = getDispatchCallbackToken();
  if (!token) {
    return false;
  }

  return authorizationHeader === `Bearer ${token}`;
}

export async function getManagedJobForDispatchCallback(orgId: string, jobId: string) {
  const rows = await adminSelect<ManagedJobRow[]>(
    `drone_processing_jobs?id=eq.${encodeURIComponent(jobId)}&org_id=eq.${encodeURIComponent(orgId)}&select=id,org_id,status,stage,progress,preset_id,input_summary,output_summary,external_job_reference,started_at,completed_at`,
  );

  return rows[0] ?? null;
}

function summarizeCallbackStatus(status: DispatchCallbackStatus) {
  switch (status) {
    case "accepted":
      return {
        title: "Dispatch callback accepted",
        detail: "The worker/adapter acknowledged the job and reported it as accepted.",
        eta: "Worker accepted; awaiting active processing update",
      } as const;
    case "running":
      return {
        title: "Dispatch callback running",
        detail: "The worker/adapter reported active processing.",
        eta: "Worker processing in progress",
      } as const;
    case "awaiting_output_import":
      return {
        title: "Worker finished compute; awaiting import",
        detail: "The worker/adapter reported compute completion, but the app still needs real output import before QA or delivery can proceed.",
        eta: "Awaiting output import",
      } as const;
    case "failed":
      return {
        title: "Dispatch callback failed",
        detail: "The worker/adapter reported a failed processing state.",
        eta: "Worker-reported failure",
      } as const;
    case "canceled":
      return {
        title: "Dispatch callback canceled",
        detail: "The worker/adapter reported the run as canceled.",
        eta: "Worker-reported cancellation",
      } as const;
  }
}

function buildLogTail(input: {
  callback: DispatchCallbackPayload;
  summary: ReturnType<typeof summarizeCallbackStatus>;
  fallbackExternalRunReference: string | null;
}) {
  const lines = [
    `Dispatch callback recorded: ${input.callback.status}.`,
    `Request ID: ${input.callback.requestId}.`,
    `External run reference: ${normalizeOptionalString(input.callback.externalRunReference) ?? input.fallbackExternalRunReference ?? "not supplied"}.`,
  ];

  const workerStage = normalizeOptionalString(input.callback.workerStage);
  if (workerStage) {
    lines.push(`Worker stage: ${workerStage}.`);
  }

  const hostLabel = normalizeOptionalString(input.callback.dispatch?.hostLabel);
  const workerLabel = normalizeOptionalString(input.callback.dispatch?.workerLabel);
  if (hostLabel) {
    lines.push(`Host: ${hostLabel}${workerLabel ? ` / ${workerLabel}` : ""}.`);
  }

  const message = normalizeOptionalString(input.callback.message);
  if (message) {
    lines.push(`Worker message: ${message}`);
  }

  lines.push(input.summary.detail);
  if (input.callback.status === "awaiting_output_import") {
    lines.push("Do not start QA or claim delivery until real outputs are attached/imported.");
  }

  return lines;
}

function buildStageChecklist(status: DispatchCallbackStatus) {
  const outputsImportedStatus = status === "awaiting_output_import" ? "running" : "pending";

  return [
    { label: "Intake review", status: "complete" },
    { label: "Host dispatch", status: "complete" },
    { label: "Outputs imported", status: outputsImportedStatus },
    { label: "QA review", status: "pending" },
    { label: "Delivery recorded", status: "pending" },
  ];
}

export function parseDispatchCallbackPayload(body: unknown): DispatchCallbackPayload {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Dispatch callback body must be a JSON object.");
  }

  const record = body as Record<string, unknown>;
  const contractVersion = record.contractVersion;
  if (contractVersion !== DISPATCH_CALLBACK_CONTRACT_VERSION) {
    throw new Error(`Unsupported dispatch callback contract version: ${String(contractVersion ?? "missing")}`);
  }

  const callbackId = normalizeOptionalString(record.callbackId as string | null | undefined);
  const requestId = normalizeOptionalString(record.requestId as string | null | undefined);
  const callbackAt = normalizeIsoString(record.callbackAt as string | null | undefined);
  const orgId = normalizeOptionalString(record.orgId as string | null | undefined);
  const status = normalizeOptionalString(record.status as string | null | undefined) as DispatchCallbackStatus | null;

  const jobRecord = record.job && typeof record.job === "object" && !Array.isArray(record.job)
    ? record.job as Record<string, unknown>
    : null;
  const jobId = normalizeOptionalString(jobRecord?.id as string | null | undefined);

  if (!callbackId || !requestId || !callbackAt || !orgId || !jobId || !status) {
    throw new Error("Dispatch callback must include callbackId, requestId, callbackAt, orgId, job.id, and status.");
  }

  if (!["accepted", "running", "awaiting_output_import", "failed", "canceled"].includes(status)) {
    throw new Error(`Unsupported dispatch callback status: ${status}`);
  }

  const dispatchRecord = record.dispatch && typeof record.dispatch === "object" && !Array.isArray(record.dispatch)
    ? record.dispatch as Record<string, unknown>
    : null;
  const metricsRecord = record.metrics && typeof record.metrics === "object" && !Array.isArray(record.metrics)
    ? record.metrics as Record<string, unknown>
    : null;

  return {
    contractVersion: DISPATCH_CALLBACK_CONTRACT_VERSION,
    callbackId,
    requestId,
    callbackAt,
    orgId,
    job: { id: jobId },
    externalRunReference: normalizeOptionalString(record.externalRunReference as string | null | undefined),
    status,
    progress: normalizeProgress(record.progress),
    workerStage: normalizeOptionalString(record.workerStage as string | null | undefined),
    message: normalizeOptionalString(record.message as string | null | undefined),
    dispatch: dispatchRecord
      ? {
          hostLabel: normalizeOptionalString(dispatchRecord.hostLabel as string | null | undefined),
          workerLabel: normalizeOptionalString(dispatchRecord.workerLabel as string | null | undefined),
        }
      : null,
    metrics: metricsRecord
      ? {
          queuePosition: typeof metricsRecord.queuePosition === "number" && Number.isFinite(metricsRecord.queuePosition)
            ? metricsRecord.queuePosition
            : null,
          startedAt: normalizeIsoString(metricsRecord.startedAt as string | null | undefined),
          finishedAt: normalizeIsoString(metricsRecord.finishedAt as string | null | undefined),
        }
      : null,
  };
}

export async function applyDispatchCallback(payload: DispatchCallbackPayload): Promise<DispatchCallbackResult> {
  const job = await getManagedJobForDispatchCallback(payload.orgId, payload.job.id);
  if (!job) {
    throw new Error("Managed processing job not found for dispatch callback.");
  }

  if (!isManagedProcessingJobRecord(job)) {
    throw new Error("Dispatch callback target is not a managed processing job.");
  }

  const outputSummary = asRecord(job.output_summary);
  const adapterState = getManagedDispatchAdapterState(outputSummary);

  if (adapterState.requestId && adapterState.requestId !== payload.requestId) {
    throw new Error("Dispatch callback requestId does not match the recorded launch request.");
  }

  const callbackExternalRunReference = normalizeOptionalString(payload.externalRunReference);
  if (
    callbackExternalRunReference
    && job.external_job_reference
    && callbackExternalRunReference !== job.external_job_reference
  ) {
    throw new Error("Dispatch callback external run reference does not match the recorded job reference.");
  }

  if (
    adapterState.callbackId
    && adapterState.callbackId === payload.callbackId
    && adapterState.callbackStatus === payload.status
  ) {
    return {
      ok: true,
      action: "noop",
      jobId: job.id,
      status: job.status,
      stage: job.stage,
      progress: job.progress,
    };
  }

  const now = new Date().toISOString();
  const callbackSummary = summarizeCallbackStatus(payload.status);
  const externalRunReference = callbackExternalRunReference ?? job.external_job_reference ?? adapterState.externalRunReference;
  const reportedProgress = normalizeProgress(payload.progress);

  let nextStatus = job.status;
  let nextStage = job.stage;
  let nextProgress = job.progress;
  let nextQueuePosition: number | null | undefined = null;
  let nextStartedAt = job.started_at;
  let nextCompletedAt = job.completed_at;

  switch (payload.status) {
    case "accepted":
      nextStatus = "running";
      nextStage = "processing";
      nextProgress = Math.max(job.progress, reportedProgress ?? 45);
      nextStartedAt = job.started_at ?? payload.metrics?.startedAt ?? now;
      nextCompletedAt = null;
      nextQueuePosition = payload.metrics?.queuePosition ?? null;
      break;
    case "running":
      nextStatus = "running";
      nextStage = "processing";
      nextProgress = Math.max(job.progress, reportedProgress ?? 55);
      nextStartedAt = job.started_at ?? payload.metrics?.startedAt ?? now;
      nextCompletedAt = null;
      nextQueuePosition = payload.metrics?.queuePosition ?? null;
      break;
    case "awaiting_output_import":
      nextStatus = "running";
      nextStage = "processing";
      nextProgress = Math.max(job.progress, reportedProgress ?? 75);
      nextStartedAt = job.started_at ?? payload.metrics?.startedAt ?? now;
      nextCompletedAt = null;
      nextQueuePosition = null;
      break;
    case "failed":
      nextStatus = "failed";
      nextStage = "failed";
      nextProgress = reportedProgress ?? job.progress;
      nextCompletedAt = payload.metrics?.finishedAt ?? payload.callbackAt;
      nextQueuePosition = null;
      break;
    case "canceled":
      nextStatus = "canceled";
      nextStage = "canceled";
      nextProgress = reportedProgress ?? job.progress;
      nextCompletedAt = payload.metrics?.finishedAt ?? payload.callbackAt;
      nextQueuePosition = null;
      break;
  }

  const message = normalizeOptionalString(payload.message);
  const workerStage = normalizeOptionalString(payload.workerStage);

  const nextOutputSummary = {
    ...outputSummary,
    workflowMode: "managed_processing_v1",
    serviceModel: "operator_assisted",
    eta: callbackSummary.eta,
    latestCheckpoint: callbackSummary.title,
    notes: payload.status === "awaiting_output_import"
      ? "Worker/adapter reported compute completion. The app still requires real output import before QA review or delivery-ready status can be claimed."
      : payload.status === "failed"
        ? `Worker/adapter reported a failure${message ? `: ${message}` : "."}`
        : payload.status === "canceled"
          ? `Worker/adapter reported cancellation${message ? `: ${message}` : "."}`
          : `Worker/adapter status sync recorded${message ? `: ${message}` : "."}`,
    deliveryPosture: payload.status === "awaiting_output_import"
      ? "Compute may be complete, but outputs still need to be imported before QA or delivery can close."
      : payload.status === "failed"
        ? "No client-facing deliverables should be promised until the worker failure is resolved and a real run succeeds."
        : payload.status === "canceled"
          ? "This run is canceled. Re-dispatch or retry before promising outputs."
          : "Dispatch adapter status sync is active. Outputs still need real import before QA or delivery can close.",
    dispatchAdapter: {
      ...asRecord(outputSummary.dispatchAdapter as Json | undefined),
      mode: adapterState.mode,
      adapterLabel: adapterState.adapterLabel,
      endpoint: adapterState.endpoint,
      requestId: payload.requestId,
      status: adapterState.status ?? "accepted",
      responseStatus: adapterState.responseStatus,
      externalRunReference,
      lastError: payload.status === "failed" ? (message ?? adapterState.lastError) : null,
      lastAttemptAt: adapterState.lastAttemptAt,
      acceptedAt: adapterState.acceptedAt,
      callbackStatus: payload.status,
      callbackId: payload.callbackId,
      lastCallbackAt: payload.callbackAt,
      workerStage,
      lastMessage: message,
      reportedProgress: reportedProgress ?? null,
    },
    stageChecklist: buildStageChecklist(payload.status),
    logTail: buildLogTail({
      callback: payload,
      summary: callbackSummary,
      fallbackExternalRunReference: externalRunReference ?? null,
    }),
  } satisfies JsonRecord;

  await updateProcessingJob(job.id, {
    status: nextStatus,
    stage: nextStage,
    progress: nextProgress,
    queue_position: nextQueuePosition,
    started_at: nextStartedAt,
    completed_at: nextCompletedAt,
    external_job_reference: externalRunReference ?? null,
    output_summary: nextOutputSummary,
  });

  await insertJobEvent({
    org_id: payload.orgId,
    job_id: job.id,
    event_type: `job.dispatch.callback.${payload.status}`,
    payload: {
      title: callbackSummary.title,
      detail: `${callbackSummary.detail}${message ? ` ${message}` : ""}`,
      callbackId: payload.callbackId,
      requestId: payload.requestId,
      externalRunReference,
      workerStage,
      callbackAt: payload.callbackAt,
    },
  });

  return {
    ok: true,
    action: "updated",
    jobId: job.id,
    status: nextStatus,
    stage: nextStage,
    progress: nextProgress,
  };
}
