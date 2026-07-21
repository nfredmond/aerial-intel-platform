import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { BlockedAccessView } from "@/app/dashboard/blocked-access-view";
import { SignOutForm } from "@/app/dashboard/sign-out-form";
import { SupportContextCopyButton } from "@/app/dashboard/support-context-copy-button";
import { MissionBriefPanel } from "@/components/copilot/mission-brief-panel";
import { getCopilotConfig } from "@/lib/copilot/config";
import { readOrgCopilotEnabled } from "@/lib/copilot/quota";
import { canPerformDroneOpsAction } from "@/lib/auth/actions";
import { AutoRefresh } from "@/components/auto-refresh";
import { BrowserZipIntakeForm } from "@/components/browser-zip-intake-form";
import { GeometryJsonField } from "@/components/geometry-json-field";
import { GeometryPreviewCard } from "@/components/geometry-preview-card";
import { GeometryPreviewMap } from "@/components/map/geometry-preview-map";
import { MissionStatusDashboard } from "@/components/mission-status-dashboard";
import { getDroneOpsAccess } from "@/lib/auth/drone-ops-access";
import {
  formatArtifactHandoffAuditLine,
  getArtifactHandoff,
  type ArtifactMetadataRecord,
} from "@/lib/artifact-handoff";
import {
  getMissionDetail,
  getNumber,
  getString,
} from "@/lib/missions/detail-data";
import { getManagedDispatchHandoff } from "@/lib/managed-processing";
import { formatJobStatus, formatOutputArtifactStatus } from "@/lib/missions/workspace";
import { formatBytes } from "@/lib/ui/bytes";
import { formatDateTime } from "@/lib/ui/datetime";
import {
  statusPillClassName,
  artifactStatusTone,
  jobStatusTone,
  type Tone,
} from "@/lib/ui/tones";
import { createMissionDeliveryPacketAction } from "./delivery-packet-actions";
import * as missionActions from "./actions";
import { buildMissionView } from "./view-model";

function getJobPillClassName(status: string) {
  return statusPillClassName(jobStatusTone(status));
}

function getOutputPillClassName(status: string) {
  return statusPillClassName(artifactStatusTone(status));
}

function getChecklistStatusClass(status: string) {
  const tone: Tone =
    status === "complete" ? "success" : status === "running" ? "info" : "warning";
  return statusPillClassName(tone);
}

function getIngestStatusPillClassName(contractCleared: boolean, reviewBundleReady: boolean) {
  const tone: Tone = contractCleared ? "success" : reviewBundleReady ? "info" : "warning";
  return statusPillClassName(tone);
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

  if (
    state === "missing-dataset" ||
    state === "missing-name" ||
    state === "missing-version" ||
    state === "already" ||
    state === "none-eligible"
  ) {
    return "callout callout-warning";
  }

  return "callout callout-error";
}


