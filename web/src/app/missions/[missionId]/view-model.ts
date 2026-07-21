import { canPerformDroneOpsAction } from "@/lib/auth/actions";
import type { getDroneOpsAccess } from "@/lib/auth/drone-ops-access";
import {
  summarizeArtifactHandoffs,
  type ArtifactMetadataRecord,
} from "@/lib/artifact-handoff";
import {
  buildCoverageRosterSummary,
  getCoverageRoster,
} from "@/lib/coverage-roster";
import { summarizeDeliveryPacketEligibility } from "@/lib/delivery-packet";
import { formatGeoJsonSurface } from "@/lib/geojson";
import { buildMissionGisBrief } from "@/lib/gis-briefs";
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
import { getMissionSpatialInsight } from "@/lib/gis-insights";
import {
  getMissionDetail,
  getNumber,
  getString,
  getStringArray,
} from "@/lib/missions/detail-data";
import { isProvingJobRecord } from "@/lib/proving-runs";
import { tryCreateSignedDownloadUrl } from "@/lib/storage-delivery";
import {
  selectArtifactApprovalsByArtifact,
  selectDeliveryPacketsForMission,
} from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/types";
import { summarizeV1IngestSession } from "@/lib/v1-ingest";

type MissionDetail = NonNullable<Awaited<ReturnType<typeof getMissionDetail>>>;
type DroneOpsAccess = Awaited<ReturnType<typeof getDroneOpsAccess>>;

