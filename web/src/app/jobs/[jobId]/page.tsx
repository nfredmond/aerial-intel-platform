import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { BlockedAccessView } from "@/app/dashboard/blocked-access-view";
import { SignOutForm } from "@/app/dashboard/sign-out-form";
import { ManagedOutputImportForm } from "@/components/managed-output-import-form";
import { getDroneOpsAccess } from "@/lib/auth/drone-ops-access";
import {
  formatArtifactHandoffAuditLine,
  getArtifactHandoff,
  summarizeArtifactHandoffs,
  type ArtifactMetadataRecord,
} from "@/lib/artifact-handoff";
import {
  getBenchmarkSummaryView,
} from "@/lib/benchmark-summary";
import { buildRetryJobInputSummary, buildRetryJobOutputSummary, buildRetryOutputSeeds } from "@/lib/job-retries";
import {
  advanceManagedProcessingJob,
  getManagedProcessingNextStep,
  isManagedProcessingJobDetail,
} from "@/lib/managed-processing";
import {
  buildManagedImportStoragePath,
  inferManagedImportFormat,
  mapBenchmarkOutputKeyToArtifactKind,
  parseManagedBenchmarkSummaryText,
  type ManagedImportUploadKind,
} from "@/lib/managed-processing-import";
import { getJobDetail, getString } from "@/lib/missions/detail-data";
import {
  advanceManualProvingJob,
  isManualProvingJobDetail,
} from "@/lib/proving-runs";
import { tryCreateSignedDownloadUrl } from "@/lib/storage-delivery";
import {
  adminSelect,
  insertJobEvent,
  insertProcessingJob,
  insertProcessingOutputs,
  updateProcessingJob,
  updateProcessingOutput,
} from "@/lib/supabase/admin";
import {
  createDroneOpsSignedUploadTicket,
  downloadStorageText,
} from "@/lib/supabase/admin-storage";

function formatDateTime(value: string | null) {
  if (!value) return "TBD";
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) return "TBD";

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(timestamp);
}

function statusClass(status: string) {
  switch (status) {
    case "running":
    case "pending":
      return "status-pill status-pill--info";
    case "succeeded":
    case "ready":
      return "status-pill status-pill--success";
    default:
      return "status-pill status-pill--warning";
  }
}

type StageChecklistItem = {
  label: string;
  status: string;
};

function getStageChecklist(summary: Record<string, unknown>) {
  if (!Array.isArray(summary.stageChecklist)) {
    return [] as StageChecklistItem[];
  }

  return summary.stageChecklist.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return [];
    }

    const label = typeof item.label === "string" ? item.label : "Unnamed stage";
    const status = typeof item.status === "string" ? item.status : "pending";
    return [{ label, status }];
  });
}

function getChecklistStatusClass(status: string) {
  switch (status) {
    case "complete":
      return "status-pill status-pill--success";
    case "running":
      return "status-pill status-pill--info";
    default:
      return "status-pill status-pill--warning";
  }
}

function getCalloutMessage(actionState?: string) {
  if (!actionState) {
    return null;
  }

  if (actionState === "started") {
    return {
      tone: "success",
      text: "Proving job started. The live run is now in an active processing state.",
    } as const;
  }

  if (actionState === "completed") {
    return {
      tone: "success",
      text: "Proving job completed. Output artifacts are now ready for real review/share/export work.",
    } as const;
  }

  if (actionState === "intake-started") {
    return {
      tone: "success",
      text: "Managed intake review started. This request is now active, but host dispatch is still not recorded.",
    } as const;
  }

  if (actionState === "dispatch-recorded") {
    return {
      tone: "success",
      text: "Managed host dispatch recorded. The job now truthfully reflects operator handoff to real processing infrastructure.",
    } as const;
  }

  if (actionState === "qa-started") {
    return {
      tone: "success",
      text: "Managed QA review started. Real outputs are attached and the delivery lane can now be reviewed honestly.",
    } as const;
  }

  if (actionState === "managed-completed") {
    return {
      tone: "success",
      text: "Managed processing request marked delivery-ready. Ready artifacts can now move through review/share/export with truthful audit trail.",
    } as const;
  }

  if (actionState === "imported") {
    return {
      tone: "success",
      text: "Real benchmark evidence and any uploaded outputs were attached to this managed job from the browser. Advance QA/delivery only when the real-world handoff matches the new artifacts.",
    } as const;
  }

  if (actionState === "awaiting-outputs") {
    return {
      tone: "error",
      text: "This managed request cannot advance into QA yet because no real outputs are attached to the job.",
    } as const;
  }

  if (actionState === "awaiting-ready-artifacts") {
    return {
      tone: "error",
      text: "This managed request cannot be marked delivery-ready yet because no attached artifact is marked ready.",
    } as const;
  }

  if (actionState === "not-managed") {
    return {
      tone: "error",
      text: "This job is not marked as a managed processing request, so the managed controls are unavailable.",
    } as const;
  }

  if (actionState === "canceled") {
    return {
      tone: "success",
      text: "Job canceled. The timeline has been updated and the run is no longer active.",
    } as const;
  }

  if (actionState === "retried") {
    return {
      tone: "success",
      text: "Retry job queued. A new processing run has been created from this job configuration.",
    } as const;
  }

  if (actionState === "not-proving") {
    return {
      tone: "error",
      text: "This job is not marked as a proving run, so the proving controls are unavailable.",
    } as const;
  }

  if (actionState === "denied") {
    return {
      tone: "error",
      text: "Viewer access cannot update jobs.",
    } as const;
  }

  return {
    tone: "error",
    text: "The requested job action could not be completed.",
  } as const;
}

