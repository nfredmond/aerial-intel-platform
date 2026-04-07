import { getJobDetail } from "@/lib/missions/detail-data";
import {
  insertJobEvent,
  updateProcessingJob,
} from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/types";

type JsonRecord = Record<string, Json | undefined>;
type JobDetailResult = NonNullable<Awaited<ReturnType<typeof getJobDetail>>>;

export type ManagedDispatchHandoffInput = {
  hostLabel: string;
  workerLabel?: string | null;
  externalRunReference: string;
  dispatchNotes?: string | null;
  dispatchedByEmail?: string | null;
};

export type ManagedDispatchHandoff = {
  hostLabel: string | null;
  workerLabel: string | null;
  externalRunReference: string | null;
  dispatchNotes: string | null;
  dispatchedAt: string | null;
  dispatchedByEmail: string | null;
  dispatchSource: string | null;
};

export type ManagedProcessingActionSource = "job-detail" | "mission-detail" | "workspace";
export type ManagedProcessingAdvanceResult =
  | "intake-started"
  | "dispatch-recorded"
  | "qa-started"
  | "managed-completed"
  | "awaiting-outputs"
  | "awaiting-ready-artifacts"
  | "not-managed"
  | "noop";

function asRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {} as JsonRecord;
  }

  return value as JsonRecord;
}

function getSourceLabel(source: ManagedProcessingActionSource) {
  switch (source) {
    case "mission-detail":
      return "mission detail";
    case "workspace":
      return "workspace";
    default:
      return "job detail";
  }
}

function normalizeOptionalString(value: string | null | undefined) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function getManagedDispatchHandoffRecord(value: unknown) {
  const record = asRecord(value);
  const rawDispatch = record.dispatchHandoff;

  if (!rawDispatch || typeof rawDispatch !== "object" || Array.isArray(rawDispatch)) {
    return null;
  }

  return rawDispatch as JsonRecord;
}

export function getManagedDispatchHandoff(summary: unknown, externalJobReference?: string | null): ManagedDispatchHandoff {
  const dispatch = getManagedDispatchHandoffRecord(summary);

  return {
    hostLabel: normalizeOptionalString(dispatch?.hostLabel as string | null | undefined),
    workerLabel: normalizeOptionalString(dispatch?.workerLabel as string | null | undefined),
    externalRunReference:
      normalizeOptionalString(dispatch?.externalRunReference as string | null | undefined)
      ?? normalizeOptionalString(externalJobReference),
    dispatchNotes: normalizeOptionalString(dispatch?.dispatchNotes as string | null | undefined),
    dispatchedAt: normalizeOptionalString(dispatch?.dispatchedAt as string | null | undefined),
    dispatchedByEmail: normalizeOptionalString(dispatch?.dispatchedByEmail as string | null | undefined),
    dispatchSource: normalizeOptionalString(dispatch?.dispatchSource as string | null | undefined),
  };
}

function buildManagedDispatchLogLines(input: {
  sourceLabel: string;
  hostLabel: string;
  workerLabel?: string | null;
  externalRunReference: string;
}) {
  const workerLine = input.workerLabel && input.workerLabel.trim().length > 0
    ? `Assigned worker: ${input.workerLabel.trim()}.`
    : "Assigned worker: not recorded in-app.";

  return [
    `Managed host dispatch recorded from ${input.sourceLabel}.`,
    `Assigned host: ${input.hostLabel}.`,
    workerLine,
    `External run reference: ${input.externalRunReference}.`,
    "Awaiting real output import before QA review.",
  ];
}

function getManagedStageChecklist(input: {
  intakeReview: "pending" | "running" | "complete";
  hostDispatch: "pending" | "running" | "complete";
  outputsImported: "pending" | "running" | "complete";
  qaReview: "pending" | "running" | "complete";
  deliveryRecorded: "pending" | "running" | "complete";
}) {
  return [
    { label: "Intake review", status: input.intakeReview },
    { label: "Host dispatch", status: input.hostDispatch },
    { label: "Outputs imported", status: input.outputsImported },
    { label: "QA review", status: input.qaReview },
    { label: "Delivery recorded", status: input.deliveryRecorded },
  ];
}

