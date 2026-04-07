import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { BlockedAccessView } from "@/app/dashboard/blocked-access-view";
import { SignOutForm } from "@/app/dashboard/sign-out-form";
import { SupportContextCopyButton } from "@/app/dashboard/support-context-copy-button";
import { BrowserZipIntakeForm } from "@/components/browser-zip-intake-form";
import { GeometryJsonField } from "@/components/geometry-json-field";
import { GeometryPreviewCard } from "@/components/geometry-preview-card";
import { MissionStatusDashboard } from "@/components/mission-status-dashboard";
import { getDroneOpsAccess } from "@/lib/auth/drone-ops-access";
import {
  formatArtifactHandoffAuditLine,
  getArtifactHandoff,
  summarizeArtifactHandoffs,
  type ArtifactMetadataRecord,
} from "@/lib/artifact-handoff";
import {
  buildBrowserZipIntakeDraft,
  buildBrowserZipStoragePath,
  isZipFilename,
} from "@/lib/browser-zip-intake";
import {
  buildCoverageRosterSummary,
  getCoverageRoster,
} from "@/lib/coverage-roster";
import { formatGeoJsonSurface, parseGeoJsonSurface } from "@/lib/geojson";
import {
  buildMissionGisBrief,
} from "@/lib/gis-briefs";
import {
  buildMissionReadinessChecklist,
  getMissionReadinessSummary,
} from "@/lib/mission-readiness";
import {
  buildMissionOverlayChecklist,
  getMissionOverlayPlan,
} from "@/lib/overlay-recommendations";
import {
  getCoverageComparisonInsight,
  getMissionGeometryInsight,
  getTerrainInsight,
} from "@/lib/geometry-insights";
import {
  getMissionSpatialInsight,
} from "@/lib/gis-insights";
import {
  getJobDetail,
  getMissionDetail,
  getNumber,
  getString,
  getStringArray,
} from "@/lib/missions/detail-data";
import {
  buildManagedProcessingRequestSummary,
} from "@/lib/managed-processing";
import {
  advanceManualProvingJob,
  isProvingJobRecord,
} from "@/lib/proving-runs";
import { normalizeSlug } from "@/lib/slug";
import { tryCreateSignedDownloadUrl } from "@/lib/storage-delivery";
import { formatJobStatus, formatOutputArtifactStatus } from "@/lib/missions/workspace";
import {
  formatFileSize,
  summarizeV1IngestSession,
} from "@/lib/v1-ingest";
import {
  insertDataset,
  insertIngestSession,
  insertJobEvent,
  insertProcessingJob,
  insertProcessingOutputs,
  updateMission,
  updateMissionVersion,
} from "@/lib/supabase/admin";
import { createDroneOpsSignedUploadTicket } from "@/lib/supabase/admin-storage";
import type { Json } from "@/lib/supabase/types";

function formatDateTime(value: string | null) {
  if (!value) return "TBD";
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) return "TBD";

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(timestamp);
}

function getJobPillClassName(status: string) {
  switch (status) {
    case "running":
      return "status-pill status-pill--info";
    case "completed":
      return "status-pill status-pill--success";
    default:
      return "status-pill status-pill--warning";
  }
}

function getOutputPillClassName(status: string) {
  switch (status) {
    case "ready":
      return "status-pill status-pill--success";
    case "processing":
      return "status-pill status-pill--info";
    default:
      return "status-pill status-pill--warning";
  }
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

function getIngestStatusPillClassName(contractCleared: boolean, reviewBundleReady: boolean) {
  if (contractCleared) {
    return "status-pill status-pill--success";
  }

  if (reviewBundleReady) {
    return "status-pill status-pill--info";
  }

  return "status-pill status-pill--warning";
}

function getStageChecklist(summary: unknown) {
  if (!summary || typeof summary !== "object" || Array.isArray(summary)) {
    return [] as Array<{ label: string; status: string }>;
  }

  const record = summary as Record<string, unknown>;
  if (!Array.isArray(record.stageChecklist)) {
    return [] as Array<{ label: string; status: string }>;
  }

  return record.stageChecklist.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return [];
    }

    return [{
      label: typeof item.label === "string" ? item.label : "Unnamed stage",
      status: typeof item.status === "string" ? item.status : "pending",
    }];
  });
}

function getCalloutClassName(state: string) {
  if (state === "1" || state === "created") {
    return "callout callout-success";
  }

  if (state === "missing-dataset" || state === "missing-name" || state === "missing-version" || state === "already") {
    return "callout callout-warning";
  }

  return "callout callout-error";
}

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

function getCalloutMessage(options: {
  queued?: string;
  attached?: string;
  ingest?: string;
  seeded?: string;
  proving?: string;
  bundled?: string;
  approved?: string;
  installed?: string;
  delivered?: string;
  aoi?: string;
  overlay?: string;
  created?: string;
}) {
  if (options.created === "1") {
    return "Mission draft created. Next: attach a dataset, then queue a processing job to produce reviewable artifacts.";
  }

  if (options.attached) {
    return options.attached === "1"
      ? "Dataset attached to this mission. You can now queue processing and seed output placeholders."
      : options.attached === "missing-name"
        ? "Dataset name is required before a dataset can be attached."
        : options.attached === "denied"
          ? "Viewer access cannot attach datasets."
          : "The dataset could not be attached. Check server configuration and try again.";
  }

  if (options.ingest) {
    return options.ingest === "1"
      ? "Truthful v1 intake session recorded. Use it to track ZIP evidence, benchmark paths, and review-bundle readiness without pretending browser upload already exists."
      : options.ingest === "browser-recorded"
        ? "Browser ZIP evidence recorded. The mission now has a new ingest session with the selected ZIP filename and size, but durable upload/storage, extraction, and ODM orchestration still have not run."
        : options.ingest === "browser-uploaded"
          ? "Browser ZIP uploaded into protected intake storage and recorded on this mission. Durable upload now exists; extraction, benchmarking, and ODM orchestration still remain pending until a worker picks up the batch."
      : options.ingest === "missing-label"
        ? "An intake label is required before the session can be recorded."
        : options.ingest === "browser-missing-file"
          ? "Choose a ZIP file before recording browser intake evidence for this mission."
          : options.ingest === "browser-invalid-file"
            ? "Choose a .zip file. This browser intake path records ZIP evidence only; it does not ingest folders or non-ZIP uploads yet."
        : options.ingest === "denied"
          ? "Viewer access cannot record intake sessions."
          : "The intake session could not be recorded. Check server configuration and try again.";
  }

  if (options.queued) {
    return options.queued === "1"
      ? "Managed processing request created. The mission now has a truthful operator-assisted job record, but no ODM dispatch or artifact generation is claimed until real run evidence is attached."
        : options.queued === "missing-dataset"
        ? "This mission does not have a dataset yet, so a managed processing request could not be created."
        : options.queued === "denied"
          ? "Viewer access cannot create managed processing requests."
          : "The managed processing request could not be created. Check server configuration and try again.";
  }

  if (options.seeded) {
    return options.seeded === "1"
      ? "Live proving run seeded. This mission now has a real dataset, queued job, events, and placeholder outputs in the protected data path."
      : options.seeded === "already"
        ? "This mission already has datasets or jobs, so no proving run seed was added."
        : options.seeded === "denied"
          ? "Viewer access cannot seed a proving run."
          : "The proving run seed failed. Check server configuration and try again.";
  }

  if (options.proving) {
    return options.proving === "started"
      ? "Proving job started from the mission page. The live run is now in active processing."
      : options.proving === "completed"
        ? "Proving job completed from the mission page. Ready artifacts are now waiting in the delivery lane."
        : options.proving === "not-found"
          ? "No active proving job was available to advance from this mission."
          : options.proving === "noop"
            ? "This proving job does not have a next-step automation available right now. Open the job detail if you need deeper triage."
            : options.proving === "denied"
              ? "Viewer access cannot advance proving jobs from the mission page."
              : "The proving job could not be advanced from the mission page. Check server configuration and try again.";
  }

  if (options.bundled) {
    return options.bundled === "1"
      ? "Install bundle generated. The mission now has a field-handoff artifact trail with bundle + brief outputs."
      : options.bundled === "missing-version"
        ? "This mission does not have a version yet, so an install bundle could not be generated."
        : options.bundled === "denied"
          ? "Viewer access cannot generate install bundles."
          : "The install bundle could not be generated. Check server configuration and try again.";
  }

  if (options.approved) {
    return options.approved === "1"
      ? "Latest mission version approved. This mission is now marked validated for handoff."
      : options.approved === "missing-version"
        ? "No mission version exists yet, so approval could not be recorded."
        : options.approved === "denied"
          ? "Viewer access cannot approve mission versions."
          : "Mission approval could not be recorded. Check server configuration and try again.";
  }

  if (options.installed) {
    return options.installed === "1"
      ? "Install confirmed. The latest mission version is now marked installed."
      : options.installed === "missing-version"
        ? "No mission version exists yet, so install confirmation could not be recorded."
        : options.installed === "denied"
          ? "Viewer access cannot confirm install state."
          : "Install confirmation could not be recorded. Check server configuration and try again.";
  }

  if (options.delivered) {
    return options.delivered === "1"
      ? "Mission marked delivered. Delivery metadata has been written into the mission summary."
      : options.delivered === "denied"
        ? "Viewer access cannot mark missions delivered."
        : "Mission delivery could not be recorded. Check server configuration and try again.";
  }

  if (options.aoi) {
    return options.aoi === "1"
      ? "Mission AOI geometry saved. Geometry, coverage, and overlay analysis now use the attached GeoJSON shape."
      : options.aoi === "denied"
        ? "Viewer access cannot update mission AOI geometry."
        : options.aoi === "invalid"
          ? "AOI geometry must be valid GeoJSON Polygon or MultiPolygon JSON."
          : "Mission AOI geometry could not be updated. Check server configuration and try again.";
  }

  if (options.overlay) {
    return options.overlay === "1"
      ? "Overlay review saved. The mission now tracks which GIS layers have already been checked."
      : options.overlay === "denied"
        ? "Viewer access cannot update overlay review state."
        : "Overlay review could not be updated. Check server configuration and try again.";
  }

  return null;
}

