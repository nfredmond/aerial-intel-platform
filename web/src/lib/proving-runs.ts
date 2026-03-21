import { getJobDetail, getString, type JobDetail } from "@/lib/missions/detail-data";
import {
  PROVING_HEARTBEAT_CRON_SCHEDULE,
  PROVING_HEARTBEAT_ROUTE_PATH,
} from "@/lib/proving-heartbeat";
import {
  adminSelect,
  insertJobEvent,
  updateProcessingJob,
  updateProcessingOutput,
} from "@/lib/supabase/admin";
import type { Database, Json } from "@/lib/supabase/types";

type JobDetailResult = NonNullable<Awaited<ReturnType<typeof getJobDetail>>>;
type ProcessingJobRow = Database["public"]["Tables"]["drone_processing_jobs"]["Row"];
type ProcessingOutputRow = Database["public"]["Tables"]["drone_processing_outputs"]["Row"];
type JsonRecord = Record<string, Json | undefined>;
type HeartbeatAuditTarget = Pick<
  ProcessingJobRow,
  "id" | "org_id" | "engine" | "status" | "stage" | "input_summary" | "created_at" | "started_at" | "updated_at" | "preset_id"
>;
export type ProvingActionSource = "job-detail" | "mission-detail" | "workspace" | "worker-heartbeat";

const PROVING_QUEUE_PICKUP_MS = 15_000;
const PROVING_AUTO_COMPLETE_MS = 45_000;

type ProvingEvent = {
  eventType: string;
  title: string;
  detail: string;
};

function asRecord(value: Json | undefined) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {} as JsonRecord;
  }

  return value as JsonRecord;
}

function getSourceLabel(source: ProvingActionSource) {
  switch (source) {
    case "mission-detail":
      return "mission detail";
    case "workspace":
      return "workspace";
    case "worker-heartbeat":
      return "worker heartbeat";
    default:
      return "job detail";
  }
}

function buildStartedLogTail(source: ProvingActionSource) {
  const sourceLabel = getSourceLabel(source);
  const opener = source === "worker-heartbeat"
    ? `Worker heartbeat advanced proving run from ${sourceLabel}.`
    : `Operator advanced proving run from ${sourceLabel}.`;

  return [
    opener,
    "Queue handoff cleared.",
    "Worker picked up proving run.",
    "Orthomosaic stage started.",
    "Initial QA checkpoint opened for downstream deliverables.",
  ];
}

function buildCompletedLogTail(source: ProvingActionSource) {
  const sourceLabel = getSourceLabel(source);
  const opener = source === "worker-heartbeat"
    ? `Worker heartbeat completed proving run from ${sourceLabel}.`
    : `Operator completed proving run from ${sourceLabel}.`;

  return [
    opener,
    "Orthomosaic generated.",
    "DSM generated.",
    "Point cloud generated.",
    "Mission brief exported.",
    "Artifacts promoted to ready-for-review state.",
  ];
}

function buildStartedEvents(source: ProvingActionSource): ProvingEvent[] {
  const sourceLabel = getSourceLabel(source);
  const detail = source === "worker-heartbeat"
    ? `Worker heartbeat advanced the proving run to active processing from ${sourceLabel}.`
    : `Manual proving run advanced to active processing from ${sourceLabel}.`;

  return [
    {
      eventType: "job.stage.changed",
      title: "Proving run started",
      detail,
    },
    {
      eventType: "job.progress.updated",
      title: "Queue handoff cleared",
      detail: "The proving run has left the queued state and is now assigned to active processing.",
    },
    {
      eventType: "job.progress.updated",
      title: "Orthomosaic stage active",
      detail: "The proving run is now working through the orthomosaic stage on the live path.",
    },
  ];
}

function buildCompletedEvents(source: ProvingActionSource): ProvingEvent[] {
  const sourceLabel = getSourceLabel(source);
  const completionDetail = source === "worker-heartbeat"
    ? "Worker heartbeat advanced the proving run to complete and output artifacts are now ready for review."
    : "Manual proving run advanced to complete and output artifacts are now ready for review.";

  return [
    {
      eventType: "job.progress.updated",
      title: "Processing outputs assembled",
      detail: `Orthomosaic, DSM, point cloud, and mission brief milestones were marked complete from ${sourceLabel}.`,
    },
    {
      eventType: "job.stage.changed",
      title: "Proving run completed",
      detail: completionDetail,
    },
    {
      eventType: "artifact.generated",
      title: "Artifacts ready for review",
      detail: "All proving-run placeholder outputs are now marked ready for the delivery lane.",
    },
  ];
}

