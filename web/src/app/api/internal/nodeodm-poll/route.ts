import { strFromU8, unzipSync } from "fflate";
import { NextRequest, NextResponse } from "next/server";

import { pollNodeOdmTask } from "@/lib/dispatch-adapter-nodeodm";
import { createLogger, extractRequestId } from "@/lib/logging";
import { parseManagedBenchmarkSummaryText } from "@/lib/managed-processing-import";
import { createConfiguredNodeOdmClient, getNodeOdmAdapterConfig } from "@/lib/nodeodm/config";
import { statusCodeName } from "@/lib/nodeodm/contracts";
import { isNodeOdmError } from "@/lib/nodeodm/errors";
import {
  inventoryNodeOdmBundle,
  synthesizeBenchmarkSummary,
  type RealOdmBundleInventory,
  type RealOdmOutputSlot,
} from "@/lib/nodeodm/real-output-adapter";
import {
  adminSelect,
  insertJobEvent,
  insertProcessingOutputs,
  updateProcessingJob,
  type ProcessingOutputInsert,
} from "@/lib/supabase/admin";
import { uploadStorageBytes } from "@/lib/supabase/admin-storage";
import type { Json } from "@/lib/supabase/types";

const DRONE_OPS_STORAGE_BUCKET = "drone-ops";

type CanonicalOutputKind = "orthomosaic" | "dsm" | "dtm" | "point_cloud" | "mesh";

const CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
  tif: "image/tiff",
  tiff: "image/tiff",
  laz: "application/vnd.las",
  las: "application/vnd.las",
  obj: "model/obj",
  json: "application/json",
};

function contentTypeForPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return CONTENT_TYPE_BY_EXTENSION[ext] ?? "application/octet-stream";
}

function basenameOf(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx >= 0 ? path.slice(idx + 1) : path;
}

type CopyPlanEntry = {
  kind: CanonicalOutputKind;
  slot: RealOdmOutputSlot;
};

function buildCopyPlan(inventory: RealOdmBundleInventory): CopyPlanEntry[] {
  const plan: CopyPlanEntry[] = [];
  if (inventory.orthophoto) plan.push({ kind: "orthomosaic", slot: inventory.orthophoto });
  if (inventory.dsm) plan.push({ kind: "dsm", slot: inventory.dsm });
  if (inventory.dtm) plan.push({ kind: "dtm", slot: inventory.dtm });
  if (inventory.pointCloud) plan.push({ kind: "point_cloud", slot: inventory.pointCloud });
  if (inventory.mesh) plan.push({ kind: "mesh", slot: inventory.mesh });
  return plan;
}

export const dynamic = "force-dynamic";

type ProcessingJobRow = {
  id: string;
  org_id: string;
  mission_id: string | null;
  dataset_id: string | null;
  status: string;
  stage: string | null;
  output_summary: Record<string, unknown> | null;
  org: { slug: string | null } | { slug: string | null }[] | null;
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
  orgSlug: string;
  missionId: string | null;
  datasetId: string | null;
  summary: Record<string, unknown>;
};

function resolveOrgSlug(orgRelation: ProcessingJobRow["org"], orgId: string): string {
  const row = Array.isArray(orgRelation) ? orgRelation[0] ?? null : orgRelation;
  const slug = row?.slug?.trim();
  return slug && slug.length > 0 ? slug : orgId;
}

function extractNodeOdmCursor(row: ProcessingJobRow): NodeOdmJobCursor | null {
  const summary = row.output_summary ?? {};
  const nodeodm = (summary as { nodeodm?: unknown }).nodeodm;
  if (!nodeodm || typeof nodeodm !== "object") return null;
  const taskUuid = (nodeodm as { taskUuid?: unknown }).taskUuid;
  if (typeof taskUuid !== "string" || taskUuid.length === 0) return null;
  return {
    taskUuid,
    jobId: row.id,
    orgId: row.org_id,
    orgSlug: resolveOrgSlug(row.org, row.org_id),
    missionId: row.mission_id,
    datasetId: row.dataset_id,
    summary,
  };
}