export default async function JobDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ jobId: string }>;
  searchParams: Promise<{ action?: string }>;
}) {
  const access = await getDroneOpsAccess();

  if (!access.user) {
    redirect("/sign-in");
  }

  if (!access.hasMembership || !access.hasActiveEntitlement) {
    return <BlockedAccessView access={access} />;
  }

  const { jobId } = await params;
  const resolvedSearchParams = await searchParams;
  const detail = await getJobDetail(access, jobId);

  if (!detail) {
    notFound();
  }

  async function cancelJob() {
    "use server";

    const refreshedAccess = await getDroneOpsAccess();
    if (!refreshedAccess.user) {
      redirect("/sign-in");
    }

    if (!refreshedAccess.org?.id || !refreshedAccess.hasMembership || !refreshedAccess.hasActiveEntitlement) {
      redirect("/dashboard");
    }

    if (refreshedAccess.role === "viewer") {
      redirect(`/jobs/${jobId}?action=denied`);
    }

    const refreshedDetail = await getJobDetail(refreshedAccess, jobId);
    if (!refreshedDetail) {
      redirect("/missions");
    }

    try {
      await updateProcessingJob(refreshedDetail.job.id, {
        status: "canceled",
        stage: "canceled",
        queue_position: null,
        completed_at: new Date().toISOString(),
        output_summary: {
          ...refreshedDetail.outputSummary,
          eta: "Canceled",
          notes: "Job canceled from job detail page.",
        },
      });

      await insertJobEvent({
        org_id: refreshedAccess.org.id,
        job_id: refreshedDetail.job.id,
        event_type: "job.canceled",
        payload: {
          title: "Job canceled",
          detail: "Operator canceled this job from the job detail page.",
        },
      });
    } catch {
      redirect(`/jobs/${jobId}?action=error`);
    }

    redirect(`/jobs/${jobId}?action=canceled`);
  }

  async function retryJob() {
    "use server";

    const refreshedAccess = await getDroneOpsAccess();
    if (!refreshedAccess.user) {
      redirect("/sign-in");
    }

    if (!refreshedAccess.org?.id || !refreshedAccess.hasMembership || !refreshedAccess.hasActiveEntitlement) {
      redirect("/dashboard");
    }

    if (refreshedAccess.role === "viewer") {
      redirect(`/jobs/${jobId}?action=denied`);
    }

    const refreshedDetail = await getJobDetail(refreshedAccess, jobId);
    if (!refreshedDetail) {
      redirect("/missions");
    }

    try {
      const insertedJob = await insertProcessingJob({
        org_id: refreshedAccess.org.id,
        project_id: refreshedDetail.job.project_id,
        site_id: refreshedDetail.job.site_id,
        mission_id: refreshedDetail.job.mission_id,
        dataset_id: refreshedDetail.job.dataset_id,
        engine: refreshedDetail.job.engine,
        preset_id: refreshedDetail.job.preset_id,
        status: "queued",
        stage: "queued",
        progress: 0,
        queue_position: 1,
        input_summary: buildRetryJobInputSummary({
          inputSummary: refreshedDetail.inputSummary,
          engine: refreshedDetail.job.engine,
          previousJobId: refreshedDetail.job.id,
        }),
        output_summary: buildRetryJobOutputSummary({
          outputSummary: refreshedDetail.outputSummary,
          previousJobId: refreshedDetail.job.id,
        }),
        external_job_reference: null,
        created_by: refreshedAccess.user.id,
      });

      if (!insertedJob?.id) {
        redirect(`/jobs/${jobId}?action=error`);
      }

      const retryOutputs = buildRetryOutputSeeds({
        outputs: refreshedDetail.outputs,
        orgId: refreshedAccess.org.id,
        nextJobId: insertedJob.id,
        previousJobId: refreshedDetail.job.id,
      });

      if (retryOutputs.length > 0) {
        await insertProcessingOutputs(retryOutputs);
      }

      await insertJobEvent({
        org_id: refreshedAccess.org.id,
        job_id: insertedJob.id,
        event_type: "job.retried",
        payload: {
          title: "Retry job queued",
          detail: `Retry requested from job ${refreshedDetail.job.id}. ${retryOutputs.length > 0 ? `Restaged ${retryOutputs.length} output placeholder(s) for the new run.` : "No prior outputs existed to restage."}`,
        },
      });

      redirect(`/jobs/${insertedJob.id}?action=retried`);
    } catch {
      redirect(`/jobs/${jobId}?action=error`);
    }
  }

  async function startProvingJob() {
    "use server";

    const refreshedAccess = await getDroneOpsAccess();
    if (!refreshedAccess.user) {
      redirect("/sign-in");
    }

    if (!refreshedAccess.org?.id || !refreshedAccess.hasMembership || !refreshedAccess.hasActiveEntitlement) {
      redirect("/dashboard");
    }

    if (refreshedAccess.role === "viewer") {
      redirect(`/jobs/${jobId}?action=denied`);
    }

    const refreshedDetail = await getJobDetail(refreshedAccess, jobId);
    if (!refreshedDetail) {
      redirect("/missions");
    }

    if (!isManualProvingJobDetail(refreshedDetail)) {
      redirect(`/jobs/${jobId}?action=not-proving`);
    }

    try {
      await advanceManualProvingJob({
        orgId: refreshedAccess.org.id,
        detail: refreshedDetail,
        source: "job-detail",
      });
    } catch {
      redirect(`/jobs/${jobId}?action=error`);
    }

    redirect(`/jobs/${jobId}?action=started`);
  }

  async function completeProvingJob() {
    "use server";

    const refreshedAccess = await getDroneOpsAccess();
    if (!refreshedAccess.user) {
      redirect("/sign-in");
    }

    if (!refreshedAccess.org?.id || !refreshedAccess.hasMembership || !refreshedAccess.hasActiveEntitlement) {
      redirect("/dashboard");
    }

    if (refreshedAccess.role === "viewer") {
      redirect(`/jobs/${jobId}?action=denied`);
    }

    const refreshedDetail = await getJobDetail(refreshedAccess, jobId);
    if (!refreshedDetail) {
      redirect("/missions");
    }

    if (!isManualProvingJobDetail(refreshedDetail)) {
      redirect(`/jobs/${jobId}?action=not-proving`);
    }

    try {
      await advanceManualProvingJob({
        orgId: refreshedAccess.org.id,
        detail: refreshedDetail,
        source: "job-detail",
      });
    } catch {
      redirect(`/jobs/${jobId}?action=error`);
    }

    redirect(`/jobs/${jobId}?action=completed`);
  }

  async function advanceManagedJob() {
    "use server";

    const refreshedAccess = await getDroneOpsAccess();
    if (!refreshedAccess.user) {
      redirect("/sign-in");
    }

    if (!refreshedAccess.org?.id || !refreshedAccess.hasMembership || !refreshedAccess.hasActiveEntitlement) {
      redirect("/dashboard");
    }

    if (refreshedAccess.role === "viewer") {
      redirect(`/jobs/${jobId}?action=denied`);
    }

    const refreshedDetail = await getJobDetail(refreshedAccess, jobId);
    if (!refreshedDetail) {
      redirect("/missions");
    }

    try {
      const result = await advanceManagedProcessingJob({
        orgId: refreshedAccess.org.id,
        detail: refreshedDetail,
        source: "job-detail",
      });

      redirect(`/jobs/${jobId}?action=${result}`);
    } catch {
      redirect(`/jobs/${jobId}?action=error`);
    }
  }

  async function prepareManagedImportUpload(formData: FormData) {
    "use server";

    const refreshedAccess = await getDroneOpsAccess();
    if (!refreshedAccess.user) {
      return { ok: false as const, error: "Please sign in again before uploading import evidence." };
    }

    if (!refreshedAccess.org?.id || !refreshedAccess.org.slug || !refreshedAccess.hasMembership || !refreshedAccess.hasActiveEntitlement) {
      return { ok: false as const, error: "The current organization context is missing or inactive." };
    }

    if (refreshedAccess.role === "viewer") {
      return { ok: false as const, error: "Viewer access cannot upload managed import evidence." };
    }

    const refreshedDetail = await getJobDetail(refreshedAccess, jobId);
    if (!refreshedDetail || !isManagedProcessingJobDetail(refreshedDetail)) {
      return { ok: false as const, error: "This job is not eligible for browser-based managed import." };
    }

    const uploadKindValue = formData.get("uploadKind");
    const uploadKind = typeof uploadKindValue === "string" ? uploadKindValue.trim() as ManagedImportUploadKind : null;
    const uploadFilenameValue = formData.get("uploadFilename");
    const uploadFilename = typeof uploadFilenameValue === "string" ? uploadFilenameValue.trim() : "";

    if (!uploadKind || !uploadFilename) {
      return { ok: false as const, error: "Upload kind and filename are required before requesting a signed upload URL." };
    }

    if (uploadKind === "benchmark_summary" && !uploadFilename.toLowerCase().endsWith(".json")) {
      return { ok: false as const, error: "The benchmark summary upload must be a JSON file." };
    }

    if (uploadKind === "review_bundle" && !uploadFilename.toLowerCase().endsWith(".zip")) {
      return { ok: false as const, error: "The review bundle upload must be a ZIP file." };
    }

    try {
      const path = buildManagedImportStoragePath({
        orgSlug: refreshedAccess.org.slug,
        jobId: refreshedDetail.job.id,
        kind: uploadKind,
        filename: uploadFilename,
      });
      const ticket = await createDroneOpsSignedUploadTicket(path);

      return {
        ok: true as const,
        bucket: ticket.bucket,
        path: ticket.path,
        token: ticket.token,
        kind: uploadKind,
        filename: uploadFilename,
      };
    } catch (error) {
      const message = error instanceof Error && error.message.trim().length > 0
        ? error.message
        : "A signed upload URL could not be created for this managed import file.";
      return { ok: false as const, error: message };
    }
  }

  async function finalizeManagedImport(formData: FormData) {
    "use server";

    const refreshedAccess = await getDroneOpsAccess();
    if (!refreshedAccess.user) {
      return { ok: false as const, error: "Please sign in again before finalizing the managed import." };
    }

    if (!refreshedAccess.org?.id || !refreshedAccess.hasMembership || !refreshedAccess.hasActiveEntitlement) {
      return { ok: false as const, error: "The current organization context is missing or inactive." };
    }

    if (refreshedAccess.role === "viewer") {
      return { ok: false as const, error: "Viewer access cannot finalize managed imports." };
    }

    const refreshedDetail = await getJobDetail(refreshedAccess, jobId);
    if (!refreshedDetail || !isManagedProcessingJobDetail(refreshedDetail)) {
      return { ok: false as const, error: "This job is not eligible for browser-based managed import." };
    }

    const summaryBucketValue = formData.get("benchmark_summaryBucket");
    const summaryBucket = typeof summaryBucketValue === "string" && summaryBucketValue.trim().length > 0
      ? summaryBucketValue.trim()
      : null;
    const summaryPathValue = formData.get("benchmark_summaryPath");
    const summaryPath = typeof summaryPathValue === "string" && summaryPathValue.trim().length > 0
      ? summaryPathValue.trim()
      : null;

    if (!summaryBucket || !summaryPath) {
      return { ok: false as const, error: "Upload a benchmark summary JSON before finalizing this managed import." };
    }

    let summaryText: string;
    try {
      summaryText = await downloadStorageText({ bucket: summaryBucket, path: summaryPath });
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error && error.message.trim().length > 0
          ? error.message
          : "The uploaded benchmark summary could not be downloaded for parsing.",
      };
    }

    let parsedSummary;
    try {
      parsedSummary = parseManagedBenchmarkSummaryText(summaryText);
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error && error.message.trim().length > 0
          ? error.message
          : "The uploaded benchmark summary could not be parsed.",
      };
    }

    const runLogBucket = typeof formData.get("run_logBucket") === "string" ? String(formData.get("run_logBucket")).trim() : "";
    const runLogPath = typeof formData.get("run_logPath") === "string" ? String(formData.get("run_logPath")).trim() : "";
    const reviewBundleBucket = typeof formData.get("review_bundleBucket") === "string" ? String(formData.get("review_bundleBucket")).trim() : "";
    const reviewBundlePath = typeof formData.get("review_bundlePath") === "string" ? String(formData.get("review_bundlePath")).trim() : "";
    const operatorNotesValue = formData.get("operatorNotes");
    const operatorNotes = typeof operatorNotesValue === "string" && operatorNotesValue.trim().length > 0
      ? operatorNotesValue.trim()
      : null;

    const existingOutputs = await adminSelect<Array<{ id: string; kind: string }>>(
      `drone_processing_outputs?org_id=eq.${encodeURIComponent(refreshedAccess.org.id)}&job_id=eq.${encodeURIComponent(refreshedDetail.job.id)}&select=id,kind`,
    );

    const outputsToInsert: Array<{
      org_id: string;
      job_id: string;
      mission_id?: string | null;
      dataset_id?: string | null;
      kind: string;
      status?: string;
      storage_bucket?: string | null;
      storage_path?: string | null;
      metadata?: Parameters<typeof insertProcessingOutputs>[0][number]["metadata"];
    }> = [];

    for (const output of parsedSummary.outputs) {
      if (!output.exists || !output.nonZeroSize) {
        continue;
      }

      const artifactKind = mapBenchmarkOutputKeyToArtifactKind(output.key);
      if (!artifactKind) {
        continue;
      }

      const uploadedBucketValue = formData.get(`${output.key}Bucket`);
      const uploadedBucket = typeof uploadedBucketValue === "string" && uploadedBucketValue.trim().length > 0
        ? uploadedBucketValue.trim()
        : null;
      const uploadedPathValue = formData.get(`${output.key}Path`);
      const uploadedPath = typeof uploadedPathValue === "string" && uploadedPathValue.trim().length > 0
        ? uploadedPathValue.trim()
        : null;
      const existingOutput = existingOutputs.find((item) => item.kind === artifactKind) ?? null;
      const patch = {
        status: "ready",
        storage_bucket: uploadedBucket,
        storage_path: uploadedPath ?? output.path,
        metadata: {
          name: `${refreshedDetail.mission?.name ?? "Mission"} ${artifactKind.replaceAll("_", " ")}`,
          format: inferManagedImportFormat(output.key, uploadedPath ?? output.path),
          delivery: uploadedBucket && uploadedPath ? "Protected download ready" : "Imported benchmark evidence",
          benchmark: {
            key: output.key,
            exists: output.exists,
            nonZeroSize: output.nonZeroSize,
            sizeBytes: output.sizeBytes,
            sourcePath: output.path,
          },
          storagePublication: uploadedBucket && uploadedPath
            ? {
                published: true,
                bucket: uploadedBucket,
                path: uploadedPath,
                publishedAt: new Date().toISOString(),
              }
            : {
                published: false,
              },
        },
      };

      if (existingOutput?.id) {
        await updateProcessingOutput(existingOutput.id, patch);
      } else {
        outputsToInsert.push({
          org_id: refreshedAccess.org.id,
          job_id: refreshedDetail.job.id,
          mission_id: refreshedDetail.job.mission_id,
          dataset_id: refreshedDetail.job.dataset_id,
          kind: artifactKind,
          ...patch,
        });
      }
    }

    if (outputsToInsert.length > 0) {
      await insertProcessingOutputs(outputsToInsert);
    }

    const nextLogTail = Array.isArray(refreshedDetail.outputSummary.logTail)
      ? refreshedDetail.outputSummary.logTail.filter((line): line is string => typeof line === "string")
      : [];

    await updateProcessingJob(refreshedDetail.job.id, {
      output_summary: {
        ...refreshedDetail.outputSummary,
        benchmarkSummary: parsedSummary.raw,
        runLogPath: runLogBucket && runLogPath ? `${runLogBucket}/${runLogPath}` : refreshedDetail.outputSummary.runLogPath,
        logTail: nextLogTail.length > 0 ? nextLogTail : [
          "Browser-managed import attached benchmark evidence.",
          parsedSummary.minimumPass
            ? "Benchmark summary cleared minimum pass."
            : `Benchmark summary still needs review: ${parsedSummary.missingRequiredOutputs.join(", ") || "see summary"}.`,
          reviewBundleBucket && reviewBundlePath
            ? "Protected review bundle uploaded for delivery review."
            : "No review bundle ZIP uploaded in this import pass.",
        ],
        latestCheckpoint: "Browser-managed import attached real outputs/evidence",
        notes: operatorNotes
          ? `${getString(refreshedDetail.outputSummary.notes, "Managed import updated from job detail.")}

Operator note: ${operatorNotes}`
          : refreshedDetail.outputSummary.notes ?? "Managed import updated from job detail.",
        deliveryPackage: {
          publishedToStorage: true,
          benchmarkSummary: {
            bucket: summaryBucket,
            path: summaryPath,
          },
          runLog: runLogBucket && runLogPath ? { bucket: runLogBucket, path: runLogPath } : null,
          reviewBundle: reviewBundleBucket && reviewBundlePath ? { bucket: reviewBundleBucket, path: reviewBundlePath } : null,
        },
      },
    });

    await insertJobEvent({
      org_id: refreshedAccess.org.id,
      job_id: refreshedDetail.job.id,
      event_type: "benchmark.outputs.attached",
      payload: {
        title: "Browser-managed import attached",
        detail: `Real benchmark evidence${outputsToInsert.length > 0 ? ` and ${outputsToInsert.length} new output record(s)` : ""} were attached from the browser-managed import lane.`,
        summaryPath: `${summaryBucket}/${summaryPath}`,
      },
    });

    await insertJobEvent({
      org_id: refreshedAccess.org.id,
      job_id: refreshedDetail.job.id,
      event_type: "delivery.package.published",
      payload: {
        title: reviewBundleBucket && reviewBundlePath ? "Protected review bundle published" : "Managed evidence updated",
        detail: reviewBundleBucket && reviewBundlePath
          ? "A protected review bundle ZIP was uploaded and linked to this managed job for delivery review."
          : "Benchmark evidence was attached from the browser, but no review bundle ZIP was uploaded in this pass.",
      },
    });

    return { ok: true as const, redirectTo: `/jobs/${jobId}?action=imported` };
  }

  const benchmarkSummary = getBenchmarkSummaryView(detail.outputSummary.benchmarkSummary ?? detail.outputSummary);
  const latestCheckpoint = getString(detail.outputSummary.latestCheckpoint, "No checkpoint recorded yet.");
  const stageChecklist = getStageChecklist(detail.outputSummary);
  const logTail = Array.isArray(detail.outputSummary.logTail)
    ? detail.outputSummary.logTail.filter((line): line is string => typeof line === "string")
    : [];
  const handoffCounts = summarizeArtifactHandoffs(
    detail.outputs.map((output) =>
      output.metadata && typeof output.metadata === "object" && !Array.isArray(output.metadata)
        ? (output.metadata as ArtifactMetadataRecord)
        : {},
    ),
  );
  const provingJob = isManualProvingJobDetail(detail);
  const managedJob = isManagedProcessingJobDetail(detail);
  const managedNextStep = managedJob ? getManagedProcessingNextStep(detail) : null;
  const outputDownloadUrls = new Map(
    await Promise.all(
      detail.outputs.map(async (output) => [
        output.id,
        await tryCreateSignedDownloadUrl({
          bucket: output.storage_bucket,
          path: output.storage_path,
          download: `${output.kind.replaceAll("_", " ")}`,
        }),
      ] as const),
    ),
  );
  const deliveryPackage = detail.outputSummary.deliveryPackage && typeof detail.outputSummary.deliveryPackage === "object" && !Array.isArray(detail.outputSummary.deliveryPackage)
    ? (detail.outputSummary.deliveryPackage as Record<string, unknown>)
    : {};
  const deliveryReviewBundle = deliveryPackage.reviewBundle && typeof deliveryPackage.reviewBundle === "object" && !Array.isArray(deliveryPackage.reviewBundle)
    ? (deliveryPackage.reviewBundle as Record<string, unknown>)
    : null;
  const reviewBundleDownloadUrl = await tryCreateSignedDownloadUrl({
    bucket: typeof deliveryReviewBundle?.bucket === "string" ? deliveryReviewBundle.bucket : undefined,
    path: typeof deliveryReviewBundle?.path === "string" ? deliveryReviewBundle.path : undefined,
    download: "review-bundle.zip",
  });
  const firstReadyOutput = detail.outputs.find((output) => output.status === "ready") ?? null;
  const callout = getCalloutMessage(resolvedSearchParams.action);

  return (
    <main className="app-shell stack-md">
      <section className="surface section-header">
        <div className="stack-sm">
          <p className="eyebrow">Job detail</p>
          <h1>{getString(detail.inputSummary.name, `${detail.job.engine.toUpperCase()} job`)}</h1>
          <p className="muted">
            {detail.project?.name ?? "Project pending"}
            {detail.mission ? ` · ${detail.mission.name}` : ""}
          </p>
        </div>

        <div className="header-actions">
          <Link href={detail.mission ? `/missions/${detail.mission.id}` : "/missions"} className="button button-secondary">
            Back
          </Link>
          <SignOutForm label="Sign out" variant="secondary" />
        </div>
      </section>

      {callout ? (
        <section className={callout.tone === "success" ? "callout callout-success" : "callout callout-error"}>
          {callout.text}
        </section>
      ) : null}

      <section className="detail-grid">
        <article className="surface stack-sm">
          <div className="stack-xs">
            <p className="eyebrow">Execution status</p>
            <h2>Job lifecycle</h2>
          </div>

          <dl className="mission-meta-grid">
            <div className="kv-row">
              <dt>Status</dt>
              <dd><span className={statusClass(detail.job.status)}>{detail.job.status}</span></dd>
            </div>
            <div className="kv-row">
              <dt>Stage</dt>
              <dd>{detail.job.stage}</dd>
            </div>
            <div className="kv-row">
              <dt>Engine</dt>
              <dd>{detail.job.engine}</dd>
            </div>
            <div className="kv-row">
              <dt>Preset</dt>
              <dd>{detail.job.preset_id ?? "Default"}</dd>
            </div>
            <div className="kv-row">
              <dt>Progress</dt>
              <dd>{detail.job.progress}%</dd>
            </div>
            <div className="kv-row">
              <dt>Queue position</dt>
              <dd>{detail.job.queue_position ?? "Running / not queued"}</dd>
            </div>
            <div className="kv-row">
              <dt>Started</dt>
              <dd>{formatDateTime(detail.job.started_at ?? detail.job.created_at)}</dd>
            </div>
            <div className="kv-row">
              <dt>Completed</dt>
              <dd>{formatDateTime(detail.job.completed_at)}</dd>
            </div>
          </dl>
        </article>

        <aside className="surface stack-sm">
          <div className="stack-xs">
            <p className="eyebrow">Source context</p>
            <h2>Mission + dataset</h2>
          </div>
          <dl className="kv-grid">
            <div className="kv-row">
              <dt>Mission</dt>
              <dd>{detail.mission?.name ?? "No mission linked"}</dd>
            </div>
            <div className="kv-row">
              <dt>Site</dt>
              <dd>{detail.site?.name ?? "No site linked"}</dd>
            </div>
            <div className="kv-row">
              <dt>Dataset</dt>
              <dd>{detail.dataset?.name ?? "No dataset linked"}</dd>
            </div>
            <div className="kv-row">
              <dt>External ref</dt>
              <dd>{detail.job.external_job_reference ?? "None"}</dd>
            </div>
            <div className="kv-row">
              <dt>ETA</dt>
              <dd>{getString(detail.outputSummary.eta, "Pending")}</dd>
            </div>
          </dl>

          <div className="stack-xs surface-form-shell">
            <h3>Job controls</h3>
            <form action={retryJob}>
              <button type="submit" className="button button-secondary" disabled={access.role === "viewer"}>
                Retry job
              </button>
            </form>
            <form action={cancelJob}>
              <button
                type="submit"
                className="button button-secondary"
                disabled={access.role === "viewer" || !["queued", "running"].includes(detail.job.status)}
              >
                Cancel job
              </button>
            </form>
            {!( ["queued", "running"].includes(detail.job.status)) ? (
              <p className="muted">Cancel is only available for queued or running jobs.</p>
            ) : null}
          </div>

          {provingJob ? (
            <div className="stack-xs surface-form-shell">
              <h3>Proving override controls</h3>
              <p className="muted">
                The proving worker heartbeat now auto-progresses queued/running proving jobs out of band. Use these only as manual overrides if you need to force the next honest state immediately.
              </p>
              <form action={startProvingJob}>
                <button
                  type="submit"
                  className="button button-secondary"
                  disabled={access.role === "viewer" || detail.job.status !== "queued"}
                >
                  Start proving job
                </button>
              </form>
              <form action={completeProvingJob}>
                <button
                  type="submit"
                  className="button button-primary"
                  disabled={access.role === "viewer" || !["queued", "running"].includes(detail.job.status)}
                >
                  Complete proving job
                </button>
              </form>
            </div>
          ) : null}

          {managedJob && managedNextStep ? (
            <div className="stack-xs surface-form-shell">
              <h3>Managed-processing controls</h3>
              <p className="muted">
                This job is an operator-assisted managed processing request. Advance it only when the corresponding real-world handoff has actually happened.
              </p>
              <form action={advanceManagedJob}>
                <button
                  type="submit"
                  className="button button-primary"
                  disabled={access.role === "viewer" || managedNextStep.disabled}
                >
                  {managedNextStep.label}
                </button>
              </form>
              <p className="muted">{managedNextStep.helper}</p>
            </div>
          ) : null}

          {managedJob ? (
            <ManagedOutputImportForm
              disabled={access.role === "viewer"}
              prepareUpload={prepareManagedImportUpload}
              finalizeImport={finalizeManagedImport}
            />
          ) : null}

          {provingJob ? (
            <div className="stack-xs surface-form-shell">
              <h3>Live proving next step</h3>
              {detail.job.status === "queued" ? (
                <>
                  <p className="muted">This proving job is queued. The worker heartbeat will pick it up automatically after a short delay, or you can force-start it here.</p>
                  <form action={startProvingJob}>
                    <button
                      type="submit"
                      className="button button-primary"
                      disabled={access.role === "viewer"}
                    >
                      Force start now
                    </button>
                  </form>
                </>
              ) : detail.job.status === "running" ? (
                <>
                  <p className="muted">This proving job is running. The worker heartbeat will complete it automatically after enough elapsed time, or you can force-complete it here.</p>
                  <form action={completeProvingJob}>
                    <button
                      type="submit"
                      className="button button-primary"
                      disabled={access.role === "viewer"}
                    >
                      Force complete now
                    </button>
                  </form>
                </>
              ) : firstReadyOutput ? (
                <>
                  <p className="muted">The proving job has ready artifacts. Next step is to review/share/export the first deliverable.</p>
                  <Link href={`/artifacts/${firstReadyOutput.id}`} className="button button-primary">
                    Review first ready artifact
                  </Link>
                </>
              ) : (
                <>
                  <p className="muted">This proving job is no longer active. Review the mission or retry the run if more evidence is needed.</p>
                  <Link href={detail.mission ? `/missions/${detail.mission.id}` : "/missions"} className="button button-secondary">
                    Back to mission
                  </Link>
                </>
              )}
            </div>
          ) : null}
        </aside>
      </section>

      <section className="grid-cards">
        <article className="surface stack-sm info-card">
          <div className="stack-xs">
            <p className="eyebrow">Outputs</p>
            <h2>Artifact readiness</h2>
          </div>
          <div className="stack-xs">
            {detail.outputs.map((output) => {
              const handoff = getArtifactHandoff(
                output.metadata && typeof output.metadata === "object" && !Array.isArray(output.metadata)
                  ? (output.metadata as ArtifactMetadataRecord)
                  : {},
              );

              return (
                <article key={output.id} className="ops-list-card stack-xs">
                  <div className="ops-list-card-header">
                    <strong>{output.kind.replaceAll("_", " ")}</strong>
                    <span className={statusClass(output.status)}>{output.status}</span>
                  </div>
                  <p className="muted">{output.storage_path ?? "Storage path pending"}</p>
                  <p className="muted">Handoff: {handoff.stageLabel}</p>
                  {handoff.note ? <p className="muted">Note: {handoff.note}</p> : null}
                  {formatArtifactHandoffAuditLine(handoff) ? <p className="muted">{formatArtifactHandoffAuditLine(handoff)}</p> : null}
                  <div className="header-actions">
                    <Link href={`/artifacts/${output.id}`} className="button button-secondary">
                      Review artifact
                    </Link>
                    {outputDownloadUrls.get(output.id) ? (
                      <a href={outputDownloadUrls.get(output.id) ?? undefined} className="button button-primary" target="_blank" rel="noreferrer">
                        Download
                      </a>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        </article>

        <article className="surface stack-sm info-card">
          <div className="stack-xs">
            <p className="eyebrow">Handoff posture</p>
            <h2>Review/share/export counts</h2>
          </div>
          <dl className="kv-grid">
            <div className="kv-row">
              <dt>Pending review</dt>
              <dd>{handoffCounts.pendingReviewCount}</dd>
            </div>
            <div className="kv-row">
              <dt>Reviewed</dt>
              <dd>{handoffCounts.reviewedCount}</dd>
            </div>
            <div className="kv-row">
              <dt>Shared</dt>
              <dd>{handoffCounts.sharedCount}</dd>
            </div>
            <div className="kv-row">
              <dt>Exported</dt>
              <dd>{handoffCounts.exportedCount}</dd>
            </div>
          </dl>
          {reviewBundleDownloadUrl ? (
            <a href={reviewBundleDownloadUrl} className="button button-secondary" target="_blank" rel="noreferrer">
              Download review bundle ZIP
            </a>
          ) : null}
          <p className="muted">{getString(detail.outputSummary.notes, "No job notes recorded yet.")}</p>
        </article>
      </section>

      {benchmarkSummary ? (
        <section className="surface stack-sm">
          <div className="stack-xs">
            <p className="eyebrow">Benchmark evidence</p>
            <h2>ODM benchmark summary</h2>
            <p className="muted">
              This job includes imported benchmark evidence so output readiness can be reviewed against a real run summary instead of placeholder-only state.
            </p>
          </div>

          <div className="grid-cards">
            <article className="surface-form-shell stack-sm">
              <dl className="mission-meta-grid">
                <div className="kv-row">
                  <dt>Benchmark status</dt>
                  <dd><span className={statusClass(benchmarkSummary.status)}>{benchmarkSummary.status}</span></dd>
                </div>
                <div className="kv-row">
                  <dt>QA gate</dt>
                  <dd>
                    <span className={benchmarkSummary.minimumPass ? "status-pill status-pill--success" : "status-pill status-pill--warning"}>
                      {benchmarkSummary.minimumPass ? "Minimum pass" : "Needs review"}
                    </span>
                  </dd>
                </div>
                <div className="kv-row">
                  <dt>Image count</dt>
                  <dd>{benchmarkSummary.imageCount}</dd>
                </div>
                <div className="kv-row">
                  <dt>Duration</dt>
                  <dd>{benchmarkSummary.durationSeconds} sec</dd>
                </div>
                <div className="kv-row mission-meta-grid__wide">
                  <dt>ODM image</dt>
                  <dd>{benchmarkSummary.odmImage}</dd>
                </div>
                <div className="kv-row mission-meta-grid__wide">
                  <dt>Run log</dt>
                  <dd>{benchmarkSummary.runLog}</dd>
                </div>
              </dl>
            </article>

            <article className="surface-form-shell stack-sm">
              <div className="stack-xs">
                <h3>QA posture</h3>
                <p className="muted">
                  Required outputs present: {benchmarkSummary.requiredOutputsPresent ? "yes" : "no"}
                </p>
              </div>
              <ul className="action-list mission-blocker-list">
                {benchmarkSummary.missingRequiredOutputs.length > 0 ? (
                  benchmarkSummary.missingRequiredOutputs.map((item) => <li key={item}>Missing required output: {item}</li>)
                ) : (
                  <li>All required benchmark outputs are present.</li>
                )}
              </ul>
            </article>
          </div>

          <div className="stack-xs">
            <h3>Benchmark outputs</h3>
            <div className="stack-xs">
              {benchmarkSummary.outputs.map((output) => (
                <article key={output.key} className="ops-list-card">
                  <div className="ops-list-card-header">
                    <strong>{output.key.replaceAll("_", " ")}</strong>
                    <span className={output.exists && output.nonZeroSize ? "status-pill status-pill--success" : "status-pill status-pill--warning"}>
                      {output.exists && output.nonZeroSize ? "ready" : "missing"}
                    </span>
                  </div>
                  <p className="muted">{output.path}</p>
                  <p className="muted">{output.sizeBytes} bytes</p>
                </article>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <section className="surface stack-sm">
        <div className="stack-xs">
          <p className="eyebrow">Processing checkpoints</p>
          <h2>Current proving posture</h2>
          <p className="muted">
            This surfaces the latest proving checkpoint and stage-by-stage posture so operators can see where the live run actually stands before reading the raw logs.
          </p>
        </div>
        <div className="grid-cards">
          <article className="surface-form-shell stack-sm">
            <dl className="kv-grid">
              <div className="kv-row">
                <dt>Latest checkpoint</dt>
                <dd>{latestCheckpoint}</dd>
              </div>
              <div className="kv-row">
                <dt>Log path</dt>
                <dd>{getString(detail.outputSummary.runLogPath, benchmarkSummary?.runLog ?? "No log path recorded")}</dd>
              </div>
            </dl>
          </article>
          <article className="surface-form-shell stack-sm">
            <div className="stack-xs">
              <h3>Stage checklist</h3>
              <p className="muted">Checkpoint status written by the proving-flow helper.</p>
            </div>
            {stageChecklist.length > 0 ? (
              <div className="stack-xs">
                {stageChecklist.map((item) => (
                  <article key={`${item.label}-${item.status}`} className="ops-list-card">
                    <div className="ops-list-card-header">
                      <strong>{item.label}</strong>
                      <span className={getChecklistStatusClass(item.status)}>{item.status}</span>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p className="muted">No proving stage checklist has been recorded for this job yet.</p>
            )}
          </article>
        </div>
        <div className="stack-xs">
          <h3>Execution log tail</h3>
          {logTail.length > 0 ? (
            <pre className="log-panel">{logTail.join("\n")}</pre>
          ) : (
            <p className="muted">No log tail has been imported for this job yet.</p>
          )}
        </div>
      </section>

      <section className="surface stack-sm">
        <div className="stack-xs">
          <p className="eyebrow">Event history</p>
          <h2>Processing timeline</h2>
        </div>
        <div className="stack-xs">
          {detail.events.map((event) => {
            const payload = (event.payload as Record<string, string | undefined>) ?? {};
            return (
              <article key={event.id} className="ops-event-card stack-xs">
                <div className="ops-list-card-header">
                  <strong>{payload.title ?? event.event_type}</strong>
                  <span className="muted">{formatDateTime(event.created_at)}</span>
                </div>
                <p className="muted">{payload.detail ?? "No event detail"}</p>
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}