export default async function MissionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ missionId: string }>;
  searchParams: Promise<{ queued?: string; attached?: string; ingest?: string; seeded?: string; proving?: string; bundled?: string; approved?: string; installed?: string; delivered?: string; aoi?: string; overlay?: string; created?: string; dataset?: string }>;
}) {
  const access = await getDroneOpsAccess();

  if (!access.user) {
    redirect("/sign-in");
  }

  if (!access.hasMembership || !access.hasActiveEntitlement) {
    return <BlockedAccessView access={access} />;
  }

  const { missionId } = await params;
  const resolvedSearchParams = await searchParams;
  const detail = await getMissionDetail(access, missionId);

  if (!detail) {
    notFound();
  }

  async function attachDataset(formData: FormData) {
    "use server";

    const refreshedAccess = await getDroneOpsAccess();
    if (!refreshedAccess.user) {
      redirect("/sign-in");
    }

    if (!refreshedAccess.org?.id || !refreshedAccess.hasMembership || !refreshedAccess.hasActiveEntitlement) {
      redirect("/dashboard");
    }

    if (refreshedAccess.role === "viewer") {
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

  async function recordIngestSession(formData: FormData) {
    "use server";

    const refreshedAccess = await getDroneOpsAccess();
    if (!refreshedAccess.user) {
      redirect("/sign-in");
    }

    if (!refreshedAccess.org?.id || !refreshedAccess.hasMembership || !refreshedAccess.hasActiveEntitlement) {
      redirect("/dashboard");
    }

    if (refreshedAccess.role === "viewer") {
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

  async function prepareBrowserZipUpload(formData: FormData) {
    "use server";

    const refreshedAccess = await getDroneOpsAccess();
    if (!refreshedAccess.user) {
      return { ok: false as const, error: "Please sign in again before uploading a mission ZIP." };
    }

    if (!refreshedAccess.org?.id || !refreshedAccess.org.slug || !refreshedAccess.hasMembership || !refreshedAccess.hasActiveEntitlement) {
      return { ok: false as const, error: "The current organization context is missing or inactive." };
    }

    if (refreshedAccess.role === "viewer") {
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

  async function finalizeBrowserZipUpload(formData: FormData) {
    "use server";

    const refreshedAccess = await getDroneOpsAccess();
    if (!refreshedAccess.user) {
      return { ok: false as const, error: "Please sign in again before finalizing the ingest session." };
    }

    if (!refreshedAccess.org?.id || !refreshedAccess.hasMembership || !refreshedAccess.hasActiveEntitlement) {
      return { ok: false as const, error: "The current organization context is missing or inactive." };
    }

    if (refreshedAccess.role === "viewer") {
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

  async function queueMissionProcessing() {
    "use server";

    const refreshedAccess = await getDroneOpsAccess();
    if (!refreshedAccess.user) {
      redirect("/sign-in");
    }

    if (!refreshedAccess.org?.id || !refreshedAccess.hasMembership || !refreshedAccess.hasActiveEntitlement) {
      redirect("/dashboard");
    }

    if (refreshedAccess.role === "viewer") {
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

  async function seedProvingRun() {
    "use server";

    const refreshedAccess = await getDroneOpsAccess();
    if (!refreshedAccess.user) {
      redirect("/sign-in");
    }

    if (!refreshedAccess.org?.id || !refreshedAccess.hasMembership || !refreshedAccess.hasActiveEntitlement) {
      redirect("/dashboard");
    }

    if (refreshedAccess.role === "viewer") {
      redirect(`/missions/${missionId}?seeded=denied`);
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

  async function advanceProvingJob() {
    "use server";

    const refreshedAccess = await getDroneOpsAccess();
    if (!refreshedAccess.user) {
      redirect("/sign-in");
    }

    if (!refreshedAccess.org?.id || !refreshedAccess.hasMembership || !refreshedAccess.hasActiveEntitlement) {
      redirect("/dashboard");
    }

    if (refreshedAccess.role === "viewer") {
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

  async function generateInstallBundle() {
    "use server";

    const refreshedAccess = await getDroneOpsAccess();
    if (!refreshedAccess.user) {
      redirect("/sign-in");
    }

    if (!refreshedAccess.org?.id || !refreshedAccess.hasMembership || !refreshedAccess.hasActiveEntitlement) {
      redirect("/dashboard");
    }

    if (refreshedAccess.role === "viewer") {
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

      await updateMissionVersion(latestVersion.id, {
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

  async function attachMissionGeometry(formData: FormData) {
    "use server";

    const refreshedAccess = await getDroneOpsAccess();
    if (!refreshedAccess.user) {
      redirect("/sign-in");
    }

    if (!refreshedAccess.org?.id || !refreshedAccess.hasMembership || !refreshedAccess.hasActiveEntitlement) {
      redirect("/dashboard");
    }

    if (refreshedAccess.role === "viewer") {
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
      await updateMission(refreshedDetail.mission.id, {
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

  async function saveOverlayReview(formData: FormData) {
    "use server";

    const refreshedAccess = await getDroneOpsAccess();
    if (!refreshedAccess.user) {
      redirect("/sign-in");
    }

    if (!refreshedAccess.org?.id || !refreshedAccess.hasMembership || !refreshedAccess.hasActiveEntitlement) {
      redirect("/dashboard");
    }

    if (refreshedAccess.role === "viewer") {
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
      await updateMission(refreshedDetail.mission.id, {
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

  async function approveMissionVersion() {
    "use server";

    const refreshedAccess = await getDroneOpsAccess();
    if (!refreshedAccess.user) {
      redirect("/sign-in");
    }

    if (!refreshedAccess.org?.id || !refreshedAccess.hasMembership || !refreshedAccess.hasActiveEntitlement) {
      redirect("/dashboard");
    }

    if (refreshedAccess.role === "viewer") {
      redirect(`/missions/${missionId}?approved=denied`);
    }

    const refreshedDetail = await getMissionDetail(refreshedAccess, missionId);
    const latestVersion = refreshedDetail?.versions[0] ?? null;

    if (!refreshedDetail || !latestVersion) {
      redirect(`/missions/${missionId}?approved=missing-version`);
    }

    const existingValidationSummary = (latestVersion.validation_summary as Record<string, unknown> | null) ?? {};

    try {
      await updateMissionVersion(latestVersion.id, {
        status: "approved",
        validation_summary: {
          ...existingValidationSummary,
          status: "approved",
          approvedAt: new Date().toISOString(),
          approvedByUserId: refreshedAccess.user.id,
          approvedByEmail: refreshedAccess.user.email,
        },
      });

      await updateMission(refreshedDetail.mission.id, {
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

  async function confirmInstall() {
    "use server";

    const refreshedAccess = await getDroneOpsAccess();
    if (!refreshedAccess.user) {
      redirect("/sign-in");
    }

    if (!refreshedAccess.org?.id || !refreshedAccess.hasMembership || !refreshedAccess.hasActiveEntitlement) {
      redirect("/dashboard");
    }

    if (refreshedAccess.role === "viewer") {
      redirect(`/missions/${missionId}?installed=denied`);
    }

    const refreshedDetail = await getMissionDetail(refreshedAccess, missionId);
    const latestVersion = refreshedDetail?.versions[0] ?? null;

    if (!refreshedDetail || !latestVersion) {
      redirect(`/missions/${missionId}?installed=missing-version`);
    }

    const existingExportSummary = (latestVersion.export_summary as Record<string, unknown> | null) ?? {};

    try {
      await updateMissionVersion(latestVersion.id, {
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

  async function markMissionDelivered() {
    "use server";

    const refreshedAccess = await getDroneOpsAccess();
    if (!refreshedAccess.user) {
      redirect("/sign-in");
    }

    if (!refreshedAccess.org?.id || !refreshedAccess.hasMembership || !refreshedAccess.hasActiveEntitlement) {
      redirect("/dashboard");
    }

    if (refreshedAccess.role === "viewer") {
      redirect(`/missions/${missionId}?delivered=denied`);
    }

    const refreshedDetail = await getMissionDetail(refreshedAccess, missionId);
    if (!refreshedDetail) {
      redirect(`/missions/${missionId}?delivered=error`);
    }

    try {
      await updateMission(refreshedDetail.mission.id, {
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

  const latestVersion = detail.versions[0] ?? null;
  const provingJob = detail.jobs.find((job) => isProvingJobRecord(job)) ?? null;
  const firstReadyArtifact = detail.outputs.find((output) => output.status === "ready") ?? null;
  const latestPlanPayload = ((latestVersion?.plan_payload as Record<string, unknown> | null) ?? {}) as Record<string, unknown>;
  const latestValidationSummary = ((latestVersion?.validation_summary as Record<string, unknown> | null) ?? {}) as Record<string, unknown>;
  const latestExportSummary = ((latestVersion?.export_summary as Record<string, unknown> | null) ?? {}) as Record<string, unknown>;
  const exportTargets = Array.isArray(latestPlanPayload.exportTargets)
    ? latestPlanPayload.exportTargets.filter((value): value is string => typeof value === "string")
    : [];
  const validationChecks = Array.isArray(latestValidationSummary.checks)
    ? latestValidationSummary.checks.filter((value): value is string => typeof value === "string")
    : [];
  const availableExports = Array.isArray(latestExportSummary.available)
    ? latestExportSummary.available.filter((value): value is string => typeof value === "string")
    : [];
  const blockers = getStringArray(detail.summary.blockers);
  const warnings = getStringArray(detail.summary.warnings);
  const calloutMessage = getCalloutMessage(resolvedSearchParams);
  const ingestSessions = detail.ingestSessions.map((session) => ({
    session,
    posture: summarizeV1IngestSession({
      status: session.status,
      sourceType: session.source_type,
      sourceFilename: session.source_filename,
      sourceZipPath: session.source_zip_path,
      extractedDatasetPath: session.extracted_dataset_path,
      benchmarkSummaryPath: session.benchmark_summary_path,
      runLogPath: session.run_log_path,
      reviewBundleZipPath: session.review_bundle_zip_path,
      imageCount: session.image_count,
      fileSizeBytes: session.file_size_bytes,
      reviewBundleReady: session.review_bundle_ready,
      truthfulPass: session.truthful_pass,
    }),
  }));
  const truthfulReadyIngestCount = ingestSessions.filter((item) => item.posture.contractCleared).length;
  const deliverySummary = ((detail.summary.delivery as Record<string, unknown> | null) ?? {}) as Record<string, unknown>;
  const missionGeometry = (detail.mission.planning_geometry as Json | null) ?? null;
  const defaultDataset = detail.datasets[0] ?? null;
  const selectedDataset = detail.datasets.find((dataset) => dataset.id === resolvedSearchParams.dataset) ?? defaultDataset;
  const selectedDatasetGeometry = (selectedDataset?.spatial_footprint as Json | null | undefined) ?? null;
  const aoiGeometryJson = formatGeoJsonSurface(missionGeometry);
  const missionSpatialInsight = getMissionSpatialInsight({
    missionType: detail.mission.mission_type,
    areaAcres: getNumber(detail.summary.areaAcres),
    imageCount: getNumber(detail.summary.imageCount),
    gsdCm: getNumber(detail.summary.gsdCm),
    coordinateSystem: getString(detail.summary.coordinateSystem, "Unknown CRS"),
    warnings,
    blockers,
    availableExports,
    versionStatus: latestVersion?.status,
    missionStatus: detail.mission.status,
  });
  const missionGisBrief = buildMissionGisBrief({
    missionName: detail.mission.name,
    projectName: detail.project?.name ?? "Project pending",
    missionType: detail.mission.mission_type,
    areaAcres: getNumber(detail.summary.areaAcres),
    imageCount: getNumber(detail.summary.imageCount),
    coordinateSystem: getString(detail.summary.coordinateSystem, "Unknown CRS"),
    versionStatus: latestVersion?.status ?? "draft",
    missionStatus: detail.mission.status,
    insight: missionSpatialInsight,
  });
  const coverageRoster = getCoverageRoster({
    missionGeometry,
    datasets: detail.datasets.map((dataset) => ({
      id: dataset.id,
      name: dataset.name,
      status: dataset.status,
      spatialFootprint: (dataset.spatial_footprint as Json | null) ?? null,
    })),
  });
  const coverageRosterSummary = buildCoverageRosterSummary({
    missionName: detail.mission.name,
    items: coverageRoster,
  });
  const bestCoverage = coverageRoster.find((item) => item.coveragePercent !== null)?.coveragePercent ?? null;
  const missionGeometryInsight = getMissionGeometryInsight({
    geometry: missionGeometry,
    fallbackAreaAcres: getNumber(detail.summary.areaAcres),
    missionType: detail.mission.mission_type,
  });
  const coverageComparisonInsight = getCoverageComparisonInsight({
    missionGeometry,
    datasetGeometry: selectedDatasetGeometry,
  });
  const terrainInsight = getTerrainInsight({
    areaAcres: getNumber(detail.summary.areaAcres),
    gsdCm: getNumber(detail.summary.gsdCm),
    missionType: detail.mission.mission_type,
    warnings,
  });
  const overlayPlan = getMissionOverlayPlan({
    missionType: detail.mission.mission_type,
    areaAcres: getNumber(detail.summary.areaAcres),
    geometryAttached: missionGeometryInsight.hasGeometry,
    terrainRiskLevel: terrainInsight.riskLevel,
    missionStatus: detail.mission.status,
    installBundleReady: availableExports.includes("install_bundle"),
  });
  const overlayChecklist = buildMissionOverlayChecklist({
    missionName: detail.mission.name,
    projectName: detail.project?.name ?? "Project pending",
    recommendations: overlayPlan.recommendations,
  });
  const overlayReviewSummary = ((detail.summary.overlayReview as Record<string, unknown> | null) ?? {}) as Record<string, unknown>;
  const checkedOverlayIds = new Set(
    Array.isArray(overlayReviewSummary.checkedIds)
      ? overlayReviewSummary.checkedIds.filter((value): value is string => typeof value === "string")
      : [],
  );
  const reviewedOverlayCount = overlayPlan.recommendations.filter((item) => checkedOverlayIds.has(item.id)).length;
  const readinessSummary = getMissionReadinessSummary({
    hasMissionGeometry: missionGeometryInsight.hasGeometry,
    datasetCount: detail.datasets.length,
    primaryDatasetHasGeometry: Boolean(selectedDatasetGeometry),
    primaryDatasetReady: selectedDataset?.status === "ready",
    jobCount: detail.jobs.length,
    readyOutputCount: detail.outputs.filter((output) => output.status === "ready").length,
    installBundleReady: availableExports.includes("install_bundle"),
    versionApproved: Boolean(latestVersion && ["approved", "installed"].includes(latestVersion.status)),
    installConfirmed: Boolean(typeof latestExportSummary.installConfirmedAt === "string" || latestVersion?.status === "installed"),
    overlayReviewedCount: reviewedOverlayCount,
    overlayTotalCount: overlayPlan.recommendations.length,
    delivered: detail.mission.status === "delivered",
  });
  const readinessChecklist = buildMissionReadinessChecklist({
    missionName: detail.mission.name,
    steps: readinessSummary.steps,
  });
  const handoffCounts = summarizeArtifactHandoffs(
    detail.outputs.map((output) =>
      output.metadata && typeof output.metadata === "object" && !Array.isArray(output.metadata)
        ? (output.metadata as ArtifactMetadataRecord)
        : {},
    ),
  );
  const overlayReviewPercent = overlayPlan.recommendations.length > 0
    ? Math.round((reviewedOverlayCount / overlayPlan.recommendations.length) * 100)
    : null;
  const dashboardMetrics = [
    {
      id: "readiness",
      label: "Mission readiness",
      value: readinessSummary.percent,
      displayValue: `${readinessSummary.percent}%`,
      detail: `${readinessSummary.completeCount}/${readinessSummary.totalCount} checklist steps complete.`,
      tone: readinessSummary.percent >= 85 ? "success" as const : readinessSummary.percent >= 60 ? "info" as const : "warning" as const,
    },
    {
      id: "spatial",
      label: "Spatial score",
      value: missionSpatialInsight.score,
      displayValue: `${missionSpatialInsight.score}`,
      detail: missionSpatialInsight.summary,
      tone: missionSpatialInsight.riskLevel === "low" ? "success" as const : missionSpatialInsight.riskLevel === "moderate" ? "info" as const : "warning" as const,
    },
    {
      id: "terrain",
      label: "Terrain posture",
      value: terrainInsight.score,
      displayValue: `${terrainInsight.score}`,
      detail: terrainInsight.summary,
      tone: terrainInsight.riskLevel === "low" ? "success" as const : terrainInsight.riskLevel === "moderate" ? "info" as const : "warning" as const,
    },
    {
      id: "overlay-review",
      label: "Overlay review",
      value: overlayReviewPercent,
      displayValue: overlayReviewPercent !== null ? `${overlayReviewPercent}%` : "N/A",
      detail: `${reviewedOverlayCount}/${overlayPlan.recommendations.length} recommended overlay layers reviewed.`,
      tone: overlayReviewPercent !== null && overlayReviewPercent >= 100 ? "success" as const : overlayReviewPercent !== null && overlayReviewPercent >= 50 ? "info" as const : "warning" as const,
    },
    {
      id: "best-coverage",
      label: "Best dataset coverage",
      value: bestCoverage,
      displayValue: bestCoverage !== null ? `${bestCoverage}%` : "N/A",
      detail: bestCoverage !== null ? "Highest planned-versus-captured extent coverage among attached datasets." : "No comparable dataset footprint available yet.",
      tone: bestCoverage !== null && bestCoverage >= 90 ? "success" as const : bestCoverage !== null && bestCoverage >= 70 ? "info" as const : "warning" as const,
    },
  ];
  const ingestDownloadUrls = new Map(
    await Promise.all(
      ingestSessions.map(async ({ session }) => [
        session.id,
        await tryCreateSignedDownloadUrl({ path: session.review_bundle_zip_path, download: `${session.session_label}.zip` }),
      ] as const),
    ),
  );
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
  const calloutState =
    resolvedSearchParams.created
    ?? resolvedSearchParams.attached
    ?? resolvedSearchParams.ingest
    ?? resolvedSearchParams.seeded
    ?? resolvedSearchParams.queued
    ?? resolvedSearchParams.bundled
    ?? resolvedSearchParams.approved
    ?? resolvedSearchParams.installed
    ?? resolvedSearchParams.delivered
    ?? resolvedSearchParams.aoi
    ?? resolvedSearchParams.overlay;

  return (
    <main className="app-shell stack-md">
      <section className="surface section-header">
        <div className="stack-sm">
          <p className="eyebrow">Mission detail</p>
          <h1>{detail.mission.name}</h1>
          <p className="muted">
            {detail.project?.name ?? "Project pending"} · {detail.site?.name ?? "Site pending"} ·{" "}
            {detail.mission.mission_type}
          </p>
        </div>

        <div className="header-actions">
          <Link href="/missions" className="button button-secondary">
            Back to workspace
          </Link>
          <SignOutForm label="Sign out" variant="secondary" />
        </div>
      </section>

      {calloutMessage && calloutState ? (
        <section className={getCalloutClassName(calloutState)}>{calloutMessage}</section>
      ) : null}

      <MissionStatusDashboard
        title="At-a-glance operational posture"
        subtitle="Visual summary of readiness, GIS quality, terrain posture, overlay review, and best attached dataset coverage."
        metrics={dashboardMetrics}
      />

      <section className="detail-grid">
        <article className="surface stack-sm">
          <div className="stack-xs">
            <p className="eyebrow">Mission summary</p>
            <h2>Operational posture</h2>
          </div>

          <dl className="mission-meta-grid">
            <div className="kv-row">
              <dt>Objective</dt>
              <dd>{detail.mission.objective ?? "Not set"}</dd>
            </div>
            <div className="kv-row">
              <dt>Coordinate system</dt>
              <dd>{getString(detail.summary.coordinateSystem, "Unknown CRS")}</dd>
            </div>
            <div className="kv-row">
              <dt>Target device</dt>
              <dd>{getString(detail.summary.targetDevice)}</dd>
            </div>
            <div className="kv-row">
              <dt>Processing profile</dt>
              <dd>{getString(detail.summary.processingProfile)}</dd>
            </div>
            <div className="kv-row">
              <dt>Area</dt>
              <dd>{getNumber(detail.summary.areaAcres)} acres</dd>
            </div>
            <div className="kv-row">
              <dt>Images</dt>
              <dd>{getNumber(detail.summary.imageCount)}</dd>
            </div>
            <div className="kv-row">
              <dt>Target GSD</dt>
              <dd>{getNumber(detail.summary.gsdCm)} cm</dd>
            </div>
            <div className="kv-row">
              <dt>Updated</dt>
              <dd>{formatDateTime(detail.mission.updated_at)}</dd>
            </div>
          </dl>

          <div className="ops-two-column-list-grid">
            <div className="stack-xs">
              <h3>Blockers</h3>
              <ul className="action-list mission-blocker-list">
                {blockers.length > 0 ? blockers.map((item) => <li key={item}>{item}</li>) : <li>No blockers recorded.</li>}
              </ul>
            </div>
            <div className="stack-xs">
              <h3>Warnings</h3>
              <ul className="action-list mission-blocker-list">
                {warnings.length > 0 ? warnings.map((item) => <li key={item}>{item}</li>) : <li>No warnings recorded.</li>}
              </ul>
            </div>
          </div>

          <div className="surface-form-shell stack-sm">
            <div className="ops-list-card-header">
              <div className="stack-xs">
                <h3>Mission readiness tracker</h3>
                <p className="muted">A single progress view across geometry, datasets, QA, outputs, overlays, install, and delivery.</p>
              </div>
              <span className={readinessSummary.percent >= 85 ? "status-pill status-pill--success" : readinessSummary.percent >= 60 ? "status-pill status-pill--info" : "status-pill status-pill--warning"}>
                {readinessSummary.percent}% ready
              </span>
            </div>
            <p className="muted">{readinessSummary.summary}</p>
            <ul className="action-list mission-blocker-list">
              {readinessSummary.steps.map((step) => (
                <li key={step.id}>
                  <strong>{step.done ? "✓" : "○"} {step.label}</strong> — {step.detail}
                </li>
              ))}
            </ul>
            <SupportContextCopyButton
              text={readinessChecklist}
              buttonLabel="Copy readiness checklist"
              successMessage="Mission readiness checklist copied. Paste it into notes, Slack, or a delivery checklist."
              fallbackAriaLabel="Mission readiness checklist"
              fallbackHintMessage="Press Ctrl/Cmd+C, then paste this readiness checklist into docs, chat, or a handoff note."
            />
          </div>

          <div className="surface-form-shell stack-sm">
            <div className="ops-list-card-header">
              <div className="stack-xs">
                <h3>GIS spatial intelligence</h3>
                <p className="muted">Explainable GIS-native readiness scoring based on mission scale, capture density, CRS posture, blockers, and export state.</p>
              </div>
              <span className={missionSpatialInsight.riskLevel === "low" ? "status-pill status-pill--success" : missionSpatialInsight.riskLevel === "moderate" ? "status-pill status-pill--info" : "status-pill status-pill--warning"}>
                Score {missionSpatialInsight.score}
              </span>
            </div>
            <p className="muted">{missionSpatialInsight.summary}</p>
            <ul className="action-list mission-blocker-list">
              {missionSpatialInsight.recommendations.map((item) => <li key={item}>{item}</li>)}
            </ul>
            <SupportContextCopyButton
              text={missionGisBrief}
              buttonLabel="Copy GIS copilot brief"
              successMessage="GIS copilot brief copied. Paste it into notes, Slack, or client-safe QA docs."
              fallbackAriaLabel="Mission GIS copilot brief"
              fallbackHintMessage="Press Ctrl/Cmd+C, then paste this GIS brief into docs, chat, or a delivery checklist."
            />
          </div>
        </article>

        <aside id="mission-live-action" className="surface stack-sm">
          <div className="stack-xs">
            <p className="eyebrow">Live action</p>
            <h2>Attach data, geometry, queue processing, and stage install handoff</h2>
            <p className="muted">
              This mission page now supports the next real v1 loop: record intake evidence, attach a dataset, attach AOI geometry, queue a job, and generate install-handoff artifacts for field use.
            </p>
          </div>

          <dl className="kv-grid">
            <div className="kv-row">
              <dt>Datasets attached</dt>
              <dd>{detail.datasets.length}</dd>
            </div>
            <div className="kv-row">
              <dt>Intake sessions</dt>
              <dd>{detail.ingestSessions.length} total · {truthfulReadyIngestCount} truthful-ready</dd>
            </div>
            <div className="kv-row">
              <dt>Current jobs</dt>
              <dd>{detail.jobs.length}</dd>
            </div>
            <div className="kv-row">
              <dt>Outputs tracked</dt>
              <dd>{detail.outputs.length}</dd>
            </div>
            <div className="kv-row">
              <dt>Latest version</dt>
              <dd>
                {detail.versions[0]
                  ? `v${detail.versions[0].version_number} ${detail.versions[0].status}`
                  : "No version"}
              </dd>
            </div>
          </dl>

          <BrowserZipIntakeForm
            missionName={detail.mission.name}
            datasets={detail.datasets.map((dataset) => ({ id: dataset.id, name: dataset.name }))}
            disabled={access.role === "viewer"}
            prepareUpload={prepareBrowserZipUpload}
            finalizeUpload={finalizeBrowserZipUpload}
          />

          <form action={recordIngestSession} className="stack-sm surface-form-shell">
            <div className="stack-xs">
              <h3>Record truthful v1 intake session</h3>
              <p className="muted">
                Capture the real ZIP, benchmark, and review-bundle evidence path for this mission. This records intake honestly while browser upload is still pending.
              </p>
            </div>
            <div className="form-grid-2">
              <label className="stack-xs">
                <span>Session label</span>
                <input name="sessionLabel" type="text" placeholder="e.g. GV downtown local ODM run 2026-04-05" required />
              </label>
              <label className="stack-xs">
                <span>Source type</span>
                <select name="sourceType" defaultValue="local_zip">
                  <option value="local_zip">Local ZIP run</option>
                  <option value="browser_zip">Browser ZIP intake</option>
                  <option value="external_zip">External ZIP handoff</option>
                </select>
              </label>
            </div>
            <div className="form-grid-2">
              <label className="stack-xs">
                <span>Recorded stage</span>
                <select name="sessionStatus" defaultValue="recorded">
                  <option value="recorded">Recorded</option>
                  <option value="zip_received">ZIP received</option>
                  <option value="extracted">Extracted</option>
                  <option value="benchmark_complete">Benchmark complete</option>
                  <option value="review_bundle_ready">Review bundle ready</option>
                  <option value="blocked">Blocked</option>
                </select>
              </label>
              <label className="stack-xs">
                <span>Linked dataset</span>
                <select name="linkedDatasetId" defaultValue="">
                  <option value="">No linked dataset yet</option>
                  {detail.datasets.map((dataset) => (
                    <option key={dataset.id} value={dataset.id}>{dataset.name}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="form-grid-2">
              <label className="stack-xs">
                <span>Source ZIP filename</span>
                <input name="sourceFilename" type="text" placeholder="e.g. gv-downtown.zip" />
              </label>
              <label className="stack-xs">
                <span>Source ZIP path</span>
                <input name="sourceZipPath" type="text" placeholder="/data/uploads/gv-downtown.zip" />
              </label>
            </div>
            <div className="form-grid-2">
              <label className="stack-xs">
                <span>Extracted dataset path</span>
                <input name="extractedDatasetPath" type="text" placeholder="/workspace/.data/v1_slice_gv/dataset" />
              </label>
              <label className="stack-xs">
                <span>Benchmark summary path</span>
                <input name="benchmarkSummaryPath" type="text" placeholder="benchmark/20260405T190000Z_gv/summary.json" />
              </label>
            </div>
            <div className="form-grid-2">
              <label className="stack-xs">
                <span>Run log path</span>
                <input name="runLogPath" type="text" placeholder="benchmark/20260405T190000Z_gv/run.log" />
              </label>
              <label className="stack-xs">
                <span>Review bundle ZIP path</span>
                <input name="reviewBundleZipPath" type="text" placeholder=".data/v1_slice_gv/export_bundle_gv.zip" />
              </label>
            </div>
            <div className="form-grid-2">
              <label className="stack-xs">
                <span>Image count</span>
                <input name="imageCount" type="number" min="0" step="1" defaultValue="0" />
              </label>
              <label className="stack-xs">
                <span>ZIP size (bytes)</span>
                <input name="fileSizeBytes" type="number" min="0" step="1" placeholder="734003200" />
              </label>
            </div>
            <div className="form-grid-2">
              <label className="stack-xs">
                <span>Truthful v1 result</span>
                <select name="truthfulPass" defaultValue="pending">
                  <option value="pending">Pending / not recorded</option>
                  <option value="pass">Pass</option>
                  <option value="fail">Fail</option>
                </select>
              </label>
              <label className="stack-xs checkbox-row">
                <input name="reviewBundleReady" type="checkbox" value="on" />
                <span>Review bundle ZIP is ready for operator download</span>
              </label>
            </div>
            <label className="stack-xs">
              <span>Operator notes</span>
              <textarea name="sessionNotes" rows={3} placeholder="Exact blockers, dataset provenance, or import notes."></textarea>
            </label>
            <button
              type="submit"
              className="button button-secondary"
              disabled={access.role === "viewer"}
            >
              Record intake session
            </button>
          </form>

          <form action={attachDataset} className="stack-sm surface-form-shell">
            <div className="stack-xs">
              <h3>Attach dataset</h3>
              <p className="muted">Use this while the fuller ingest/preflight flow is still under construction.</p>
            </div>
            <div className="form-grid-2">
              <label className="stack-xs">
                <span>Dataset name</span>
                <input name="datasetName" type="text" placeholder="e.g. South slope image batch" required />
              </label>
              <label className="stack-xs">
                <span>Dataset kind</span>
                <select name="datasetKind" defaultValue="image">
                  <option value="image">Image</option>
                  <option value="video">Video</option>
                  <option value="thermal">Thermal</option>
                  <option value="multispectral">Multispectral</option>
                  <option value="mission_template">Mission template</option>
                </select>
              </label>
            </div>
            <label className="stack-xs">
              <span>Image/frame count</span>
              <input name="imageCount" type="number" min="0" step="1" defaultValue="0" />
            </label>
            <div className="form-grid-2">
              <label className="stack-xs">
                <span>Front overlap (%)</span>
                <input name="overlapFront" type="number" min="0" max="100" step="1" defaultValue="80" />
              </label>
              <label className="stack-xs">
                <span>Side overlap (%)</span>
                <input name="overlapSide" type="number" min="0" max="100" step="1" defaultValue="70" />
              </label>
            </div>
            <label className="stack-xs checkbox-row">
              <input name="gcpCaptured" type="checkbox" value="on" />
              <span>Ground control collected</span>
            </label>
            <button
              type="submit"
              className="button button-secondary"
              disabled={access.role === "viewer"}
            >
              Attach dataset
            </button>
          </form>

          <form action={attachMissionGeometry} className="stack-sm surface-form-shell">
            <div className="stack-xs">
              <h3>Attach AOI geometry</h3>
              <p className="muted">Paste GeoJSON Polygon or MultiPolygon to power AOI, terrain, overlay, and coverage analytics.</p>
            </div>
            <GeometryJsonField
              name="aoiGeometryJson"
              label="GeoJSON"
              mode="mission"
              defaultValue={aoiGeometryJson}
              placeholder='{"type":"Polygon","coordinates":[...]}'
            />
            <button type="submit" className="button button-secondary" disabled={access.role === "viewer"}>
              Save AOI geometry
            </button>
          </form>

          <div className="stack-xs surface-form-shell">
            <div className="stack-xs">
              <h3>Live proving path</h3>
              <p className="muted">
                Fastest honest next step for clearing the live v1 acceptance loop on this mission.
              </p>
            </div>
            {detail.datasets.length === 0 && detail.jobs.length === 0 ? (
              <>
                <p className="muted">No live dataset or job exists yet for this mission.</p>
                <form action={seedProvingRun}>
                  <button
                    type="submit"
                    className="button button-primary"
                    disabled={access.role === "viewer"}
                  >
                    Seed proving dataset + job
                  </button>
                </form>
              </>
            ) : detail.datasets.length > 0 && detail.jobs.length === 0 ? (
              <>
                <p className="muted">Dataset exists. Next step is to create a managed processing request that truthfully tracks operator intake, dispatch, QA, and delivery readiness.</p>
                <form action={queueMissionProcessing}>
                  <button
                    type="submit"
                    className="button button-primary"
                    disabled={access.role === "viewer"}
                  >
                    Create managed request
                  </button>
                </form>
              </>
            ) : provingJob && ["queued", "running"].includes(provingJob.status) ? (
              <>
                <p className="muted">
                  Proving job is {provingJob.status}. The worker heartbeat now auto-progresses the live path out of band; use this control only if you want to force the next honest state immediately.
                </p>
                <div className="header-actions">
                  <form action={advanceProvingJob}>
                    <button type="submit" className="button button-primary" disabled={access.role === "viewer"}>
                      {provingJob.status === "queued" ? "Force start now" : "Force complete now"}
                    </button>
                  </form>
                  <Link href={`/jobs/${provingJob.id}`} className="button button-secondary">
                    Open proving job
                  </Link>
                </div>
              </>
            ) : firstReadyArtifact ? (
              <>
                <p className="muted">Artifacts are ready. Next step is to review/share/export through the delivery lane.</p>
                <Link href={`/artifacts/${firstReadyArtifact.id}`} className="button button-primary">
                  Review first ready artifact
                </Link>
              </>
            ) : (
              <>
                <p className="muted">The live mission path exists. Review the processing runs to decide the next proving action.</p>
                <Link href="#mission-jobs" className="button button-primary">
                  Open mission jobs
                </Link>
              </>
            )}
          </div>

          <form action={queueMissionProcessing}>
            <button
              type="submit"
              className="button button-primary"
              disabled={detail.datasets.length === 0 || access.role === "viewer"}
            >
              Create managed request
            </button>
          </form>
          {detail.datasets.length === 0 ? (
            <p className="muted">A dataset must exist before a managed processing request can be created.</p>
          ) : null}

          <form action={seedProvingRun} className="stack-xs surface-form-shell">
            <div className="stack-xs">
              <h3>Seed live proving run</h3>
              <p className="muted">
                Create a real dataset, queued job, events, and placeholder outputs for this mission in one step. This is meant to accelerate the live v1 proving path, not fake delivery completion.
              </p>
            </div>
            <button
              type="submit"
              className="button button-secondary"
              disabled={access.role === "viewer" || detail.datasets.length > 0 || detail.jobs.length > 0}
            >
              Seed proving dataset + job
            </button>
            {detail.datasets.length > 0 || detail.jobs.length > 0 ? (
              <p className="muted">This mission already has live datasets or jobs, so the proving seed is locked.</p>
            ) : null}
          </form>

          <form action={generateInstallBundle} className="stack-xs surface-form-shell">
            <div className="stack-xs">
              <h3>Generate install bundle</h3>
              <p className="muted">
                Create the browser-first field handoff package for the latest mission version.
              </p>
            </div>
            <button
              type="submit"
              className="button button-secondary"
              disabled={!latestVersion || access.role === "viewer"}
            >
              Generate install bundle
            </button>
            {!latestVersion ? <p className="muted">A mission version must exist before install outputs can be staged.</p> : null}
          </form>
        </aside>
      </section>

      <section className="grid-cards">
        <article className="surface stack-sm info-card">
          <div className="stack-xs">
            <p className="eyebrow">Truthful v1 intake</p>
            <h2>ZIP, benchmark, and review-bundle evidence</h2>
            <p className="muted">Operator-entered session records that bridge local ODM runs and the later browser upload lane without claiming the upload stack already exists.</p>
          </div>
          <div className="stack-xs">
            {ingestSessions.length > 0 ? ingestSessions.map(({ session, posture }) => (
              <article key={session.id} className="ops-list-card stack-xs">
                <div className="ops-list-card-header">
                  <strong>{session.session_label}</strong>
                  <span className={getIngestStatusPillClassName(posture.contractCleared, session.review_bundle_ready)}>
                    {posture.stageLabel}
                  </span>
                </div>
                <p className="muted">
                  {session.source_type} · updated {formatDateTime(session.updated_at)} · {session.image_count ?? "?"} image(s) · {formatFileSize(session.file_size_bytes)}
                </p>
                <dl className="kv-grid">
                  <div className="kv-row">
                    <dt>ZIP evidence</dt>
                    <dd>{session.source_filename ?? session.source_zip_path ?? "Not recorded"}</dd>
                  </div>
                  <div className="kv-row">
                    <dt>Benchmark summary</dt>
                    <dd>{session.benchmark_summary_path ?? "Not recorded"}</dd>
                  </div>
                  <div className="kv-row">
                    <dt>Review bundle ZIP</dt>
                    <dd>{session.review_bundle_zip_path ?? "Not recorded"}</dd>
                  </div>
                  <div className="kv-row">
                    <dt>Truthful result</dt>
                    <dd>
                      {session.truthful_pass === true
                        ? "Pass"
                        : session.truthful_pass === false
                          ? "Fail"
                          : "Pending"}
                    </dd>
                  </div>
                </dl>
                <ul className="action-list mission-blocker-list">
                  {posture.blockers.length > 0
                    ? posture.blockers.slice(0, 4).map((item) => <li key={item}>{item}</li>)
                    : <li>Full truthful v1 evidence chain recorded for this session.</li>}
                </ul>
                <p className="muted">Next step: {posture.nextStep}</p>
                {ingestDownloadUrls.get(session.id) ? (
                  <a href={ingestDownloadUrls.get(session.id) ?? undefined} className="button button-secondary" target="_blank" rel="noreferrer">
                    Download review bundle
                  </a>
                ) : null}
                {session.notes ? <p className="muted"><strong>Notes:</strong> {session.notes}</p> : null}
              </article>
            )) : <p className="muted">No intake sessions recorded yet. Use the form above to capture ZIP, benchmark, and review-bundle evidence for this mission.</p>}
          </div>
        </article>

        <article id="mission-datasets" className="surface stack-sm info-card">
          <div className="stack-xs">
            <p className="eyebrow">Datasets</p>
            <h2>Mission ingest lane</h2>
          </div>
          <div className="stack-xs">
            {detail.datasets.map((dataset) => {
              const datasetMetadata = (dataset.metadata as Record<string, unknown> | null) ?? {};
              const preflight = (datasetMetadata.preflight as Record<string, unknown> | null) ?? {};
              const findings = Array.isArray(preflight.findings)
                ? preflight.findings.filter((value): value is string => typeof value === "string")
                : [];

              return (
                <article key={dataset.id} className="ops-list-card stack-xs">
                  <div className="ops-list-card-header">
                    <strong>{dataset.name}</strong>
                    <span className={dataset.status === "preflight_flagged" ? "status-pill status-pill--warning" : "status-pill status-pill--success"}>
                      {dataset.status}
                    </span>
                  </div>
                  <p className="muted">{dataset.kind} · captured {formatDateTime(dataset.captured_at)}</p>
                  {findings.length > 0 ? (
                    <ul className="action-list mission-blocker-list">
                      {findings.slice(0, 2).map((item) => <li key={item}>{item}</li>)}
                    </ul>
                  ) : null}
                  <div className="header-actions">
                    <Link href={`/datasets/${dataset.id}`} className="button button-secondary">
                      Review dataset
                    </Link>
                    <Link
                      href={`/missions/${detail.mission.id}?dataset=${dataset.id}`}
                      className={dataset.id === selectedDataset?.id ? "button button-primary" : "button button-secondary"}
                    >
                      {dataset.id === selectedDataset?.id ? "Active comparison dataset" : "Use for comparison"}
                    </Link>
                  </div>
                </article>
              );
            })}
            {detail.datasets.length === 0 ? <p className="muted">No datasets attached yet.</p> : null}
          </div>
        </article>

        <article className="surface stack-sm info-card">
          <div className="stack-xs">
            <p className="eyebrow">Versions</p>
            <h2>Planner history</h2>
          </div>
          <div className="stack-xs">
            {detail.versions.map((version) => (
              <article key={version.id} className="ops-list-card">
                <div className="ops-list-card-header">
                  <strong>v{version.version_number}</strong>
                  <span className="status-pill status-pill--warning">{version.status}</span>
                </div>
                <p className="muted">{version.source_format} · created {formatDateTime(version.created_at)}</p>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="grid-cards">
        <article className="surface stack-sm info-card">
          <div className="stack-xs">
            <p className="eyebrow">Dataset comparison target</p>
            <h2>Choose active dataset</h2>
            <p className="muted">Use this to drive the preview map and planned-vs-captured coverage comparison with any attached dataset.</p>
          </div>
          <div className="header-actions dataset-switcher-wrap">
            {detail.datasets.length > 0 ? detail.datasets.map((dataset) => (
              <Link
                key={dataset.id}
                href={`/missions/${detail.mission.id}?dataset=${dataset.id}`}
                className={dataset.id === selectedDataset?.id ? "button button-primary" : "button button-secondary"}
              >
                {dataset.name}
              </Link>
            )) : <p className="muted">Attach a dataset first to compare footprints.</p>}
          </div>
        </article>

        <article className="surface stack-sm info-card">
          <div className="stack-xs">
            <p className="eyebrow">Dataset coverage roster</p>
            <h2>All attached dataset comparisons</h2>
            <p className="muted">A mission-wide ranking of attached datasets by planned-versus-captured coverage comparability and estimated extent overlap.</p>
          </div>
          <ul className="action-list mission-blocker-list">
            {coverageRoster.length > 0 ? coverageRoster.map((item) => (
              <li key={item.id}>
                <strong>{item.name}</strong> — {item.coveragePercent !== null ? `${item.coveragePercent}% covered` : "Coverage unavailable"}; {item.overlapAreaAcres !== null ? `${item.overlapAreaAcres} acres overlap` : "No overlap estimate"}. {item.summary}
              </li>
            )) : <li>No datasets attached yet.</li>}
          </ul>
          <SupportContextCopyButton
            text={coverageRosterSummary}
            buttonLabel="Copy coverage roster"
            successMessage="Coverage roster copied. Paste it into notes, Slack, or QA docs."
            fallbackAriaLabel="Mission coverage roster"
            fallbackHintMessage="Press Ctrl/Cmd+C, then paste this coverage roster into notes, chat, or a QA checklist."
          />
        </article>

        <GeometryPreviewCard
          title="Mission AOI and dataset footprint"
          subtitle={`Quick in-app visual preview of the planned AOI and ${selectedDataset ? `the selected dataset footprint (${selectedDataset.name})` : "the selected dataset footprint"}.`}
          missionGeometry={missionGeometry}
          datasetGeometry={selectedDatasetGeometry}
        />

        <article className="surface stack-sm info-card">
          <div className="stack-xs">
            <p className="eyebrow">Geometry intelligence</p>
            <h2>AOI footprint posture</h2>
          </div>
          <div className="ops-list-card-header">
            <p className="muted">{missionGeometryInsight.summary}</p>
            <span className={missionGeometryInsight.hasGeometry ? "status-pill status-pill--success" : "status-pill status-pill--warning"}>
              {missionGeometryInsight.hasGeometry ? "Geometry attached" : "Geometry missing"}
            </span>
          </div>
          <dl className="kv-grid">
            <div className="kv-row">
              <dt>Area</dt>
              <dd>{missionGeometryInsight.areaAcres ? `${missionGeometryInsight.areaAcres} acres` : "Unknown"}</dd>
            </div>
            <div className="kv-row">
              <dt>Footprint extent</dt>
              <dd>{missionGeometryInsight.bboxLabel}</dd>
            </div>
            <div className="kv-row">
              <dt>Shape class</dt>
              <dd>{missionGeometryInsight.shapeClass}</dd>
            </div>
          </dl>
          <ul className="action-list mission-blocker-list">
            {missionGeometryInsight.recommendations.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </article>

        <article className="surface stack-sm info-card">
          <div className="stack-xs">
            <p className="eyebrow">Coverage comparison</p>
            <h2>Planned vs captured extent</h2>
          </div>
          <div className="ops-list-card-header">
            <p className="muted">{coverageComparisonInsight.summary}</p>
            <span className={coverageComparisonInsight.comparable ? "status-pill status-pill--info" : "status-pill status-pill--warning"}>
              {coverageComparisonInsight.comparable && coverageComparisonInsight.coveragePercent !== null
                ? `${coverageComparisonInsight.coveragePercent}% covered`
                : "Need both geometries"}
            </span>
          </div>
          <dl className="kv-grid">
            <div className="kv-row">
              <dt>Reference dataset</dt>
              <dd>{selectedDataset?.name ?? "No dataset attached"}</dd>
            </div>
            <div className="kv-row">
              <dt>Overlap area</dt>
              <dd>{coverageComparisonInsight.overlapAreaAcres !== null ? `${coverageComparisonInsight.overlapAreaAcres} acres` : "Unknown"}</dd>
            </div>
          </dl>
          <ul className="action-list mission-blocker-list">
            {coverageComparisonInsight.recommendations.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </article>

        <article className="surface stack-sm info-card">
          <div className="stack-xs">
            <p className="eyebrow">Overlay plan</p>
            <h2>GIS constraints and context layers</h2>
          </div>
          <div className="ops-list-card-header">
            <p className="muted">{overlayPlan.summary}</p>
            <span className="status-pill status-pill--info">{reviewedOverlayCount}/{overlayPlan.recommendations.length} reviewed</span>
          </div>
          <form action={saveOverlayReview} className="stack-sm surface-form-shell">
            <div className="stack-xs">
              {overlayPlan.recommendations.map((item) => (
                <label key={item.id} className="stack-xs checkbox-row checkbox-row--start">
                  <input
                    name="overlayIds"
                    type="checkbox"
                    value={item.id}
                    defaultChecked={checkedOverlayIds.has(item.id)}
                  />
                  <span>
                    <strong>{item.label}</strong> ({item.priority}) — {item.rationale}
                  </span>
                </label>
              ))}
            </div>
            <button type="submit" className="button button-secondary" disabled={access.role === "viewer"}>
              Save overlay review
            </button>
            {typeof overlayReviewSummary.savedAt === "string" ? (
              <p className="muted">Last saved {formatDateTime(overlayReviewSummary.savedAt)} by {typeof overlayReviewSummary.savedByEmail === "string" ? overlayReviewSummary.savedByEmail : "an operator"}.</p>
            ) : null}
          </form>
          <SupportContextCopyButton
            text={overlayChecklist}
            buttonLabel="Copy overlay checklist"
            successMessage="Overlay checklist copied. Paste it into planning notes, Slack, or a field QA checklist."
            fallbackAriaLabel="Mission overlay checklist"
            fallbackHintMessage="Press Ctrl/Cmd+C, then paste this overlay checklist into notes, chat, or a delivery checklist."
          />
        </article>

        <article className="surface stack-sm info-card">
          <div className="stack-xs">
            <p className="eyebrow">Terrain intelligence</p>
            <h2>Topographic risk posture</h2>
          </div>
          <div className="ops-list-card-header">
            <p className="muted">{terrainInsight.summary}</p>
            <span className={terrainInsight.riskLevel === "low" ? "status-pill status-pill--success" : terrainInsight.riskLevel === "moderate" ? "status-pill status-pill--info" : "status-pill status-pill--warning"}>
              Score {terrainInsight.score}
            </span>
          </div>
          <ul className="action-list mission-blocker-list">
            {terrainInsight.recommendations.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </article>
      </section>

      <section className="grid-cards">
        <article id="mission-install" className="surface stack-sm info-card">
          <div className="stack-xs">
            <p className="eyebrow">Planner + install readiness</p>
            <h2>Latest mission version</h2>
          </div>
          {latestVersion ? (
            <div className="stack-sm">
              <dl className="mission-meta-grid">
                <div className="kv-row">
                  <dt>Version</dt>
                  <dd>v{latestVersion.version_number}</dd>
                </div>
                <div className="kv-row">
                  <dt>Status</dt>
                  <dd>{latestVersion.status}</dd>
                </div>
                <div className="kv-row">
                  <dt>Validation status</dt>
                  <dd>{typeof latestValidationSummary.status === "string" ? latestValidationSummary.status : "pending"}</dd>
                </div>
                <div className="kv-row">
                  <dt>Install helper</dt>
                  <dd>{typeof latestExportSummary.installHelper === "string" ? latestExportSummary.installHelper : "Not generated yet"}</dd>
                </div>
              </dl>

              <div className="ops-two-column-list-grid">
                <div className="stack-xs">
                  <h3>Export targets</h3>
                  <ul className="action-list mission-blocker-list">
                    {exportTargets.length > 0 ? exportTargets.map((item) => <li key={item}>{item}</li>) : <li>No export targets recorded.</li>}
                  </ul>
                </div>
                <div className="stack-xs">
                  <h3>Validation checks</h3>
                  <ul className="action-list mission-blocker-list">
                    {validationChecks.length > 0 ? validationChecks.map((item) => <li key={item}>{item}</li>) : <li>No validation checks recorded.</li>}
                  </ul>
                </div>
              </div>

              <div className="stack-xs">
                <h3>Available exports</h3>
                <ul className="action-list mission-blocker-list">
                  {availableExports.length > 0 ? availableExports.map((item) => <li key={item}>{item}</li>) : <li>No exports generated yet.</li>}
                </ul>
              </div>

              <div className="stack-xs surface-form-shell">
                <h3>Approval + delivery controls</h3>
                <div className="header-actions">
                  <form action={approveMissionVersion}>
                    <button type="submit" className="button button-secondary" disabled={access.role === "viewer" || latestVersion.status === "approved" || latestVersion.status === "installed"}>
                      Approve version
                    </button>
                  </form>
                  <form action={confirmInstall}>
                    <button type="submit" className="button button-secondary" disabled={access.role === "viewer" || latestVersion.status === "installed" || !availableExports.includes("install_bundle")}>
                      Confirm install
                    </button>
                  </form>
                  <form action={markMissionDelivered}>
                    <button type="submit" className="button button-primary" disabled={access.role === "viewer" || detail.mission.status === "delivered"}>
                      Mark delivered
                    </button>
                  </form>
                </div>
                {!availableExports.includes("install_bundle") ? (
                  <p className="muted">Generate an install bundle before confirming install state.</p>
                ) : null}
              </div>
            </div>
          ) : (
            <p className="muted">No mission version exists yet.</p>
          )}
        </article>

        <article id="mission-handoff" className="surface stack-sm info-card">
          <div className="stack-xs">
            <p className="eyebrow">Delivery status</p>
            <h2>Client handoff posture</h2>
          </div>
          <dl className="kv-grid">
            <div className="kv-row">
              <dt>Mission status</dt>
              <dd>{detail.mission.status}</dd>
            </div>
            <div className="kv-row">
              <dt>Delivered at</dt>
              <dd>{typeof deliverySummary.deliveredAt === "string" ? formatDateTime(deliverySummary.deliveredAt) : "Not delivered"}</dd>
            </div>
            <div className="kv-row">
              <dt>Delivered by</dt>
              <dd>{typeof deliverySummary.deliveredByEmail === "string" ? deliverySummary.deliveredByEmail : "Not recorded"}</dd>
            </div>
            <div className="kv-row">
              <dt>Ready artifacts</dt>
              <dd>{detail.outputs.filter((output) => output.status === "ready").length}</dd>
            </div>
            <div className="kv-row">
              <dt>Pending review</dt>
              <dd>{handoffCounts.pendingReviewCount}</dd>
            </div>
            <div className="kv-row">
              <dt>Shared/exported</dt>
              <dd>{handoffCounts.sharedCount + handoffCounts.exportedCount}</dd>
            </div>
          </dl>
        </article>
      </section>

      <section className="ops-console-grid">
        <article id="mission-jobs" className="surface stack-sm">
          <div className="stack-xs">
            <p className="eyebrow">Jobs</p>
            <h2>Mission processing runs</h2>
          </div>
          <div className="stack-xs">
            {detail.jobs.map((job) => {
              const outputSummary = job.output_summary && typeof job.output_summary === "object" && !Array.isArray(job.output_summary)
                ? (job.output_summary as Record<string, unknown>)
                : {};
              const latestCheckpoint = getString(outputSummary.latestCheckpoint as string | undefined, "");
              const stageChecklist = getStageChecklist(outputSummary);

              return (
                <article key={job.id} className="ops-job-card stack-xs">
                  <div className="ops-list-card-header">
                    <div className="stack-xs">
                      <strong>{getString((job.input_summary as Record<string, unknown>).name as string | undefined, `${job.engine.toUpperCase()} job`)}</strong>
                      <span className="muted">{job.engine} · {job.stage}</span>
                    </div>
                    <span className={getJobPillClassName(job.status === "succeeded" ? "completed" : job.status)}>
                      {formatJobStatus(job.status === "succeeded" ? "completed" : job.status === "queued" ? "queued" : job.status === "running" ? "running" : "needs_review")}
                    </span>
                  </div>
                  <div className="ops-progress-row">
                    <div className="ops-progress-track" aria-hidden="true">
                      <span className="ops-progress-fill" style={{ width: `${job.progress}%` }} />
                    </div>
                    <strong>{job.progress}%</strong>
                  </div>
                  {latestCheckpoint ? <p className="muted">Checkpoint: {latestCheckpoint}</p> : null}
                  {stageChecklist.length > 0 ? (
                    <div className="header-actions">
                      {stageChecklist.map((item) => (
                        <span key={`${job.id}-${item.label}-${item.status}`} className={getChecklistStatusClass(item.status)}>
                          {item.label}: {item.status}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  <div className="header-actions">
                    <Link href={`/jobs/${job.id}`} className="button button-secondary">
                      View job detail
                    </Link>
                  </div>
                </article>
              );
            })}
            {detail.jobs.length === 0 ? <p className="muted">No processing jobs yet.</p> : null}
          </div>
        </article>

        <article id="mission-artifacts" className="surface stack-sm">
          <div className="stack-xs">
            <p className="eyebrow">Outputs + events</p>
            <h2>Artifact trail</h2>
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
                    <span
                      className={getOutputPillClassName(
                        output.status === "ready" ? "ready" : output.status === "pending" ? "processing" : "draft",
                      )}
                    >
                      {formatOutputArtifactStatus(
                        output.status === "ready" ? "ready" : output.status === "pending" ? "processing" : "draft",
                      )}
                    </span>
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
            {detail.events.slice(0, 6).map((event) => {
              const payload = (event.payload as Record<string, string | undefined>) ?? {};
              return (
                <article key={event.id} className="ops-event-card stack-xs">
                  <div className="ops-list-card-header">
                    <strong>{payload.title ?? event.event_type}</strong>
                    <span className="muted">{event.event_type}</span>
                  </div>
                  <p className="muted">{payload.detail ?? "No event detail"}</p>
                </article>
              );
            })}
          </div>
        </article>
      </section>
    </main>
  );
}
