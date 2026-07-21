"use server";

import { redirect } from "next/navigation";

import { canPerformDroneOpsAction } from "@/lib/auth/actions";
import { getDroneOpsAccess } from "@/lib/auth/drone-ops-access";
import {
  buildBrowserZipIntakeDraft,
  buildBrowserZipStoragePath,
  isZipFilename,
} from "@/lib/browser-zip-intake";
import { parseGeoJsonSurface } from "@/lib/geojson";
import { buildManagedProcessingRequestSummary } from "@/lib/managed-processing";
import { getJobDetail, getMissionDetail } from "@/lib/missions/detail-data";
import {
  advanceManualProvingJob,
  isProvingJobRecord,
  isProvingLaneEnabled,
} from "@/lib/proving-runs";
import { normalizeSlug } from "@/lib/slug";
import {
  insertDataset,
  insertIngestSession,
  insertJobEvent,
  insertProcessingJob,
  insertProcessingOutputs,
  updateIngestSession,
  updateMission,
  updateMissionVersion,
} from "@/lib/supabase/admin";
import {
  createDroneOpsSignedUploadTicket,
  downloadStorageBytes,
  uploadStorageBytes,
} from "@/lib/supabase/admin-storage";
import { streamZipImages } from "@/lib/zip-extraction";

function buildPreflightSummary(input: {
  imageCount: number;
  overlapFront: number;
  overlapSide: number;
  gcpCaptured: boolean;
  datasetKind: string;
}) {
  const findings: string[] = [];
  let status: "ready" | "preflight_flagged" = "ready";

  if (input.imageCount < 100) {
    findings.push("Low image count for robust reconstruction; confirm coverage before processing.");
    status = "preflight_flagged";
  }

  if (input.overlapFront < 75) {
    findings.push("Front overlap is below 75%; corridor continuity may be weak.");
    status = "preflight_flagged";
  }

  if (input.overlapSide < 65) {
    findings.push("Side overlap is below 65%; orthomosaic seam risk is elevated.");
    status = "preflight_flagged";
  }

  if (!input.gcpCaptured) {
    findings.push("No GCPs recorded; relative mapping is fine, but survey-grade claims should stay qualified.");
  }

  if (input.datasetKind !== "image") {
    findings.push(`Dataset kind is ${input.datasetKind}; preflight assumptions are image-first and may need manual review.`);
  }

  if (findings.length === 0) {
    findings.push("Capture pattern meets baseline overlap and count checks.");
  }

  return {
    status,
    findings,
    reviewed: false,
  };
}

export async function attachDataset(missionId: string, formData: FormData) {
  const refreshedAccess = await getDroneOpsAccess();
  if (!refreshedAccess.user) {
    redirect("/sign-in");
  }

  if (!refreshedAccess.org?.id || !refreshedAccess.hasMembership || !refreshedAccess.hasActiveEntitlement) {
    redirect("/dashboard");
  }

  if (!canPerformDroneOpsAction(refreshedAccess, "datasets.write")) {
    redirect(`/missions/${missionId}?attached=denied`);
  }

  const refreshedDetail = await getMissionDetail(refreshedAccess, missionId);
  if (!refreshedDetail) {
    redirect("/missions");
  }

  const datasetNameValue = formData.get("datasetName");
  const datasetName = typeof datasetNameValue === "string" ? datasetNameValue.trim() : "";
  if (!datasetName) {
    redirect(`/missions/${missionId}?attached=missing-name`);
  }

  const datasetKindValue = formData.get("datasetKind");
  const datasetKind = typeof datasetKindValue === "string" && datasetKindValue.trim()
    ? datasetKindValue.trim()
    : "image";

  const imageCountValue = formData.get("imageCount");
  const imageCount = Number(imageCountValue);
  const overlapFront = Number(formData.get("overlapFront"));
  const overlapSide = Number(formData.get("overlapSide"));
  const gcpCaptured = formData.get("gcpCaptured") === "on";
  const preflight = buildPreflightSummary({
    imageCount: Number.isFinite(imageCount) ? imageCount : 0,
    overlapFront: Number.isFinite(overlapFront) ? overlapFront : 80,
    overlapSide: Number.isFinite(overlapSide) ? overlapSide : 70,
    gcpCaptured,
    datasetKind,
  });

  try {
    const slug = `${normalizeSlug(datasetName) || "dataset"}-${refreshedDetail.datasets.length + 1}`;

    await insertDataset({
      org_id: refreshedAccess.org.id,
      project_id: refreshedDetail.mission.project_id,
      site_id: refreshedDetail.mission.site_id,
      mission_id: refreshedDetail.mission.id,
      name: datasetName,
      slug,
      kind: datasetKind,
      status: preflight.status,
      captured_at: new Date().toISOString(),
      metadata: {
        imageCount: Number.isFinite(imageCount) ? imageCount : 0,
        footprint: "Footprint pending planner/dataset ingest linkage",
        finding: "Attached from mission detail page. Full preflight ingestion is still pending.",
        preflight: {
          ...preflight,
          overlapFront: Number.isFinite(overlapFront) ? overlapFront : 80,
          overlapSide: Number.isFinite(overlapSide) ? overlapSide : 70,
          gcpCaptured,
        },
      },
      created_by: refreshedAccess.user.id,
    });
  } catch {
    redirect(`/missions/${missionId}?attached=error`);
  }

  redirect(`/missions/${missionId}?attached=1`);
}