export function isManagedProcessingJobRecord(job: { preset_id: string | null; input_summary: unknown }) {
  const inputSummary = asRecord(job.input_summary);
  return job.preset_id === "managed-processing-v1" || inputSummary.source === "mission-detail-managed-request";
}

export function isManagedProcessingJobDetail(detail: Awaited<ReturnType<typeof getJobDetail>>) {
  if (!detail) {
    return false;
  }

  return isManagedProcessingJobRecord(detail.job);
}

export function buildManagedProcessingRequestSummary(input: {
  missionName: string;
  datasetName: string;
  requestedByEmail?: string | null;
}) {
  const requestedBy = input.requestedByEmail && input.requestedByEmail.trim().length > 0
    ? ` by ${input.requestedByEmail.trim()}`
    : "";

  return {
    workflowMode: "managed_processing_v1",
    serviceModel: "operator_assisted",
    eta: "Awaiting operator intake review",
    notes:
      `Managed processing request created for ${input.missionName} (${input.datasetName})${requestedBy}. `
      + "This records a real operator-assisted request in the app, but it does not claim ODM extraction, host dispatch, or artifact generation has happened yet.",
    latestCheckpoint: "Managed processing request logged",
    deliveryPosture: "Artifacts appear only after a real run is imported or attached.",
    stageChecklist: getManagedStageChecklist({
      intakeReview: "pending",
      hostDispatch: "pending",
      outputsImported: "pending",
      qaReview: "pending",
      deliveryRecorded: "pending",
    }),
    logTail: [
      "Managed processing request logged.",
      "Awaiting operator intake review.",
      "No ODM host dispatch or output import recorded yet.",
    ],
  } satisfies JsonRecord;
}

function buildCompletionOutputSummary(detail: JobDetailResult, source: ManagedProcessingActionSource) {
  const sourceLabel = getSourceLabel(source);

  return {
    ...detail.outputSummary,
    workflowMode: "managed_processing_v1",
    serviceModel: "operator_assisted",
    eta: "Delivery-ready",
    notes: `Managed processing delivery readiness recorded from ${sourceLabel}. Ready artifacts are now available for review/share/export follow-through.`,
    latestCheckpoint: "Ready artifacts confirmed and delivery-ready posture recorded",
    deliveryPosture: "Ready artifacts exist and the managed request has reached delivery-ready status.",
    stageChecklist: getManagedStageChecklist({
      intakeReview: "complete",
      hostDispatch: "complete",
      outputsImported: "complete",
      qaReview: "complete",
      deliveryRecorded: "complete",
    }),
    logTail: [
      `Managed processing request completed from ${sourceLabel}.`,
      "Ready artifacts confirmed.",
      "Delivery-ready posture recorded in the mission workspace.",
    ],
  } satisfies JsonRecord;
}

async function startManagedIntakeReview(options: {
  orgId: string;
  detail: JobDetailResult;
  source: ManagedProcessingActionSource;
}) {
  const now = new Date().toISOString();
  const sourceLabel = getSourceLabel(options.source);

  await updateProcessingJob(options.detail.job.id, {
    status: "running",
    stage: "intake_review",
    progress: 15,
    queue_position: null,
    started_at: options.detail.job.started_at ?? now,
    output_summary: {
      ...options.detail.outputSummary,
      workflowMode: "managed_processing_v1",
      serviceModel: "operator_assisted",
      eta: "Intake review in progress",
      notes: `Operator intake review started from ${sourceLabel}. Host dispatch has not been recorded yet.`,
      latestCheckpoint: "Operator intake review started",
      deliveryPosture: "Outputs still need a real host run import before QA and delivery can close.",
      stageChecklist: getManagedStageChecklist({
        intakeReview: "running",
        hostDispatch: "pending",
        outputsImported: "pending",
        qaReview: "pending",
        deliveryRecorded: "pending",
      }),
      logTail: [
        `Managed intake review started from ${sourceLabel}.`,
        "Request moved out of the queue.",
        "Awaiting operator dispatch to a real processing host.",
      ],
    },
  });

  await insertJobEvent({
    org_id: options.orgId,
    job_id: options.detail.job.id,
    event_type: "job.stage.changed",
    payload: {
      title: "Managed intake review started",
      detail: `Operator intake review started from ${sourceLabel}. No host dispatch has been recorded yet.`,
    },
  });
}

