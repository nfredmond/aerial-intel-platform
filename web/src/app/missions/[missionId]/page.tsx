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
import { formatJobStatus, formatOutputArtifactStatus } from "@/lib/missions/workspace";
import { insertJobEvent, insertProcessingJob } from "@/lib/supabase/admin";

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

export default async function MissionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ missionId: string }>;
  searchParams: Promise<{ queued?: string }>;
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

      await insertJobEvent({
        org_id: refreshedAccess.org.id,
        job_id: insertedJob.id,
        event_type: "job.queued",
        payload: {
          title: "Manual processing job queued",
          detail: `Queued from mission detail for dataset ${dataset.name}.`,
        },
      });
    } catch {
      redirect(`/missions/${missionId}?queued=error`);
    }

    redirect(`/missions/${missionId}?queued=1`);
  }

  const blockers = getStringArray(detail.summary.blockers);
  const warnings = getStringArray(detail.summary.warnings);

  return (
    <main className="app-shell stack-md">
      <section className="surface section-header">
        <div className="stack-sm">
          <p className="eyebrow">Mission detail</p>
          <h1>{detail.mission.name}</h1>
          <p className="muted">
            {detail.project?.name ?? "Project pending"} · {detail.site?.name ?? "Site pending"} ·
            {" "}
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

      {resolvedSearchParams.queued ? (
        <section
          className={
            resolvedSearchParams.queued === "1"
              ? "callout callout-warning"
              : "callout callout-error"
          }
        >
          {resolvedSearchParams.queued === "1"
            ? "Processing job queued. Refreshes should now appear in the live job lane for this mission."
            : resolvedSearchParams.queued === "missing-dataset"
              ? "This mission does not have a dataset yet, so a processing job could not be queued."
              : resolvedSearchParams.queued === "denied"
                ? "Viewer access cannot queue processing jobs."
                : "The processing job could not be queued. Check server configuration and try again."}
        </section>
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
            <h2>Queue a processing refresh</h2>
            <p className="muted">
              This uses the real aerial-ops tables and writes a queued job + event through a server-side action.
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
          </div>
        </article>

        <article className="surface stack-sm">
          <div className="stack-xs">
            <p className="eyebrow">Outputs + events</p>
            <h2>Artifact trail</h2>
          </div>
          <div className="stack-xs">
            {detail.outputs.map((output) => (
              <article key={output.id} className="ops-list-card">
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