export async function recordIngestSession(missionId: string, formData: FormData) {
  const refreshedAccess = await getDroneOpsAccess();
  if (!refreshedAccess.user) {
    redirect("/sign-in");
  }

  if (!refreshedAccess.org?.id || !refreshedAccess.hasMembership || !refreshedAccess.hasActiveEntitlement) {
    redirect("/dashboard");
  }

  if (!canPerformDroneOpsAction(refreshedAccess, "ingest.write")) {
    redirect(`/missions/${missionId}?ingest=denied`);
  }

  const refreshedDetail = await getMissionDetail(refreshedAccess, missionId);
  if (!refreshedDetail) {
    redirect("/missions");
  }

  const labelValue = formData.get("sessionLabel");
  const sessionLabel = typeof labelValue === "string" ? labelValue.trim() : "";
  if (!sessionLabel) {
    redirect(`/missions/${missionId}?ingest=missing-label`);
  }

  const sourceTypeValue = formData.get("sourceType");
  const sourceType = typeof sourceTypeValue === "string" && sourceTypeValue.trim().length > 0
    ? sourceTypeValue.trim()
    : "local_zip";

  const statusValue = formData.get("sessionStatus");
  const sessionStatus = typeof statusValue === "string" && statusValue.trim().length > 0
    ? statusValue.trim()
    : "recorded";

  const sourceFilenameValue = formData.get("sourceFilename");
  const sourceFilename = typeof sourceFilenameValue === "string" && sourceFilenameValue.trim().length > 0
    ? sourceFilenameValue.trim()
    : null;

  const sourceZipPathValue = formData.get("sourceZipPath");
  const sourceZipPath = typeof sourceZipPathValue === "string" && sourceZipPathValue.trim().length > 0
    ? sourceZipPathValue.trim()
    : null;

  const extractedDatasetPathValue = formData.get("extractedDatasetPath");
  const extractedDatasetPath = typeof extractedDatasetPathValue === "string" && extractedDatasetPathValue.trim().length > 0
    ? extractedDatasetPathValue.trim()
    : null;

  const benchmarkSummaryPathValue = formData.get("benchmarkSummaryPath");
  const benchmarkSummaryPath = typeof benchmarkSummaryPathValue === "string" && benchmarkSummaryPathValue.trim().length > 0
    ? benchmarkSummaryPathValue.trim()
    : null;

  const runLogPathValue = formData.get("runLogPath");
  const runLogPath = typeof runLogPathValue === "string" && runLogPathValue.trim().length > 0
    ? runLogPathValue.trim()
    : null;

  const reviewBundleZipPathValue = formData.get("reviewBundleZipPath");
  const reviewBundleZipPath = typeof reviewBundleZipPathValue === "string" && reviewBundleZipPathValue.trim().length > 0
    ? reviewBundleZipPathValue.trim()
    : null;

  const imageCountValue = Number(formData.get("imageCount"));
  const imageCount = Number.isFinite(imageCountValue) && imageCountValue >= 0
    ? imageCountValue
    : null;

  const fileSizeBytesValue = Number(formData.get("fileSizeBytes"));
  const fileSizeBytes = Number.isFinite(fileSizeBytesValue) && fileSizeBytesValue >= 0
    ? fileSizeBytesValue
    : null;

  const reviewBundleReady = formData.get("reviewBundleReady") === "on";
  const truthfulPassValue = formData.get("truthfulPass");
  const truthfulPass = truthfulPassValue === "pass"
    ? true
    : truthfulPassValue === "fail"
      ? false
      : null;

  const notesValue = formData.get("sessionNotes");
  const notes = typeof notesValue === "string" && notesValue.trim().length > 0
    ? notesValue.trim()
    : null;

  try {
    const linkedDatasetIdValue = formData.get("linkedDatasetId");
    const linkedDatasetId = typeof linkedDatasetIdValue === "string" && linkedDatasetIdValue.trim().length > 0
      ? linkedDatasetIdValue.trim()
      : null;

    await insertIngestSession({
      org_id: refreshedAccess.org.id,
      mission_id: refreshedDetail.mission.id,
      dataset_id: linkedDatasetId,
      session_label: sessionLabel,
      source_type: sourceType,
      status: sessionStatus,
      source_filename: sourceFilename,
      source_zip_path: sourceZipPath,
      extracted_dataset_path: extractedDatasetPath,
      benchmark_summary_path: benchmarkSummaryPath,
      run_log_path: runLogPath,
      review_bundle_zip_path: reviewBundleZipPath,
      image_count: imageCount,
      file_size_bytes: fileSizeBytes,
      review_bundle_ready: reviewBundleReady,
      truthful_pass: truthfulPass,
      metadata: {
        sourceType,
        sourceFilename,
        imageCount,
        reviewBundleReady,
        truthfulPass,
      },
      notes,
      created_by: refreshedAccess.user.id,
    });
  } catch {
    redirect(`/missions/${missionId}?ingest=error`);
  }

  redirect(`/missions/${missionId}?ingest=1`);
}

