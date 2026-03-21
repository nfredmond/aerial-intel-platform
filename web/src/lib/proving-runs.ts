import { getJobDetail, getString } from "@/lib/missions/detail-data";
import {
  insertJobEvent,
  updateProcessingJob,
  updateProcessingOutput,
} from "@/lib/supabase/admin";

type JobDetailResult = NonNullable<Awaited<ReturnType<typeof getJobDetail>>>;

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
}) {
  const { orgId, detail } = options;

  await updateProcessingJob(detail.job.id, {
    status: "running",
    stage: "orthomosaic",
    progress: 45,
    queue_position: null,
    started_at: detail.job.started_at ?? new Date().toISOString(),
    output_summary: {
      ...detail.outputSummary,
      eta: "In progress",
      notes: "Manual proving run started from the job detail page.",
      logTail: [
        "Worker picked up proving run.",
        "Orthomosaic stage started.",
      ],
    },
  });

  await insertJobEvent({
    org_id: orgId,
    job_id: detail.job.id,
    event_type: "job.stage.changed",
    payload: {
      title: "Proving run started",
      detail: "Manual proving run advanced to active processing from the job detail page.",
    },
  });
}

export async function completeManualProvingJob(options: {
  orgId: string;
  detail: JobDetailResult;
}) {
  const { orgId, detail } = options;

  await updateProcessingJob(detail.job.id, {
    status: "succeeded",
    stage: "complete",
    progress: 100,
    queue_position: null,
    started_at: detail.job.started_at ?? new Date().toISOString(),
    completed_at: new Date().toISOString(),
    output_summary: {
      ...detail.outputSummary,
      eta: "Complete",
      notes: "Manual proving run completed from the job detail page.",
      logTail: [
        "Orthomosaic generated.",
        "DSM generated.",
        "Point cloud generated.",
        "Mission brief exported.",
      ],
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

  await insertJobEvent({
    org_id: orgId,
    job_id: detail.job.id,
    event_type: "job.stage.changed",
    payload: {
      title: "Proving run completed",
      detail: "Manual proving run advanced to complete and output artifacts are now ready for review.",
    },
  });

  await insertJobEvent({
    org_id: orgId,
    job_id: detail.job.id,
    event_type: "artifact.generated",
    payload: {
      title: "Artifacts ready for review",
      detail: "All proving-run placeholder outputs are now marked ready for the delivery lane.",
    },
  });
}

export async function advanceManualProvingJob(options: {
  orgId: string;
  detail: JobDetailResult;
}) {
  const { orgId, detail } = options;

  if (!isManualProvingJobDetail(detail)) {
    return "not-proving" as const;
  }

  if (detail.job.status === "queued") {
    await startManualProvingJob({ orgId, detail });
    return "started" as const;
  }

  if (detail.job.status === "running") {
    await completeManualProvingJob({ orgId, detail });
    return "completed" as const;
  }

  return "noop" as const;
}