async function fetchActiveNodeOdmJobs(): Promise<NodeOdmJobCursor[]> {
  const rows = await adminSelect<ProcessingJobRow[]>(
    "drone_processing_jobs?status=in.(pending,queued,processing,awaiting_output_import)&select=id,org_id,mission_id,dataset_id,status,stage,output_summary,org:drone_orgs(slug)",
  );
  return rows
    .map(extractNodeOdmCursor)
    .filter((cursor): cursor is NodeOdmJobCursor => cursor !== null);
}

type CopiedArtifact = {
  kind: CanonicalOutputKind;
  bucket: string;
  storagePath: string;
  sourcePath: string;
  sizeBytes: number;
};

async function copyInventoryToStorage(options: {
  cursor: NodeOdmJobCursor;
  inventory: RealOdmBundleInventory;
  zipEntries: Record<string, Uint8Array>;
  importedAt: string;
}): Promise<CopiedArtifact[]> {
  const plan = buildCopyPlan(options.inventory);
  const copied: CopiedArtifact[] = [];

  for (const entry of plan) {
    const bytes = options.zipEntries[entry.slot.path];
    if (!bytes || bytes.length === 0) continue;
    const fileName = basenameOf(entry.slot.path);
    const storagePath = `${options.cursor.orgSlug}/jobs/${options.cursor.jobId}/outputs/${entry.kind}/${fileName}`;
    const uploaded = await uploadStorageBytes({
      bucket: DRONE_OPS_STORAGE_BUCKET,
      path: storagePath,
      bytes,
      contentType: contentTypeForPath(entry.slot.path),
      upsert: true,
    });
    copied.push({
      kind: entry.kind,
      bucket: DRONE_OPS_STORAGE_BUCKET,
      storagePath: uploaded.path,
      sourcePath: entry.slot.path,
      sizeBytes: bytes.length,
    });
  }

  return copied;
}

async function persistProcessingOutputs(options: {
  cursor: NodeOdmJobCursor;
  copied: CopiedArtifact[];
  importedAt: string;
}) {
  if (options.copied.length === 0) return [] as Array<{ id: string }>;
  const inserts: ProcessingOutputInsert[] = options.copied.map((artifact) => ({
    org_id: options.cursor.orgId,
    job_id: options.cursor.jobId,
    mission_id: options.cursor.missionId,
    dataset_id: options.cursor.datasetId,
    kind: artifact.kind,
    status: "ready",
    storage_bucket: artifact.bucket,
    storage_path: artifact.storagePath,
    metadata: {
      source: "nodeodm-auto-import",
      sourcePath: artifact.sourcePath,
      sizeBytes: artifact.sizeBytes,
      importedAt: options.importedAt,
      importedFromTaskUuid: options.cursor.taskUuid,
    } as Json,
  }));
  return insertProcessingOutputs(inserts);
}

function mergeStorageRefsIntoSummary(
  parsedRaw: Record<string, unknown>,
  copied: CopiedArtifact[],
): Record<string, unknown> {
  if (copied.length === 0) return parsedRaw;
  const outputs = parsedRaw.outputs as Record<string, Record<string, unknown>> | undefined;
  if (!outputs) return parsedRaw;
  const kindToSummaryKey: Record<CanonicalOutputKind, string> = {
    orthomosaic: "orthophoto",
    dsm: "dem",
    dtm: "dtm",
    point_cloud: "point_cloud",
    mesh: "mesh",
  };
  const nextOutputs: Record<string, Record<string, unknown>> = { ...outputs };
  for (const artifact of copied) {
    const key = kindToSummaryKey[artifact.kind];
    const slot = nextOutputs[key];
    if (!slot) continue;
    nextOutputs[key] = {
      ...slot,
      storage_bucket: artifact.bucket,
      storage_path: artifact.storagePath,
    };
  }
  return { ...parsedRaw, outputs: nextOutputs };
}