export async function prepareBrowserZipUpload(missionId: string, formData: FormData) {
  const refreshedAccess = await getDroneOpsAccess();
  if (!refreshedAccess.user) {
    return { ok: false as const, error: "Please sign in again before uploading a mission ZIP." };
  }

  if (!refreshedAccess.org?.id || !refreshedAccess.org.slug || !refreshedAccess.hasMembership || !refreshedAccess.hasActiveEntitlement) {
    return { ok: false as const, error: "The current organization context is missing or inactive." };
  }

  if (!canPerformDroneOpsAction(refreshedAccess, "ingest.write")) {
    return { ok: false as const, error: "Viewer access cannot upload mission ZIPs." };
  }

  const refreshedDetail = await getMissionDetail(refreshedAccess, missionId);
  if (!refreshedDetail) {
    return { ok: false as const, error: "This mission could not be refreshed before upload." };
  }

  const filenameValue = formData.get("browserZipFilename");
  const filename = typeof filenameValue === "string" ? filenameValue.trim() : "";
  if (!filename) {
    return { ok: false as const, error: "Choose a ZIP file before uploading browser intake evidence." };
  }

  if (!isZipFilename(filename)) {
    return { ok: false as const, error: "Choose a .zip file. Folder ingest and non-ZIP uploads still are not supported in this lane." };
  }

  const fileSizeBytesValue = Number(formData.get("browserZipFileSizeBytes"));
  const fileSizeBytes = Number.isFinite(fileSizeBytesValue) && fileSizeBytesValue > 0 ? fileSizeBytesValue : 0;
  if (!fileSizeBytes) {
    return { ok: false as const, error: "The ZIP size was not available from the browser upload request." };
  }

  const linkedDatasetIdValue = formData.get("browserLinkedDatasetId");
  const linkedDatasetId = typeof linkedDatasetIdValue === "string" && linkedDatasetIdValue.trim().length > 0
    ? linkedDatasetIdValue.trim()
    : null;

  const sessionLabelValue = formData.get("browserSessionLabel");
  const sessionLabel = typeof sessionLabelValue === "string" && sessionLabelValue.trim().length > 0
    ? sessionLabelValue.trim()
    : null;

  const notesValue = formData.get("browserSessionNotes");
  const notes = typeof notesValue === "string" && notesValue.trim().length > 0
    ? notesValue.trim()
    : null;

  try {
    const path = buildBrowserZipStoragePath({
      orgSlug: refreshedAccess.org.slug,
      missionId: refreshedDetail.mission.id,
      filename,
    });
    const ticket = await createDroneOpsSignedUploadTicket(path);

    return {
      ok: true as const,
      bucket: ticket.bucket,
      path: ticket.path,
      token: ticket.token,
      filename,
      fileSizeBytes,
      linkedDatasetId,
      sessionLabel,
      notes,
    };
  } catch (error) {
    const message = error instanceof Error && error.message.trim().length > 0
      ? error.message
      : "A signed upload URL could not be created for this mission ZIP.";
    return { ok: false as const, error: message };
  }
}

export async function finalizeBrowserZipUpload(missionId: string, formData: FormData) {
  const refreshedAccess = await getDroneOpsAccess();
  if (!refreshedAccess.user) {
    return { ok: false as const, error: "Please sign in again before finalizing the ingest session." };
  }

  if (!refreshedAccess.org?.id || !refreshedAccess.hasMembership || !refreshedAccess.hasActiveEntitlement) {
    return { ok: false as const, error: "The current organization context is missing or inactive." };
  }

  if (!canPerformDroneOpsAction(refreshedAccess, "ingest.write")) {
    return { ok: false as const, error: "Viewer access cannot finalize browser ZIP ingest sessions." };
  }

  const refreshedDetail = await getMissionDetail(refreshedAccess, missionId);
  if (!refreshedDetail) {
    return { ok: false as const, error: "This mission could not be refreshed after the upload completed." };
  }

  const filenameValue = formData.get("browserZipFilename");
  const filename = typeof filenameValue === "string" ? filenameValue.trim() : "";
  if (!filename || !isZipFilename(filename)) {
    return { ok: false as const, error: "The uploaded file reference is missing or not a ZIP." };
  }

  const fileSizeBytesValue = Number(formData.get("browserZipFileSizeBytes"));
  const fileSizeBytes = Number.isFinite(fileSizeBytesValue) && fileSizeBytesValue > 0 ? fileSizeBytesValue : null;

  const storageBucketValue = formData.get("browserStorageBucket");
  const storageBucket = typeof storageBucketValue === "string" && storageBucketValue.trim().length > 0
    ? storageBucketValue.trim()
    : null;

  const storagePathValue = formData.get("browserStoragePath");
  const storagePath = typeof storagePathValue === "string" && storagePathValue.trim().length > 0
    ? storagePathValue.trim()
    : null;

  if (!storageBucket || !storagePath) {
    return { ok: false as const, error: "The uploaded ZIP storage location was not available for ingest finalization." };
  }

  const draft = buildBrowserZipIntakeDraft({
    missionName: refreshedDetail.mission.name,
    filename,
    uploadPersisted: true,
    storagePath,
  });

  const linkedDatasetIdValue = formData.get("browserLinkedDatasetId");
  const linkedDatasetId = typeof linkedDatasetIdValue === "string" && linkedDatasetIdValue.trim().length > 0
    ? linkedDatasetIdValue.trim()
    : null;

  const sessionLabelValue = formData.get("browserSessionLabel");
  const sessionLabel = typeof sessionLabelValue === "string" && sessionLabelValue.trim().length > 0
    ? sessionLabelValue.trim()
    : draft.sessionLabel;

  const notesValue = formData.get("browserSessionNotes");
  const operatorNotes = typeof notesValue === "string" && notesValue.trim().length > 0
    ? notesValue.trim()
    : null;
  const notes = operatorNotes
    ? `${draft.notes}\n\nOperator note: ${operatorNotes}`
    : draft.notes;

  try {
    await insertIngestSession({
      org_id: refreshedAccess.org.id,
      mission_id: refreshedDetail.mission.id,
      dataset_id: linkedDatasetId,
      session_label: sessionLabel,
      source_type: draft.sourceType,
      status: draft.status,
      source_filename: filename,
      source_zip_path: `${storageBucket}/${storagePath}`,
      file_size_bytes: fileSizeBytes,
      review_bundle_ready: draft.reviewBundleReady,
      truthful_pass: draft.truthfulPass,
      metadata: {
        ...draft.metadata,
        sourceFilename: filename,
        fileSizeBytes,
        storageBucket,
        storagePath,
        linkedDatasetId,
      },
      notes,
      created_by: refreshedAccess.user.id,
    });
  } catch (error) {
    const message = error instanceof Error && error.message.trim().length > 0
      ? error.message
      : "The ingest session could not be finalized after the ZIP upload.";
    return { ok: false as const, error: message };
  }

  return { ok: true as const, redirectTo: `/missions/${missionId}?ingest=browser-uploaded` };
}