export default async function MissionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ missionId: string }>;
  searchParams: Promise<{ queued?: string; attached?: string; ingest?: string; seeded?: string; proving?: string; bundled?: string; approved?: string; installed?: string; delivered?: string; packet?: string; aoi?: string; overlay?: string; created?: string; dataset?: string; extract?: string }>;
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

  const copilotConfig = getCopilotConfig();
  const copilotOrgEnabled = access.org?.id
    ? await readOrgCopilotEnabled(access.org.id)
    : false;
  const copilotUserAllowed = canPerformDroneOpsAction(access, "copilot.generate");
  const copilotAvailable =
    copilotConfig.globalEnabled &&
    copilotConfig.hasApiKey &&
    copilotOrgEnabled &&
    copilotUserAllowed;
  const copilotHint = !copilotConfig.globalEnabled
    ? "Aerial Copilot is disabled on this deployment."
    : !copilotConfig.hasApiKey
      ? "Aerial Copilot is missing server credentials."
      : !copilotOrgEnabled
        ? "Aerial Copilot is not enabled for this organization yet."
        : !copilotUserAllowed
          ? "Your role does not include copilot.generate."
          : "Aerial Copilot is ready.";

  // Server actions live in ./actions; bind the route's missionId so the
  // JSX below keeps referring to them by their original names.
  const attachDataset = missionActions.attachDataset.bind(null, missionId);
  const recordIngestSession = missionActions.recordIngestSession.bind(null, missionId);
  const prepareBrowserZipUpload = missionActions.prepareBrowserZipUpload.bind(null, missionId);
  const finalizeBrowserZipUpload = missionActions.finalizeBrowserZipUpload.bind(null, missionId);
  const extractIngestSession = missionActions.extractIngestSession.bind(null, missionId);
  const queueMissionProcessing = missionActions.queueMissionProcessing.bind(null, missionId);
  const seedProvingRun = missionActions.seedProvingRun.bind(null, missionId);
  const advanceProvingJob = missionActions.advanceProvingJob.bind(null, missionId);
  const generateInstallBundle = missionActions.generateInstallBundle.bind(null, missionId);
  const attachMissionGeometry = missionActions.attachMissionGeometry.bind(null, missionId);
  const saveOverlayReview = missionActions.saveOverlayReview.bind(null, missionId);
  const approveMissionVersion = missionActions.approveMissionVersion.bind(null, missionId);
  const confirmInstall = missionActions.confirmInstall.bind(null, missionId);
  const markMissionDelivered = missionActions.markMissionDelivered.bind(null, missionId);

  const {
    latestVersion,
    provingJob,
    firstReadyArtifact,
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
    selectedDataset,
    selectedDatasetGeometry,
    aoiGeometryJson,
    missionSpatialInsight,
    missionGisBrief,
    coverageRoster,
    coverageRosterSummary,
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
    deliveryPacketEligibility,
    deliveryPackets,
    canCreateDeliveryPacket,
    dashboardMetrics,
    ingestDownloadUrls,
    outputDownloadUrls,
    calloutState,
  } = await buildMissionView({ detail, access, resolvedSearchParams });

  return (
    <main className="app-shell stack-md">
      <AutoRefresh
        enabled={detail.jobs.some((job) => ["queued", "running"].includes(job.status))}
      />
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

      <MissionBriefPanel
        missionId={detail.mission.id}
        missionName={detail.mission.name}
        available={copilotAvailable}
        availabilityHint={copilotHint}
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
                Record the ZIP, benchmark, and review-bundle evidence paths for this mission.
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
                  {session.source_type} · updated {formatDateTime(session.updated_at)} · {session.image_count ?? "?"} image(s) · {formatBytes(session.file_size_bytes)}
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
                {session.source_zip_path && !session.extracted_dataset_path && access.role !== "viewer" ? (
                  <form action={extractIngestSession} className="stack-xs">
                    <input type="hidden" name="sessionId" value={session.id} />
                    <button type="submit" className="button button-secondary">
                      Extract dataset
                    </button>
                    <p className="muted">Downloads the ZIP, flattens images into storage, and records an extracted dataset path the NodeODM upload cron can find.</p>
                  </form>
                ) : null}
                {session.extracted_dataset_path ? (
                  <p className="muted"><strong>Extracted path:</strong> {session.extracted_dataset_path}</p>
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
            {detail.versions.length === 0 ? <p className="muted">No versions snapshotted yet.</p> : null}
          </div>
          <Link href={`/missions/${detail.mission.id}/versions`} className="button button-secondary">
            Manage versions
          </Link>
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

        <GeometryPreviewMap
          title="Mission spatial overview"
          layers={[
            {
              id: "mission-aoi",
              label: "Mission AOI",
              tone: "info",
              geojson: missionGeometry as unknown as import("geojson").GeoJsonObject | null,
              outlineOnly: true,
              dashed: true,
            },
            {
              id: "selected-dataset-footprint",
              label: selectedDataset ? `${selectedDataset.name} footprint` : "Dataset footprint",
              tone: "success",
              geojson: selectedDatasetGeometry as unknown as import("geojson").GeoJsonObject | null,
              opacity: 0.3,
            },
          ]}
          primaryGeometry={missionGeometry as unknown as import("geojson").GeoJsonObject | null}
          note="Pan, zoom, or tap layers. Areas are approximate (WGS84)."
        />

        <GeometryPreviewCard
          title="Mission AOI and dataset footprint"
          subtitle={`SVG preview of the planned AOI and ${selectedDataset ? `the selected dataset footprint (${selectedDataset.name})` : "the selected dataset footprint"} for quick toggling.`}
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
              <dd>{readyArtifactCount}</dd>
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

        <article id="mission-delivery-packets" className="surface stack-sm info-card">
          <div className="ops-list-card-header">
            <div className="stack-xs">
              <p className="eyebrow">Client packet</p>
              <h2>Delivery packets</h2>
            </div>
            <span className={deliveryPacketEligibility.approvedArtifactCount > 0 ? "status-pill status-pill--success" : "status-pill status-pill--warning"}>
              {deliveryPacketEligibility.approvedArtifactCount} eligible
            </span>
          </div>

          <dl className="kv-grid">
            <div className="kv-row">
              <dt>Ready artifacts</dt>
              <dd>{deliveryPacketEligibility.readyArtifactCount}</dd>
            </div>
            <div className="kv-row">
              <dt>Approved eligible</dt>
              <dd>{deliveryPacketEligibility.approvedArtifactCount}</dd>
            </div>
            <div className="kv-row">
              <dt>Blocked from packet</dt>
              <dd>{deliveryPacketEligibility.ineligibleCount}</dd>
            </div>
            <div className="kv-row">
              <dt>Recent packets</dt>
              <dd>{deliveryPackets.length}</dd>
            </div>
          </dl>

          <form action={createMissionDeliveryPacketAction} className="stack-sm surface-form-shell">
            <input type="hidden" name="missionId" value={detail.mission.id} />
            <div className="stack-xs">
              <h3>Create governed ZIP packet</h3>
              <p className="muted">
                Includes README, manifest, review notes, and fresh governed links for ready artifacts whose latest approval is approved.
              </p>
            </div>
            <label className="stack-xs">
              <span>Packet title</span>
              <input name="packetTitle" type="text" defaultValue={`${detail.mission.name} delivery packet`} required />
            </label>
            <label className="stack-xs">
              <span>Packet note</span>
              <textarea name="packetNote" rows={2} placeholder="Client scope, transmittal note, or review context."></textarea>
            </label>
            <div className="form-grid-2">
              <label className="stack-xs">
                <span>Link expiry hours</span>
                <input name="shareExpiresInHours" type="number" min="1" max="8760" step="1" defaultValue="168" />
              </label>
              <label className="stack-xs">
                <span>Max downloads per link</span>
                <input name="shareMaxUses" type="number" min="1" max="1000" step="1" defaultValue="10" />
              </label>
            </div>
            <button type="submit" className="button button-primary" disabled={!canCreateDeliveryPacket}>
              Create delivery packet
            </button>
            {deliveryPacketEligibility.approvedArtifactCount === 0 ? (
              <p className="muted">Approve at least one ready artifact before creating a client delivery packet.</p>
            ) : null}
          </form>

          <div className="stack-xs">
            <h3>Recent packets</h3>
            {deliveryPackets.length > 0 ? (
              deliveryPackets.map((packet) => {
                const metadata = packet.metadata && typeof packet.metadata === "object" && !Array.isArray(packet.metadata)
                  ? (packet.metadata as Record<string, unknown>)
                  : {};
                const artifactCount = typeof metadata.artifactCount === "number"
                  ? metadata.artifactCount
                  : packet.artifact_ids.length;
                const filename = typeof metadata.filename === "string" ? metadata.filename : "delivery packet";

                return (
                  <article key={packet.id} className="ops-list-card stack-xs">
                    <div className="ops-list-card-header">
                      <div className="stack-xs">
                        <strong>{packet.title}</strong>
                        <span className="muted">
                          {artifactCount} artifact link(s) · {formatDateTime(packet.created_at)} · {packet.created_by_email ?? "Unknown creator"}
                        </span>
                      </div>
                      <span className={statusPillClassName(packet.status === "ready" ? "success" : "warning")}>
                        {packet.status}
                      </span>
                    </div>
                    <div className="header-actions">
                      <span className="muted">{filename}</span>
                      {packet.storage_path ? (
                        <a
                          href={`/api/missions/${detail.mission.id}/delivery-packets/${packet.id}/download`}
                          className="button button-secondary"
                        >
                          Download ZIP
                        </a>
                      ) : (
                        <span className="muted">Storage missing</span>
                      )}
                    </div>
                  </article>
                );
              })
            ) : (
              <p className="muted">No delivery packets have been generated for this mission yet.</p>
            )}
          </div>
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
              const dispatchHandoff = getManagedDispatchHandoff(outputSummary, job.external_job_reference);
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
                  {dispatchHandoff.hostLabel || dispatchHandoff.externalRunReference ? (
                    <p className="muted">
                      Dispatch: {dispatchHandoff.hostLabel ?? "Host pending"}
                      {dispatchHandoff.externalRunReference ? ` · Run ref ${dispatchHandoff.externalRunReference}` : ""}
                    </p>
                  ) : null}
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
