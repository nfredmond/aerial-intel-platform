import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { BlockedAccessView } from "@/app/dashboard/blocked-access-view";
import { SignOutForm } from "@/app/dashboard/sign-out-form";
import { getDroneOpsAccess } from "@/lib/auth/drone-ops-access";
import {
  getMissionDetail,
  getNumber,
  getString,
  getStringArray,
} from "@/lib/missions/detail-data";
import { normalizeSlug } from "@/lib/slug";
import { formatJobStatus, formatOutputArtifactStatus } from "@/lib/missions/workspace";
import {
  insertDataset,
  insertJobEvent,
  insertProcessingJob,
  insertProcessingOutputs,
  updateMissionVersion,
} from "@/lib/supabase/admin";

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

function getCalloutClassName(state: string) {
  if (state === "1" || state === "created") {
    return "callout callout-success";
  }

  if (state === "missing-dataset" || state === "missing-name" || state === "missing-version") {
    return "callout callout-warning";
  }

  return "callout callout-error";
}

function getCalloutMessage(options: {
  queued?: string;
  attached?: string;
  bundled?: string;
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

  if (options.queued) {
    return options.queued === "1"
      ? "Processing job queued. Refreshes should now appear in the live job lane for this mission."
      : options.queued === "missing-dataset"
        ? "This mission does not have a dataset yet, so a processing job could not be queued."
        : options.queued === "denied"
          ? "Viewer access cannot queue processing jobs."
          : "The processing job could not be queued. Check server configuration and try again.";
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

  return null;
}

export default async function MissionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ missionId: string }>;
  searchParams: Promise<{ queued?: string; attached?: string; bundled?: string; created?: string }>;
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
        status: "ready",
        captured_at: new Date().toISOString(),
        metadata: {
          imageCount: Number.isFinite(imageCount) ? imageCount : 0,
          footprint: "Footprint pending planner/dataset ingest linkage",
          finding: "Attached from mission detail page. Full preflight ingestion is still pending.",
        },
        created_by: refreshedAccess.user.id,
      });
    } catch {
      redirect(`/missions/${missionId}?attached=error`);
    }

    redirect(`/missions/${missionId}?attached=1`);
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
    const jobName = `${refreshedDetail.mission.name} processing refresh`;

    try {
      const insertedJob = await insertProcessingJob({
        org_id: refreshedAccess.org.id,
        project_id: refreshedDetail.mission.project_id,
        site_id: refreshedDetail.mission.site_id,
        mission_id: refreshedDetail.mission.id,
        dataset_id: dataset.id,
        engine: "odm",
        preset_id: "standard-refresh",
        status: "queued",
        stage: "queued",
        progress: 0,
        queue_position: 1,
        input_summary: {
          name: jobName,
          requestedByUserId: refreshedAccess.user.id,
          requestedByEmail: refreshedAccess.user.email,
          source: "mission-detail-action",
        },
        output_summary: {
          eta: "Pending queue pickup",
          notes: "Queued from the mission detail page.",
        },
        external_job_reference: null,
        created_by: refreshedAccess.user.id,
      });

      if (!insertedJob?.id) {
        redirect(`/missions/${missionId}?queued=error`);
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
        event_type: "job.queued",
        payload: {
          title: "Manual processing job queued",
          detail: `Queued from mission detail for dataset ${dataset.name}.`,
        },
      });

      await insertJobEvent({
        org_id: refreshedAccess.org.id,
        job_id: insertedJob.id,
        event_type: "artifact.generated",
        payload: {
          title: "Placeholder outputs staged",
          detail: "Orthomosaic, DSM, point cloud, and report placeholders were created for downstream review/export flows.",
        },
      });
    } catch {
      redirect(`/missions/${missionId}?queued=error`);
    }

    redirect(`/missions/${missionId}?queued=1`);
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

  const latestVersion = detail.versions[0] ?? null;
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
  const calloutState =
    resolvedSearchParams.created
    ?? resolvedSearchParams.attached
    ?? resolvedSearchParams.queued
    ?? resolvedSearchParams.bundled;

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
        </article>

        <aside className="surface stack-sm">
          <div className="stack-xs">
            <p className="eyebrow">Live action</p>
            <h2>Attach data, queue processing, and stage install handoff</h2>
            <p className="muted">
              This mission page now supports the next real v1 loop: attach a dataset, queue a job, and generate install-handoff artifacts for field use.
            </p>
          </div>

          <dl className="kv-grid">
            <div className="kv-row">
              <dt>Datasets attached</dt>
              <dd>{detail.datasets.length}</dd>
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
            <button
              type="submit"
              className="button button-secondary"
              disabled={access.role === "viewer"}
            >
              Attach dataset
            </button>
          </form>

          <form action={queueMissionProcessing}>
            <button
              type="submit"
              className="button button-primary"
              disabled={detail.datasets.length === 0 || access.role === "viewer"}
            >
              Queue processing job
            </button>
          </form>
          {detail.datasets.length === 0 ? (
            <p className="muted">A dataset must exist before a job can be queued.</p>
          ) : null}

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
            <p className="eyebrow">Datasets</p>
            <h2>Mission ingest lane</h2>
          </div>
          <div className="stack-xs">
            {detail.datasets.map((dataset) => (
              <article key={dataset.id} className="ops-list-card">
                <div className="ops-list-card-header">
                  <strong>{dataset.name}</strong>
                  <span className="status-pill status-pill--info">{dataset.status}</span>
                </div>
                <p className="muted">{dataset.kind} · captured {formatDateTime(dataset.captured_at)}</p>
              </article>
            ))}
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
            </div>
          ) : (
            <p className="muted">No mission version exists yet.</p>
          )}
        </article>
      </section>

      <section className="ops-console-grid">
        <article className="surface stack-sm">
          <div className="stack-xs">
            <p className="eyebrow">Jobs</p>
            <h2>Mission processing runs</h2>
          </div>
          <div className="stack-xs">
            {detail.jobs.map((job) => (
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
                <div className="header-actions">
                  <Link href={`/jobs/${job.id}`} className="button button-secondary">
                    View job detail
                  </Link>
                </div>
              </article>
            ))}
            {detail.jobs.length === 0 ? <p className="muted">No processing jobs yet.</p> : null}
          </div>
        </article>

        <article className="surface stack-sm">
          <div className="stack-xs">
            <p className="eyebrow">Outputs + events</p>
            <h2>Artifact trail</h2>
          </div>
          <div className="stack-xs">
            {detail.outputs.map((output) => (
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
                <div className="header-actions">
                  <Link href={`/artifacts/${output.id}`} className="button button-secondary">
                    Review artifact
                  </Link>
                </div>
              </article>
            ))}
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