export async function extractIngestSession(missionId: string, formData: FormData) {
  const refreshedAccess = await getDroneOpsAccess();
  if (!refreshedAccess.user) {
    redirect("/sign-in");
  }

  if (
    !refreshedAccess.org?.id ||
    !refreshedAccess.org.slug ||
    !refreshedAccess.hasMembership ||
    !refreshedAccess.hasActiveEntitlement
  ) {
    redirect(`/missions/${missionId}?extract=denied`);
  }

  if (!canPerformDroneOpsAction(refreshedAccess, "ingest.write")) {
    redirect(`/missions/${missionId}?extract=denied`);
  }

  const sessionIdValue = formData.get("sessionId");
  const sessionId = typeof sessionIdValue === "string" ? sessionIdValue.trim() : "";
  if (!sessionId) {
    redirect(`/missions/${missionId}?extract=missing-session`);
  }

  const refreshedDetail = await getMissionDetail(refreshedAccess, missionId);
  if (!refreshedDetail) {
    redirect(`/missions/${missionId}?extract=missing-mission`);
  }

  const session = refreshedDetail.ingestSessions.find((item) => item.id === sessionId);
  if (!session) {
    redirect(`/missions/${missionId}?extract=missing-session`);
  }

  if (!session.source_zip_path) {
    redirect(`/missions/${missionId}?extract=missing-zip`);
  }

  if (session.extracted_dataset_path) {
    redirect(`/missions/${missionId}?extract=already-extracted`);
  }

  const [rawBucket, ...rawParts] = session.source_zip_path.split("/");
  const sourceBucket = rawBucket?.trim() || "";
  const sourcePath = rawParts.join("/").trim();
  if (!sourceBucket || !sourcePath) {
    redirect(`/missions/${missionId}?extract=malformed-zip-path`);
  }

  let outcome: "recorded" | "no-images" | "failed" = "failed";

  try {
    const blob = await downloadStorageBytes({ bucket: sourceBucket, path: sourcePath });
    const destPath = `${refreshedAccess.org.slug}/missions/${missionId}/extracted/${sessionId}`;

    // Stream the archive: each image is uploaded as soon as it inflates, so
    // memory holds one image at a time instead of the ZIP plus every image.
    const { imageCount } = await streamZipImages(blob.stream(), async (image) => {
      await uploadStorageBytes({
        path: `${destPath}/${image.name}`,
        bytes: image.bytes,
        upsert: true,
      });
    });

    if (imageCount === 0) {
      outcome = "no-images";
    } else {
      await updateIngestSession(sessionId, refreshedAccess.org.id, {
        extracted_dataset_path: destPath,
        image_count: imageCount,
        status: "extracted",
      });

      console.info("ingest.session.extracted", {
        sessionId,
        missionId,
        imageCount,
        extractedDatasetPath: destPath,
      });

      outcome = "recorded";
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown error";
    console.error("extractIngestSession failed", { sessionId, missionId, error: detail });
    outcome = "failed";
  }

  redirect(`/missions/${missionId}?extract=${outcome}`);
}

export async function queueMissionProcessing(missionId: string) {
  const refreshedAccess = await getDroneOpsAccess();
  if (!refreshedAccess.user) {
    redirect("/sign-in");
  }

  if (!refreshedAccess.org?.id || !refreshedAccess.hasMembership || !refreshedAccess.hasActiveEntitlement) {
    redirect("/dashboard");
  }

  if (!canPerformDroneOpsAction(refreshedAccess, "jobs.create")) {
    redirect(`/missions/${missionId}?queued=denied`);
  }

  const refreshedDetail = await getMissionDetail(refreshedAccess, missionId);
  if (!refreshedDetail || refreshedDetail.datasets.length === 0) {
    redirect(`/missions/${missionId}?queued=missing-dataset`);
  }

  const dataset = refreshedDetail.datasets[0];
  const jobName = `${refreshedDetail.mission.name} managed processing request`;

  try {
    const insertedJob = await insertProcessingJob({
      org_id: refreshedAccess.org.id,
      project_id: refreshedDetail.mission.project_id,
      site_id: refreshedDetail.mission.site_id,
      mission_id: refreshedDetail.mission.id,
      dataset_id: dataset.id,
      engine: "odm",
      preset_id: "managed-processing-v1",
      status: "queued",
      stage: "queued",
      progress: 0,
      queue_position: 1,
      input_summary: {
        name: jobName,
        requestedByUserId: refreshedAccess.user.id,
        requestedByEmail: refreshedAccess.user.email,
        source: "mission-detail-managed-request",
      },
      output_summary: buildManagedProcessingRequestSummary({
        missionName: refreshedDetail.mission.name,
        datasetName: dataset.name,
        requestedByEmail: refreshedAccess.user.email,
      }),
      external_job_reference: null,
      created_by: refreshedAccess.user.id,
    });

    if (!insertedJob?.id) {
      redirect(`/missions/${missionId}?queued=error`);
    }

    await insertJobEvent({
      org_id: refreshedAccess.org.id,
      job_id: insertedJob.id,
      event_type: "job.queued",
      payload: {
        title: "Managed processing request queued",
        detail: `A managed processing request was created from mission detail for dataset ${dataset.name}. No host dispatch or artifacts are recorded yet.`,
      },
    });
  } catch {
    redirect(`/missions/${missionId}?queued=error`);
  }

  redirect(`/missions/${missionId}?queued=1`);
}

export async function seedProvingRun(missionId: string) {
  const refreshedAccess = await getDroneOpsAccess();
  if (!refreshedAccess.user) {
    redirect("/sign-in");
  }

  if (!refreshedAccess.org?.id || !refreshedAccess.hasMembership || !refreshedAccess.hasActiveEntitlement) {
    redirect("/dashboard");
  }

  if (!canPerformDroneOpsAction(refreshedAccess, "jobs.create")) {
    redirect(`/missions/${missionId}?seeded=denied`);
  }

  if (!isProvingLaneEnabled()) {
    redirect(`/missions/${missionId}?seeded=disabled`);
  }

  const refreshedDetail = await getMissionDetail(refreshedAccess, missionId);
  if (!refreshedDetail) {
    redirect("/missions");
  }

  if (refreshedDetail.datasets.length > 0 || refreshedDetail.jobs.length > 0) {
    redirect(`/missions/${missionId}?seeded=already`);
  }

  const seedDatasetName = `${refreshedDetail.mission.name} proving dataset`;
  const seedSlug = `${normalizeSlug(seedDatasetName) || "proving-dataset"}-1`;

  try {
    const dataset = await insertDataset({
      org_id: refreshedAccess.org.id,
      project_id: refreshedDetail.mission.project_id,
      site_id: refreshedDetail.mission.site_id,
      mission_id: refreshedDetail.mission.id,
      name: seedDatasetName,
      slug: seedSlug,
      kind: "image",
      status: "ready",
      captured_at: new Date().toISOString(),
      metadata: {
        imageCount: 420,
        footprint: "Bootstrap proving footprint",
        finding: "Seeded from mission detail to stand up the live proving loop.",
        preflight: {
          status: "ready",
          findings: [
            "Seeded proving dataset meets baseline overlap and count checks.",
          ],
          overlapFront: 80,
          overlapSide: 70,
          gcpCaptured: false,
          reviewed: false,
        },
      },
      created_by: refreshedAccess.user.id,
    });

    if (!dataset?.id) {
      redirect(`/missions/${missionId}?seeded=error`);
    }

    const jobName = `${refreshedDetail.mission.name} proving run`;
    const insertedJob = await insertProcessingJob({
      org_id: refreshedAccess.org.id,
      project_id: refreshedDetail.mission.project_id,
      site_id: refreshedDetail.mission.site_id,
      mission_id: refreshedDetail.mission.id,
      dataset_id: dataset.id,
      engine: "odm",
      preset_id: "v1-proving-run",
      status: "queued",
      stage: "queued",
      progress: 0,
      queue_position: 1,
      input_summary: {
        name: jobName,
        requestedByUserId: refreshedAccess.user.id,
        requestedByEmail: refreshedAccess.user.email,
        source: "mission-proving-seed",
      },
      output_summary: {
        eta: "Pending queue pickup",
        notes: "Live proving run seeded from mission detail.",
        logTail: [
          "Queue accepted proving run.",
          "Awaiting worker pickup.",
        ],
      },
      external_job_reference: null,
      created_by: refreshedAccess.user.id,
    });

    if (!insertedJob?.id) {
      redirect(`/missions/${missionId}?seeded=error`);
    }

    await insertProcessingOutputs([
      {
        org_id: refreshedAccess.org.id,
        job_id: insertedJob.id,
        mission_id: refreshedDetail.mission.id,
        dataset_id: dataset.id,
        kind: "orthomosaic",
        status: "pending",
        storage_bucket: "drone-ops",
        storage_path: `${refreshedAccess.org.slug}/jobs/${insertedJob.id}/orthomosaic.tif`,
        metadata: {
          name: `${refreshedDetail.mission.name} orthomosaic`,
          format: "COG",
          delivery: "Review pending",
        },
      },
      {
        org_id: refreshedAccess.org.id,
        job_id: insertedJob.id,
        mission_id: refreshedDetail.mission.id,
        dataset_id: dataset.id,
        kind: "dsm",
        status: "pending",
        storage_bucket: "drone-ops",
        storage_path: `${refreshedAccess.org.slug}/jobs/${insertedJob.id}/dsm.tif`,
        metadata: {
          name: `${refreshedDetail.mission.name} surface model`,
          format: "COG",
          delivery: "Review pending",
        },
      },
      {
        org_id: refreshedAccess.org.id,
        job_id: insertedJob.id,
        mission_id: refreshedDetail.mission.id,
        dataset_id: dataset.id,
        kind: "point_cloud",
        status: "pending",
        storage_bucket: "drone-ops",
        storage_path: `${refreshedAccess.org.slug}/jobs/${insertedJob.id}/cloud.laz`,
        metadata: {
          name: `${refreshedDetail.mission.name} point cloud`,
          format: "LAZ",
          delivery: "Hold for QA",
        },
      },
      {
        org_id: refreshedAccess.org.id,
        job_id: insertedJob.id,
        mission_id: refreshedDetail.mission.id,
        dataset_id: dataset.id,
        kind: "report",
        status: "pending",
        storage_bucket: "drone-ops",
        storage_path: `${refreshedAccess.org.slug}/jobs/${insertedJob.id}/mission-brief.pdf`,
        metadata: {
          name: `${refreshedDetail.mission.name} mission brief`,
          format: "PDF",
          delivery: "Share/export pending",
        },
      },
    ]);

    await insertJobEvent({
      org_id: refreshedAccess.org.id,
      job_id: insertedJob.id,
      event_type: "upload.completed",
      payload: {
        title: "Proving dataset attached",
        detail: `Seeded dataset ${seedDatasetName} attached to the live mission path.`,
      },
    });

    await insertJobEvent({
      org_id: refreshedAccess.org.id,
      job_id: insertedJob.id,
      event_type: "job.queued",
      payload: {
        title: "Proving run queued",
        detail: "A real queued job was seeded to exercise the live aerial-ops path.",
      },
    });

    await insertJobEvent({
      org_id: refreshedAccess.org.id,
      job_id: insertedJob.id,
      event_type: "artifact.generated",
      payload: {
        title: "Proving outputs staged",
        detail: "Orthomosaic, DSM, point cloud, and report placeholders were created for the live proving run.",
      },
    });
  } catch {
    redirect(`/missions/${missionId}?seeded=error`);
  }

  redirect(`/missions/${missionId}?seeded=1`);
}

export async function advanceProvingJob(missionId: string) {
  const refreshedAccess = await getDroneOpsAccess();
  if (!refreshedAccess.user) {
    redirect("/sign-in");
  }

  if (!refreshedAccess.org?.id || !refreshedAccess.hasMembership || !refreshedAccess.hasActiveEntitlement) {
    redirect("/dashboard");
  }

  if (!canPerformDroneOpsAction(refreshedAccess, "jobs.launch")) {
    redirect(`/missions/${missionId}?proving=denied`);
  }

  const refreshedMission = await getMissionDetail(refreshedAccess, missionId);
  if (!refreshedMission) {
    redirect("/missions");
  }

  const refreshedProvingJob = refreshedMission.jobs.find((job) => isProvingJobRecord(job)) ?? null;
  if (!refreshedProvingJob) {
    redirect(`/missions/${missionId}?proving=not-found`);
  }

  const refreshedJobDetail = await getJobDetail(refreshedAccess, refreshedProvingJob.id);
  if (!refreshedJobDetail) {
    redirect(`/missions/${missionId}?proving=not-found`);
  }

  try {
    const result = await advanceManualProvingJob({
      orgId: refreshedAccess.org.id,
      detail: refreshedJobDetail,
      source: "mission-detail",
    });

    redirect(`/missions/${missionId}?proving=${result}`);
  } catch {
    redirect(`/missions/${missionId}?proving=error`);
  }
}

export async function generateInstallBundle(missionId: string) {
  const refreshedAccess = await getDroneOpsAccess();
  if (!refreshedAccess.user) {
    redirect("/sign-in");
  }

  if (!refreshedAccess.org?.id || !refreshedAccess.hasMembership || !refreshedAccess.hasActiveEntitlement) {
    redirect("/dashboard");
  }

  if (!canPerformDroneOpsAction(refreshedAccess, "artifacts.export")) {
    redirect(`/missions/${missionId}?bundled=denied`);
  }

  const refreshedDetail = await getMissionDetail(refreshedAccess, missionId);
  const latestVersion = refreshedDetail?.versions[0] ?? null;

  if (!refreshedDetail || !latestVersion) {
    redirect(`/missions/${missionId}?bundled=missing-version`);
  }

  const dataset = refreshedDetail.datasets[0] ?? null;
  const existingExportSummary = (latestVersion.export_summary as Record<string, unknown> | null) ?? {};
  const existingAvailable = Array.isArray(existingExportSummary.available)
    ? existingExportSummary.available.filter((value): value is string => typeof value === "string")
    : [];
  const mergedAvailable = Array.from(new Set([...existingAvailable, "kmz", "pdf", "install_bundle"]));

  try {
    const insertedJob = await insertProcessingJob({
      org_id: refreshedAccess.org.id,
      project_id: refreshedDetail.mission.project_id,
      site_id: refreshedDetail.mission.site_id,
      mission_id: refreshedDetail.mission.id,
      dataset_id: dataset?.id ?? null,
      engine: "planner",
      preset_id: "install-bundle-v1",
      status: "succeeded",
      stage: "install_bundle",
      progress: 100,
      queue_position: null,
      input_summary: {
        name: `${refreshedDetail.mission.name} install bundle`,
        source: "mission-install-action",
        versionNumber: latestVersion.version_number,
      },
      output_summary: {
        eta: "Complete",
        notes: "Install bundle generated from mission detail.",
      },
      external_job_reference: null,
      created_by: refreshedAccess.user.id,
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    });

    if (!insertedJob?.id) {
      redirect(`/missions/${missionId}?bundled=error`);
    }

    await insertProcessingOutputs([
      {
        org_id: refreshedAccess.org.id,
        job_id: insertedJob.id,
        mission_id: refreshedDetail.mission.id,
        dataset_id: dataset?.id ?? null,
        kind: "install_bundle",
        status: "ready",
        storage_bucket: "drone-ops",
        storage_path: `${refreshedAccess.org.slug}/missions/${refreshedDetail.mission.id}/install/${insertedJob.id}/install-bundle.zip`,
        metadata: {
          name: `${refreshedDetail.mission.name} install bundle`,
          format: "KMZ + PDF brief",
          delivery: "Field install handoff",
        },
      },
      {
        org_id: refreshedAccess.org.id,
        job_id: insertedJob.id,
        mission_id: refreshedDetail.mission.id,
        dataset_id: dataset?.id ?? null,
        kind: "report",
        status: "ready",
        storage_bucket: "drone-ops",
        storage_path: `${refreshedAccess.org.slug}/missions/${refreshedDetail.mission.id}/install/${insertedJob.id}/mission-brief.pdf`,
        metadata: {
          name: `${refreshedDetail.mission.name} field brief`,
          format: "PDF",
          delivery: "Field install handoff",
        },
      },
    ]);

    await insertJobEvent({
      org_id: refreshedAccess.org.id,
      job_id: insertedJob.id,
      event_type: "install.bundle.ready",
      payload: {
        title: "Install bundle generated",
        detail: `Install helper bundle for mission version v${latestVersion.version_number} is ready for field handoff.`,
      },
    });

    await insertJobEvent({
      org_id: refreshedAccess.org.id,
      job_id: insertedJob.id,
      event_type: "artifact.generated",
      payload: {
        title: "Install outputs ready",
        detail: "Install bundle ZIP and mission brief PDF were generated for browser-first field handoff.",
      },
    });

    await updateMissionVersion(latestVersion.id, refreshedDetail.mission.org_id, {
      export_summary: {
        ...existingExportSummary,
        available: mergedAvailable,
        installBundleReady: true,
        installGeneratedAt: new Date().toISOString(),
        installHelper: "browser-first handoff with companion fallback",
      },
    });
  } catch {
    redirect(`/missions/${missionId}?bundled=error`);
  }

  redirect(`/missions/${missionId}?bundled=1`);
}

export async function attachMissionGeometry(missionId: string, formData: FormData) {
  const refreshedAccess = await getDroneOpsAccess();
  if (!refreshedAccess.user) {
    redirect("/sign-in");
  }

  if (!refreshedAccess.org?.id || !refreshedAccess.hasMembership || !refreshedAccess.hasActiveEntitlement) {
    redirect("/dashboard");
  }

  if (!canPerformDroneOpsAction(refreshedAccess, "missions.write")) {
    redirect(`/missions/${missionId}?aoi=denied`);
  }

  const refreshedDetail = await getMissionDetail(refreshedAccess, missionId);
  if (!refreshedDetail) {
    redirect("/missions");
  }

  const geometryValue = formData.get("aoiGeometryJson");
  const geometryText = typeof geometryValue === "string" ? geometryValue.trim() : "";

  try {
    const geometry = parseGeoJsonSurface(geometryText);
    await updateMission(refreshedDetail.mission.id, refreshedDetail.mission.org_id, {
      planning_geometry: geometry,
    });
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof Error) {
      redirect(`/missions/${missionId}?aoi=invalid`);
    }
    redirect(`/missions/${missionId}?aoi=error`);
  }

  redirect(`/missions/${missionId}?aoi=1`);
}

