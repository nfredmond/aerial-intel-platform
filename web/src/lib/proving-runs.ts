import { getJobDetail, getString } from "@/lib/missions/detail-data";
import {
  insertJobEvent,
  updateProcessingJob,
  updateProcessingOutput,
} from "@/lib/supabase/admin";

type JobDetailResult = NonNullable<Awaited<ReturnType<typeof getJobDetail>>>;
export type ProvingActionSource = "job-detail" | "mission-detail" | "workspace";

type ProvingEvent = {
  eventType: string;
  title: string;
  detail: string;
};

function getSourceLabel(source: ProvingActionSource) {
  switch (source) {
    case "mission-detail":
      return "mission detail";
    case "workspace":
      return "workspace";
    default:
      return "job detail";
  }
}

function buildStartedLogTail(source: ProvingActionSource) {
  const sourceLabel = getSourceLabel(source);

  return [
    `Operator advanced proving run from ${sourceLabel}.`,
    "Queue handoff cleared.",
    "Worker picked up proving run.",
    "Orthomosaic stage started.",
    "Initial QA checkpoint opened for downstream deliverables.",
  ];
}

function buildCompletedLogTail(source: ProvingActionSource) {
  const sourceLabel = getSourceLabel(source);

  return [
    `Operator completed proving run from ${sourceLabel}.`,
    "Orthomosaic generated.",
    "DSM generated.",
    "Point cloud generated.",
    "Mission brief exported.",
    "Artifacts promoted to ready-for-review state.",
  ];
}

function buildStartedEvents(source: ProvingActionSource): ProvingEvent[] {
  const sourceLabel = getSourceLabel(source);

  return [
    {
      eventType: "job.stage.changed",
      title: "Proving run started",
      detail: `Manual proving run advanced to active processing from ${sourceLabel}.`,
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

  return [
    {
      eventType: "job.progress.updated",
      title: "Processing outputs assembled",
      detail: `Orthomosaic, DSM, point cloud, and mission brief milestones were marked complete from ${sourceLabel}.`,
    },
    {
      eventType: "job.stage.changed",
      title: "Proving run completed",
      detail: "Manual proving run advanced to complete and output artifacts are now ready for review.",
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
