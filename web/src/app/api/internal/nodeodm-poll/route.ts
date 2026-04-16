import { NextRequest, NextResponse } from "next/server";

import { pollNodeOdmTask } from "@/lib/dispatch-adapter-nodeodm";
import { createLogger, extractRequestId } from "@/lib/logging";
import { getNodeOdmAdapterConfig } from "@/lib/nodeodm/config";
import { statusCodeName } from "@/lib/nodeodm/contracts";
import { isNodeOdmError } from "@/lib/nodeodm/errors";
import { adminSelect, insertJobEvent, updateProcessingJob } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

type ProcessingJobRow = {
  id: string;
  org_id: string;
  status: string;
  stage: string | null;
  output_summary: Record<string, unknown> | null;
};

function isAuthorized(request: NextRequest) {
  const configuredSecret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");

  if (configuredSecret) {
    return authorization === `Bearer ${configuredSecret}`;
  }

  const userAgent = request.headers.get("user-agent") ?? "";
  return userAgent.startsWith("vercel-cron/");
}

type NodeOdmJobCursor = {
  taskUuid: string;
  jobId: string;
  orgId: string;
  summary: Record<string, unknown>;
};

function extractNodeOdmCursor(row: ProcessingJobRow): NodeOdmJobCursor | null {
  const summary = row.output_summary ?? {};
  const nodeodm = (summary as { nodeodm?: unknown }).nodeodm;
  if (!nodeodm || typeof nodeodm !== "object") return null;
  const taskUuid = (nodeodm as { taskUuid?: unknown }).taskUuid;
  if (typeof taskUuid !== "string" || taskUuid.length === 0) return null;
  return { taskUuid, jobId: row.id, orgId: row.org_id, summary };
}

async function fetchActiveNodeOdmJobs(): Promise<NodeOdmJobCursor[]> {
  const rows = await adminSelect<ProcessingJobRow[]>(
    "drone_processing_jobs?status=in.(pending,queued,processing,awaiting_output_import)&select=id,org_id,status,stage,output_summary",
  );
  return rows
    .map(extractNodeOdmCursor)
    .filter((cursor): cursor is NodeOdmJobCursor => cursor !== null);
}

async function advanceJobFromTaskInfo(cursor: NodeOdmJobCursor) {
  const taskInfo = await pollNodeOdmTask(cursor.taskUuid);
  const statusName = statusCodeName(taskInfo.status?.code);
  const summary = { ...cursor.summary };
  const prevNodeodm = (summary.nodeodm as Record<string, unknown>) ?? {};
  summary.nodeodm = {
    ...prevNodeodm,
    lastPolledAt: new Date().toISOString(),
    progress: taskInfo.progress ?? prevNodeodm.progress ?? null,
    statusCode: taskInfo.status?.code ?? null,
    statusName,
    statusMessage: taskInfo.status?.errorMessage ?? prevNodeodm.statusMessage ?? null,
  };

  let patch: Record<string, unknown> = { output_summary: summary };

  if (taskInfo.status?.code === 40) {
    patch = {
      ...patch,
      status: "awaiting_output_import",
      stage: "awaiting-output-import",
    };
    await insertJobEvent({
      job_id: cursor.jobId,
      org_id: cursor.orgId,
      event_type: "nodeodm.task.completed",
      payload: { taskUuid: cursor.taskUuid, progress: taskInfo.progress ?? 100 } as Json,
    });
  } else if (taskInfo.status?.code === 30) {
    patch = {
      ...patch,
      status: "failed",
      stage: "failed",
    };
    await insertJobEvent({
      job_id: cursor.jobId,
      org_id: cursor.orgId,
      event_type: "nodeodm.task.failed",
      payload: {
        taskUuid: cursor.taskUuid,
        errorMessage: taskInfo.status?.errorMessage ?? null,
      } as Json,
    });
  } else if (taskInfo.status?.code === 20) {
    patch = { ...patch, status: "processing", stage: "processing" };
  }

  await updateProcessingJob(cursor.jobId, patch as Parameters<typeof updateProcessingJob>[1]);
  return { jobId: cursor.jobId, statusName, progress: taskInfo.progress ?? null };
}

export async function GET(request: NextRequest) {
  const log = createLogger("api.internal.nodeodm-poll", {
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
      note: "NodeODM adapter not configured (AERIAL_NODEODM_URL missing). Nothing to poll.",
      processed: 0,
    });
  }

  try {
    const cursors = await fetchActiveNodeOdmJobs();
    const processed: Array<{ jobId: string; statusName: string; progress: number | null }> = [];
    const failures: Array<{ jobId: string; error: string }> = [];

    for (const cursor of cursors) {
      try {
        const result = await advanceJobFromTaskInfo(cursor);
        processed.push(result);
        log.info("job.advanced", { jobId: result.jobId, statusName: result.statusName, progress: result.progress });
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