export async function saveOverlayReview(missionId: string, formData: FormData) {
  const refreshedAccess = await getDroneOpsAccess();
  if (!refreshedAccess.user) {
    redirect("/sign-in");
  }

  if (!refreshedAccess.org?.id || !refreshedAccess.hasMembership || !refreshedAccess.hasActiveEntitlement) {
    redirect("/dashboard");
  }

  if (!canPerformDroneOpsAction(refreshedAccess, "missions.write")) {
    redirect(`/missions/${missionId}?overlay=denied`);
  }

  const refreshedDetail = await getMissionDetail(refreshedAccess, missionId);
  if (!refreshedDetail) {
    redirect("/missions");
  }

  const checkedIds = formData
    .getAll("overlayIds")
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0);

  try {
    await updateMission(refreshedDetail.mission.id, refreshedDetail.mission.org_id, {
      summary: {
        ...refreshedDetail.summary,
        overlayReview: {
          checkedIds,
          savedAt: new Date().toISOString(),
          savedByUserId: refreshedAccess.user.id,
          savedByEmail: refreshedAccess.user.email,
        },
      },
    });
  } catch {
    redirect(`/missions/${missionId}?overlay=error`);
  }

  redirect(`/missions/${missionId}?overlay=1`);
}

export async function approveMissionVersion(missionId: string) {
  const refreshedAccess = await getDroneOpsAccess();
  if (!refreshedAccess.user) {
    redirect("/sign-in");
  }

  if (!refreshedAccess.org?.id || !refreshedAccess.hasMembership || !refreshedAccess.hasActiveEntitlement) {
    redirect("/dashboard");
  }

  if (!canPerformDroneOpsAction(refreshedAccess, "versions.promote")) {
    redirect(`/missions/${missionId}?approved=denied`);
  }

  const refreshedDetail = await getMissionDetail(refreshedAccess, missionId);
  const latestVersion = refreshedDetail?.versions[0] ?? null;

  if (!refreshedDetail || !latestVersion) {
    redirect(`/missions/${missionId}?approved=missing-version`);
  }

  const existingValidationSummary = (latestVersion.validation_summary as Record<string, unknown> | null) ?? {};

  try {
    await updateMissionVersion(latestVersion.id, refreshedDetail.mission.org_id, {
      status: "approved",
      validation_summary: {
        ...existingValidationSummary,
        status: "approved",
        approvedAt: new Date().toISOString(),
        approvedByUserId: refreshedAccess.user.id,
        approvedByEmail: refreshedAccess.user.email,
      },
    });

    await updateMission(refreshedDetail.mission.id, refreshedDetail.mission.org_id, {
      status: "validated",
      summary: {
        ...refreshedDetail.summary,
        versionApproval: {
          approvedAt: new Date().toISOString(),
          approvedByUserId: refreshedAccess.user.id,
        },
      },
    });
  } catch {
    redirect(`/missions/${missionId}?approved=error`);
  }

  redirect(`/missions/${missionId}?approved=1`);
}