async function recordManagedDispatch(options: {
  orgId: string;
  detail: JobDetailResult;
  source: ManagedProcessingActionSource;
  handoff: ManagedDispatchHandoffInput;
}) {
  const sourceLabel = getSourceLabel(options.source);
  const now = new Date().toISOString();
  const workerLabel = normalizeOptionalString(options.handoff.workerLabel);
  const dispatchNotes = normalizeOptionalString(options.handoff.dispatchNotes);
  const dispatchedByEmail = normalizeOptionalString(options.handoff.dispatchedByEmail);

  await updateProcessingJob(options.detail.job.id, {
    status: "running",
    stage: "processing",
    progress: 45,
    queue_position: null,
    external_job_reference: options.handoff.externalRunReference,
    output_summary: {
      ...options.detail.outputSummary,
      workflowMode: "managed_processing_v1",
      serviceModel: "operator_assisted",
      eta: "Awaiting output import",
      notes: `Operator dispatch recorded from ${sourceLabel}. Assigned host ${options.handoff.hostLabel} with external run reference ${options.handoff.externalRunReference}. This marks the managed handoff to real processing infrastructure, but outputs still need to be imported before QA can begin.`,
      latestCheckpoint: `Managed host dispatch recorded on ${options.handoff.hostLabel}`,
      deliveryPosture: "No client-facing deliverables should be promised until real outputs are imported.",
      dispatchHandoff: {
        hostLabel: options.handoff.hostLabel,
        workerLabel,
        externalRunReference: options.handoff.externalRunReference,
        dispatchNotes,
        dispatchedAt: now,
        dispatchedByEmail,
        dispatchSource: sourceLabel,
      },
      stageChecklist: getManagedStageChecklist({
        intakeReview: "complete",
        hostDispatch: "complete",
        outputsImported: "pending",
        qaReview: "pending",
        deliveryRecorded: "pending",
      }),
      logTail: buildManagedDispatchLogLines({
        sourceLabel,
        hostLabel: options.handoff.hostLabel,
        workerLabel,
        externalRunReference: options.handoff.externalRunReference,
      }),
    },
  });

  await insertJobEvent({
    org_id: options.orgId,
    job_id: options.detail.job.id,
    event_type: "job.stage.changed",
    payload: {
      title: "Managed host dispatch recorded",
      detail: `Operator dispatch to ${options.handoff.hostLabel}${workerLabel ? ` / ${workerLabel}` : ""} was recorded from ${sourceLabel} with external run reference ${options.handoff.externalRunReference}. Real outputs still need to be imported before QA can start.`,
    },
  });

  if (dispatchNotes) {
    await insertJobEvent({
      org_id: options.orgId,
      job_id: options.detail.job.id,
      event_type: "job.dispatch.note.recorded",
      payload: {
        title: "Managed dispatch note recorded",
        detail: `Dispatch note for host ${options.handoff.hostLabel}: ${dispatchNotes}`,
      },
    });
  }
}

export async function recordManagedDispatchHandoff(options: {
  orgId: string;
  detail: JobDetailResult;
  source: ManagedProcessingActionSource;
  handoff: ManagedDispatchHandoffInput;
}) {
  if (!isManagedProcessingJobDetail(options.detail)) {
    return "not-managed" as const;
  }

  if (!(options.detail.job.status === "running" && options.detail.job.stage === "intake_review")) {
    return "noop" as const;
  }

  await recordManagedDispatch(options);
  return "dispatch-recorded" as const;
}

async function startManagedQaReview(options: {
  orgId: string;
  detail: JobDetailResult;
  source: ManagedProcessingActionSource;
}) {
  const sourceLabel = getSourceLabel(options.source);

  await updateProcessingJob(options.detail.job.id, {
    status: "running",
    stage: "qa_review",
    progress: 80,
    queue_position: null,
    output_summary: {
      ...options.detail.outputSummary,
      workflowMode: "managed_processing_v1",
      serviceModel: "operator_assisted",
      eta: "QA review in progress",
      notes: `Real outputs are now attached/imported and QA review started from ${sourceLabel}. Delivery stays open until ready artifacts are confirmed.`,
      latestCheckpoint: "Outputs imported; QA review started",
      deliveryPosture: "Review artifact readiness before recording final delivery-ready status.",
      stageChecklist: getManagedStageChecklist({
        intakeReview: "complete",
        hostDispatch: "complete",
        outputsImported: "complete",
        qaReview: "running",
        deliveryRecorded: "pending",
      }),
      logTail: [
        `Managed QA review started from ${sourceLabel}.`,
        "Real outputs detected on the job.",
        "Awaiting confirmation that at least one artifact is ready.",
      ],
    },
  });

  await insertJobEvent({
    org_id: options.orgId,
    job_id: options.detail.job.id,
    event_type: "job.stage.changed",
    payload: {
      title: "Managed QA review started",
      detail: `Real outputs are attached to this managed request and QA review started from ${sourceLabel}.`,
    },
  });
}