export type MissionSearchParams = {
  queued?: string;
  attached?: string;
  ingest?: string;
  seeded?: string;
  proving?: string;
  bundled?: string;
  approved?: string;
  installed?: string;
  delivered?: string;
  packet?: string;
  aoi?: string;
  overlay?: string;
  created?: string;
  dataset?: string;
  extract?: string;
};

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
  packet?: string;
  aoi?: string;
  overlay?: string;
  created?: string;
  extract?: string;
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
      ? "Intake session recorded. Use it to track ZIP evidence, benchmark paths, and review-bundle readiness."
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
      ? "Simulated proving run seeded (demo lane). This mission now has a demo dataset, queued job, events, and placeholder outputs — no real processing occurs."
      : options.seeded === "already"
        ? "This mission already has datasets or jobs, so no proving run seed was added."
        : options.seeded === "denied"
          ? "Viewer access cannot seed a proving run."
          : options.seeded === "disabled"
            ? "The proving lane is disabled. It is a simulation for demos only; set AERIAL_PROVING_LANE=demo to enable it."
            : "The proving run seed failed. Check server configuration and try again.";
  }

  if (options.proving) {
    return options.proving === "started"
      ? "Simulated proving job started from the mission page (demo lane; no real processing occurs)."
      : options.proving === "completed"
        ? "Simulated proving job completed from the mission page. The placeholder artifacts in the delivery lane are demo data."
        : options.proving === "not-found"
          ? "No active proving job was available to advance from this mission."
          : options.proving === "noop"
            ? "This proving job does not have a next-step automation available right now. Open the job detail if you need deeper triage."
            : options.proving === "denied"
              ? "Viewer access cannot advance proving jobs from the mission page."
              : options.proving === "disabled"
                ? "The proving lane is disabled. It is a simulation for demos only; set AERIAL_PROVING_LANE=demo to enable it."
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

  if (options.packet) {
    return options.packet === "created"
      ? "Delivery packet created. Download it below; included artifact binaries stay behind governed share links."
      : options.packet === "none-eligible"
        ? "No packet was created because this mission has no ready artifacts with latest approval marked approved."
        : options.packet === "denied"
          ? "Viewer access cannot create delivery packets."
          : "Delivery packet creation failed. Check server configuration and try again.";
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

  if (options.extract) {
    switch (options.extract) {
      case "recorded":
        return "Dataset extracted. Images are now in protected storage at the ingest session's extracted path, and the NodeODM upload cron can find them.";
      case "no-images":
        return "The ZIP did not contain any recognizable images (.jpg, .jpeg, .png, .tif, .tiff). No extracted dataset path was recorded.";
      case "already-extracted":
        return "This ingest session already has an extracted dataset path. No re-extraction was attempted.";
      case "missing-zip":
        return "This ingest session has no source ZIP path recorded, so there is nothing to extract.";
      case "missing-session":
        return "The extraction target ingest session could not be resolved for this mission.";
      case "missing-mission":
        return "Mission context could not be refreshed while attempting extraction.";
      case "malformed-zip-path":
        return "The recorded source ZIP path was missing a bucket or object key prefix.";
      case "denied":
        return "Viewer access cannot extract ingest sessions.";
      default:
        return "Dataset extraction could not complete. Check server logs and try again.";
    }
  }

  return null;
}

export async function buildMissionView({
  detail,
  access,
  resolvedSearchParams,
}: {
  detail: MissionDetail;
  access: DroneOpsAccess;
  resolvedSearchParams: MissionSearchParams;
}) {
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
  const readyArtifactCount = detail.outputs.filter((output) => output.status === "ready").length;
  const latestApprovalDecisionEntries = await Promise.all(
    detail.outputs.map(async (output) => {
      const approvals = await selectArtifactApprovalsByArtifact(output.id).catch(() => []);
      return [output.id, approvals[0]?.decision ?? null] as const;
    }),
  );
  const latestApprovalDecisionByArtifact = new Map(latestApprovalDecisionEntries);
  const approvedPacketArtifactCount = detail.outputs.filter((output) =>
    output.status === "ready" &&
    Boolean(output.storage_path) &&
    latestApprovalDecisionByArtifact.get(output.id) === "approved",
  ).length;
  const deliveryPacketEligibility = summarizeDeliveryPacketEligibility({
    readyArtifactCount,
    approvedArtifactCount: approvedPacketArtifactCount,
    totalArtifactCount: detail.outputs.length,
  });
  const deliveryPackets = access.org?.id
    ? await selectDeliveryPacketsForMission({
        orgId: access.org.id,
        missionId: detail.mission.id,
        limit: 5,
      }).catch(() => [])
    : [];
  const canCreateDeliveryPacket =
    canPerformDroneOpsAction(access, "artifacts.export") &&
    deliveryPacketEligibility.approvedArtifactCount > 0;
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
    ?? resolvedSearchParams.packet
    ?? resolvedSearchParams.aoi
    ?? resolvedSearchParams.overlay
    ?? resolvedSearchParams.extract;

  return {
    latestVersion,
    provingJob,
    firstReadyArtifact,
    latestPlanPayload,
    latestValidationSummary,
    latestExportSummary,
    exportTargets,
    validationChecks,
    availableExports,
    blockers,
    warnings,
    calloutMessage,
    ingestSessions,
    truthfulReadyIngestCount,
    deliverySummary,
    missionGeometry,
    defaultDataset,
    selectedDataset,
    selectedDatasetGeometry,
    aoiGeometryJson,
    missionSpatialInsight,
    missionGisBrief,
    coverageRoster,
    coverageRosterSummary,
    bestCoverage,
    missionGeometryInsight,
    coverageComparisonInsight,
    terrainInsight,
    overlayPlan,
    overlayChecklist,
    overlayReviewSummary,
    checkedOverlayIds,
    reviewedOverlayCount,
    readinessSummary,
    readinessChecklist,
    handoffCounts,
    readyArtifactCount,
    latestApprovalDecisionEntries,
    latestApprovalDecisionByArtifact,
    approvedPacketArtifactCount,
    deliveryPacketEligibility,
    deliveryPackets,
    canCreateDeliveryPacket,
    overlayReviewPercent,
    dashboardMetrics,
    ingestDownloadUrls,
    outputDownloadUrls,
    calloutState,
  };
}