export async function confirmInstall(missionId: string) {
  const refreshedAccess = await getDroneOpsAccess();
  if (!refreshedAccess.user) {
    redirect("/sign-in");
  }

  if (!refreshedAccess.org?.id || !refreshedAccess.hasMembership || !refreshedAccess.hasActiveEntitlement) {
    redirect("/dashboard");
  }

  if (!canPerformDroneOpsAction(refreshedAccess, "versions.write")) {
    redirect(`/missions/${missionId}?installed=denied`);
  }

  const refreshedDetail = await getMissionDetail(refreshedAccess, missionId);
  const latestVersion = refreshedDetail?.versions[0] ?? null;

  if (!refreshedDetail || !latestVersion) {
    redirect(`/missions/${missionId}?installed=missing-version`);
  }

  const existingExportSummary = (latestVersion.export_summary as Record<string, unknown> | null) ?? {};

  try {
    await updateMissionVersion(latestVersion.id, refreshedDetail.mission.org_id, {
      status: "installed",
      export_summary: {
        ...existingExportSummary,
        installConfirmedAt: new Date().toISOString(),
        installConfirmedByUserId: refreshedAccess.user.id,
      },
    });
  } catch {
    redirect(`/missions/${missionId}?installed=error`);
  }

  redirect(`/missions/${missionId}?installed=1`);
}

export async function markMissionDelivered(missionId: string) {
  const refreshedAccess = await getDroneOpsAccess();
  if (!refreshedAccess.user) {
    redirect("/sign-in");
  }

  if (!refreshedAccess.org?.id || !refreshedAccess.hasMembership || !refreshedAccess.hasActiveEntitlement) {
    redirect("/dashboard");
  }

  if (!canPerformDroneOpsAction(refreshedAccess, "missions.write")) {
    redirect(`/missions/${missionId}?delivered=denied`);
  }

  const refreshedDetail = await getMissionDetail(refreshedAccess, missionId);
  if (!refreshedDetail) {
    redirect(`/missions/${missionId}?delivered=error`);
  }

  try {
    await updateMission(refreshedDetail.mission.id, refreshedDetail.mission.org_id, {
      status: "delivered",
      summary: {
        ...refreshedDetail.summary,
        delivery: {
          deliveredAt: new Date().toISOString(),
          deliveredByUserId: refreshedAccess.user.id,
          deliveredByEmail: refreshedAccess.user.email,
        },
      },
    });
  } catch {
    redirect(`/missions/${missionId}?delivered=error`);
  }

  redirect(`/missions/${missionId}?delivered=1`);
}