async function insertTimelineEvents(orgId: string, jobId: string, events: ProvingEvent[]) {
  for (const event of events) {
    await insertJobEvent({
      org_id: orgId,
      job_id: jobId,
      event_type: event.eventType,
      payload: {
        title: event.title,
        detail: event.detail,
      },
    });
  }
}

export function isManualProvingJobDetail(detail: Awaited<ReturnType<typeof getJobDetail>>) {
  if (!detail) {
    return false;
  }

  return detail.job.preset_id === "v1-proving-run"
    || getString(detail.inputSummary.source as string | undefined, "") === "mission-proving-seed";
}

export function isProvingJobRecord(job: { preset_id: string | null; input_summary: unknown }) {
  const inputSummary = job.input_summary && typeof job.input_summary === "object" && !Array.isArray(job.input_summary)
    ? (job.input_summary as Record<string, unknown>)
    : {};

  return job.preset_id === "v1-proving-run" || inputSummary.source === "mission-proving-seed";
}

async function getLatestProvingJobsByOrg() {
  const rows = await adminSelect<HeartbeatAuditTarget[]>(
    "drone_processing_jobs?select=id,org_id,engine,preset_id,status,stage,input_summary,created_at,updated_at,started_at&order=updated_at.desc&limit=100",
  );

  const latestByOrg = new Map<string, HeartbeatAuditTarget>();
  for (const row of rows) {
    if (!isProvingJobRecord(row) || latestByOrg.has(row.org_id)) {
      continue;
    }

    latestByOrg.set(row.org_id, row);
  }

  return Array.from(latestByOrg.values());
}

export async function recordProvingHeartbeatAudit(options: {
  invokedAt: string;
  scanned: number;
  updates: number;
  started: number;
  completed: number;
}) {
  const targets = await getLatestProvingJobsByOrg();

  for (const target of targets) {
    const inputSummary = target.input_summary && typeof target.input_summary === "object" && !Array.isArray(target.input_summary)
      ? (target.input_summary as Record<string, unknown>)
      : {};
    const jobName = typeof inputSummary.name === "string" && inputSummary.name.trim()
      ? inputSummary.name
      : `${target.engine.toUpperCase()} job`;
    const detail = options.updates > 0
      ? `Worker heartbeat ran at ${options.invokedAt}, scanned ${options.scanned} proving jobs, and applied ${options.updates} proving-lane updates (${options.started} started, ${options.completed} completed).`
      : `Worker heartbeat ran at ${options.invokedAt}, scanned ${options.scanned} proving jobs, and found no state changes to apply.`;

    await insertJobEvent({
      org_id: target.org_id,
      job_id: target.id,
      event_type: "system.worker_heartbeat",
      payload: {
        source: "worker-heartbeat",
        title: "Worker heartbeat observed",
        summary: `${jobName} was used as the proving-lane heartbeat audit anchor.`,
        detail,
        routePath: PROVING_HEARTBEAT_ROUTE_PATH,
        schedule: PROVING_HEARTBEAT_CRON_SCHEDULE,
        scanned: options.scanned,
        updates: options.updates,
        started: options.started,
        completed: options.completed,
        invokedAt: options.invokedAt,
        jobStatus: target.status,
        jobStage: target.stage,
      },
    });
  }

  return targets.length;
}

async function getProvingJobDetailAdmin(jobId: string): Promise<JobDetail | null> {
  const jobRows = await adminSelect<ProcessingJobRow[]>(
    `drone_processing_jobs?id=eq.${encodeURIComponent(jobId)}&select=id,org_id,project_id,site_id,mission_id,dataset_id,engine,preset_id,status,stage,progress,queue_position,input_summary,output_summary,external_job_reference,created_by,created_at,updated_at,started_at,completed_at`,
  );
  const job = jobRows[0] ?? null;

  if (!job) {
    return null;
  }

  const outputs = await adminSelect<ProcessingOutputRow[]>(
    `drone_processing_outputs?org_id=eq.${encodeURIComponent(job.org_id)}&job_id=eq.${encodeURIComponent(job.id)}&select=id,org_id,job_id,mission_id,dataset_id,kind,status,storage_bucket,storage_path,metadata,created_at,updated_at&order=updated_at.desc`,
  );

  return {
    job,
    mission: null,
    project: null,
    site: null,
    dataset: null,
    outputs,
    events: [],
    inputSummary: asRecord(job.input_summary),
    outputSummary: asRecord(job.output_summary),
  };
}