async function completeManagedProcessingRequest(options: {
  orgId: string;
  detail: JobDetailResult;
  source: ManagedProcessingActionSource;
}) {
  const now = new Date().toISOString();

  await updateProcessingJob(options.detail.job.id, {
    status: "succeeded",
    stage: "complete",
    progress: 100,
    queue_position: null,
    completed_at: now,
    output_summary: buildCompletionOutputSummary(options.detail, options.source),
  });

  await insertJobEvent({
    org_id: options.orgId,
    job_id: options.detail.job.id,
    event_type: "job.stage.changed",
    payload: {
      title: "Managed processing delivery-ready",
      detail: `Ready artifacts were confirmed and the managed processing request was marked delivery-ready from ${getSourceLabel(options.source)}.`,
    },
  });
}

export async function advanceManagedProcessingJob(options: {
  orgId: string;
  detail: JobDetailResult;
  source: ManagedProcessingActionSource;
}) : Promise<ManagedProcessingAdvanceResult> {
  const { detail } = options;

  if (!isManagedProcessingJobDetail(detail)) {
    return "not-managed";
  }

  const readyOutputCount = detail.outputs.filter((output) => output.status === "ready").length;
  const outputCount = detail.outputs.length;

  if (detail.job.status === "queued") {
    await startManagedIntakeReview(options);
    return "intake-started";
  }

  if (detail.job.status === "running" && detail.job.stage === "intake_review") {
    await recordManagedDispatch({
      ...options,
      handoff: {
        hostLabel: "Processing host assigned",
        externalRunReference: `managed-${detail.job.id}`,
        workerLabel: null,
        dispatchNotes: null,
        dispatchedByEmail: null,
      },
    });
    return "dispatch-recorded";
  }

  if (detail.job.status === "running" && detail.job.stage === "processing") {
    if (outputCount === 0) {
      return "awaiting-outputs";
    }

    await startManagedQaReview(options);
    return "qa-started";
  }

  if (detail.job.status === "running" && detail.job.stage === "qa_review") {
    if (readyOutputCount === 0) {
      return "awaiting-ready-artifacts";
    }

    await completeManagedProcessingRequest(options);
    return "managed-completed";
  }

  return "noop";
}

export function getManagedProcessingNextStep(detail: JobDetailResult) {
  if (!isManagedProcessingJobDetail(detail)) {
    return null;
  }

  const outputCount = detail.outputs.length;
  const readyOutputCount = detail.outputs.filter((output) => output.status === "ready").length;

  if (detail.job.status === "queued") {
    return {
      label: "Start intake review",
      helper: "Move this managed request from queue to active operator intake review.",
      disabled: false,
    };
  }

  if (detail.job.status === "running" && detail.job.stage === "intake_review") {
    return {
      label: "Record dispatch handoff",
      helper: "Record the assigned host and external run reference before claiming this request was handed to real processing infrastructure.",
      disabled: false,
    };
  }

  if (detail.job.status === "running" && detail.job.stage === "processing") {
    return {
      label: "Start QA on imported outputs",
      helper: outputCount > 0
        ? "Real outputs are attached to this job, so QA can now begin."
        : "Import or attach real outputs before QA can begin.",
      disabled: outputCount === 0,
    };
  }

  if (detail.job.status === "running" && detail.job.stage === "qa_review") {
    return {
      label: "Mark delivery-ready complete",
      helper: readyOutputCount > 0
        ? "At least one ready artifact exists, so this managed request can be marked delivery-ready."
        : "Mark at least one artifact ready before closing the managed request.",
      disabled: readyOutputCount === 0,
    };
  }

  return null;
}