async function importCompletedOutputs(cursor: NodeOdmJobCursor): Promise<{
  topLevelPatch: Record<string, unknown>;
  nodeodmPatch: Record<string, unknown>;
  outputCount: number;
} | null> {
  const client = createConfiguredNodeOdmClient();
  if (!client) return null;

  const response = await client.downloadAllAssets(cursor.taskUuid);
  const arrayBuffer = await response.arrayBuffer();
  const zipEntries = unzipSync(new Uint8Array(arrayBuffer));
  const importedAt = new Date().toISOString();

  const summaryBytes = zipEntries["benchmark_summary.json"];
  let parsedRaw: Record<string, unknown>;
  let presentCount: number;
  let inventory: RealOdmBundleInventory;

  if (summaryBytes && summaryBytes.length > 0) {
    const parsed = parseManagedBenchmarkSummaryText(strFromU8(summaryBytes));
    parsedRaw = parsed.raw;
    presentCount = parsed.outputs.filter((o) => o.exists && o.nonZeroSize).length;
    inventory = inventoryNodeOdmBundle(zipEntries);
  } else {
    inventory = inventoryNodeOdmBundle(zipEntries);
    if (
      !inventory.orthophoto &&
      !inventory.dsm &&
      !inventory.dtm &&
      !inventory.pointCloud &&
      !inventory.mesh
    ) {
      throw new Error(
        "NodeODM output bundle missing both benchmark_summary.json and recognized ODM output files",
      );
    }
    parsedRaw = synthesizeBenchmarkSummary(inventory, { taskUuid: cursor.taskUuid, importedAt });
    const reparsed = parseManagedBenchmarkSummaryText(JSON.stringify(parsedRaw));
    presentCount = reparsed.outputs.filter((o) => o.exists && o.nonZeroSize).length;
  }

  const copied = await copyInventoryToStorage({ cursor, inventory, zipEntries, importedAt });
  await persistProcessingOutputs({ cursor, copied, importedAt });
  parsedRaw = mergeStorageRefsIntoSummary(parsedRaw, copied);

  return {
    outputCount: presentCount,
    topLevelPatch: {
      benchmarkSummary: parsedRaw as unknown as Json,
    },
    nodeodmPatch: {
      importedAt,
      importedFromTaskUuid: cursor.taskUuid,
      importedOutputCount: presentCount,
      copiedToStorageCount: copied.length,
      storageBucket: copied.length > 0 ? DRONE_OPS_STORAGE_BUCKET : null,
    },
  };
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
  let importedOutputs: number | null = null;

  if (taskInfo.status?.code === 40) {
    let importResult: Awaited<ReturnType<typeof importCompletedOutputs>> = null;
    let importError: string | null = null;
    try {
      importResult = await importCompletedOutputs(cursor);
    } catch (error) {
      importError = error instanceof Error ? error.message : "unknown import error";
    }

    if (importResult) {
      summary.nodeodm = {
        ...(summary.nodeodm as Record<string, unknown>),
        ...importResult.nodeodmPatch,
      };
      Object.assign(summary, importResult.topLevelPatch);
      importedOutputs = importResult.outputCount;
      patch = {
        output_summary: summary,
        status: "succeeded",
        stage: "completed",
        completed_at: new Date().toISOString(),
      };
      await insertJobEvent({
        job_id: cursor.jobId,
        org_id: cursor.orgId,
        event_type: "nodeodm.task.imported",
        payload: {
          taskUuid: cursor.taskUuid,
          outputCount: importResult.outputCount,
        } as Json,
      });
    } else {
      summary.nodeodm = {
        ...(summary.nodeodm as Record<string, unknown>),
        lastImportError: importError ?? "output import unavailable",
      };
      patch = {
        output_summary: summary,
        status: "awaiting_output_import",
        stage: "awaiting-output-import",
      };
    }

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
  return { jobId: cursor.jobId, statusName, progress: taskInfo.progress ?? null, importedOutputs };
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
    const processed: Array<{ jobId: string; statusName: string; progress: number | null; importedOutputs: number | null }> = [];
    const failures: Array<{ jobId: string; error: string }> = [];

    for (const cursor of cursors) {
      try {
        const result = await advanceJobFromTaskInfo(cursor);
        processed.push(result);
        log.info("job.advanced", {
          jobId: result.jobId,
          statusName: result.statusName,
          progress: result.progress,
          importedOutputs: result.importedOutputs,
        });
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