export async function startManualProvingJob(options: {
  orgId: string;
  detail: JobDetailResult;
  source: ProvingActionSource;
}) {
  const { orgId, detail, source } = options;
  const sourceLabel = getSourceLabel(source);
  const now = new Date().toISOString();

  await updateProcessingJob(detail.job.id, {
    status: "running",
    stage: "orthomosaic",
    progress: 45,
    queue_position: null,
    started_at: detail.job.started_at ?? now,
    output_summary: {
      ...detail.outputSummary,
      eta: "In progress",
      notes: `Manual proving run started from ${sourceLabel}.`,
      latestCheckpoint: "Orthomosaic stage active",
      runLogPath: getString(detail.outputSummary.runLogPath, `proving-runs/${detail.job.id}.log`),
      stageChecklist: [
        { label: "Queue handoff", status: "complete" },
        { label: "Orthomosaic", status: "running" },
        { label: "DSM", status: "pending" },
        { label: "Point cloud", status: "pending" },
        { label: "Mission brief", status: "pending" },
      ],
      logTail: buildStartedLogTail(source),
    },
  });

  await insertTimelineEvents(orgId, detail.job.id, buildStartedEvents(source));
}

export async function completeManualProvingJob(options: {
  orgId: string;
  detail: JobDetailResult;
  source: ProvingActionSource;
}) {
  const { orgId, detail, source } = options;
  const sourceLabel = getSourceLabel(source);
  const now = new Date().toISOString();

  await updateProcessingJob(detail.job.id, {
    status: "succeeded",
    stage: "complete",
    progress: 100,
    queue_position: null,
    started_at: detail.job.started_at ?? now,
    completed_at: now,
    output_summary: {
      ...detail.outputSummary,
      eta: "Complete",
      notes: `Manual proving run completed from ${sourceLabel}.`,
      latestCheckpoint: "Artifacts ready for review",
      runLogPath: getString(detail.outputSummary.runLogPath, `proving-runs/${detail.job.id}.log`),
      stageChecklist: [
        { label: "Queue handoff", status: "complete" },
        { label: "Orthomosaic", status: "complete" },
        { label: "DSM", status: "complete" },
        { label: "Point cloud", status: "complete" },
        { label: "Mission brief", status: "complete" },
      ],
      logTail: buildCompletedLogTail(source),
    },
  });

  await Promise.all(
    detail.outputs.map((output) =>
      updateProcessingOutput(output.id, {
        status: "ready",
        metadata: {
          ...(output.metadata && typeof output.metadata === "object" && !Array.isArray(output.metadata)
            ? output.metadata
            : {}),
          delivery:
            output.kind === "report"
              ? "Share/export pending"
              : output.kind === "point_cloud"
                ? "Hold for QA"
                : "Review pending",
        },
      }),
    ),
  );

  await insertTimelineEvents(orgId, detail.job.id, buildCompletedEvents(source));
}

export async function advanceManualProvingJob(options: {
  orgId: string;
  detail: JobDetailResult;
  source: ProvingActionSource;
}) {
  const { orgId, detail, source } = options;

  if (!isManualProvingJobDetail(detail)) {
    return "not-proving" as const;
  }

  if (detail.job.status === "queued") {
    await startManualProvingJob({ orgId, detail, source });
    return "started" as const;
  }

  if (detail.job.status === "running") {
    await completeManualProvingJob({ orgId, detail, source });
    return "completed" as const;
  }

  return "noop" as const;
}

export async function reconcileProvingJobsOutOfBand() {
  const rows = await adminSelect<Array<Pick<ProcessingJobRow, "id" | "org_id" | "preset_id" | "status" | "input_summary" | "created_at" | "started_at" | "updated_at">>>(
    "drone_processing_jobs?status=in.(queued,running)&select=id,org_id,preset_id,status,input_summary,created_at,started_at,updated_at&order=updated_at.desc&limit=50",
  );

  let updates = 0;
  let started = 0;
  let completed = 0;
  const now = Date.now();

  for (const row of rows) {
    if (!isProvingJobRecord(row)) {
      continue;
    }

    const detail = await getProvingJobDetailAdmin(row.id);
    if (!detail || !isManualProvingJobDetail(detail)) {
      continue;
    }

    if (detail.job.status === "queued") {
      const queuedSince = new Date(detail.job.created_at).getTime();
      if (Number.isFinite(queuedSince) && now - queuedSince >= PROVING_QUEUE_PICKUP_MS) {
        await startManualProvingJob({
          orgId: detail.job.org_id,
          detail,
          source: "worker-heartbeat",
        });
        updates += 1;
        started += 1;
      }
      continue;
    }

    if (detail.job.status === "running") {
      const runningSince = new Date(detail.job.started_at ?? detail.job.updated_at).getTime();
      if (Number.isFinite(runningSince) && now - runningSince >= PROVING_AUTO_COMPLETE_MS) {
        await completeManualProvingJob({
          orgId: detail.job.org_id,
          detail,
          source: "worker-heartbeat",
        });
        updates += 1;
        completed += 1;
      }
    }
  }

  return {
    scanned: rows.length,
    updates,
    started,
    completed,
  };
}
