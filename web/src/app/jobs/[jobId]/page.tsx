import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { BlockedAccessView } from "@/app/dashboard/blocked-access-view";
import { SignOutForm } from "@/app/dashboard/sign-out-form";
import { getDroneOpsAccess } from "@/lib/auth/drone-ops-access";
import { getJobDetail, getString } from "@/lib/missions/detail-data";

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

export default async function JobDetailPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const access = await getDroneOpsAccess();

  if (!access.user) {
    redirect("/sign-in");
  }

  if (!access.hasMembership || !access.hasActiveEntitlement) {
    return <BlockedAccessView access={access} />;
  }

  const { jobId } = await params;
  const detail = await getJobDetail(access, jobId);

  if (!detail) {
    notFound();
  }

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
        </aside>
      </section>

      <section className="grid-cards">
        <article className="surface stack-sm info-card">
          <div className="stack-xs">
            <p className="eyebrow">Outputs</p>
            <h2>Artifact readiness</h2>
          </div>
          <div className="stack-xs">
            {detail.outputs.map((output) => (
              <article key={output.id} className="ops-list-card">
                <div className="ops-list-card-header">
                  <strong>{output.kind.replaceAll("_", " ")}</strong>
                  <span className={statusClass(output.status)}>{output.status}</span>
                </div>
                <p className="muted">{output.storage_path ?? "Storage path pending"}</p>
              </article>
            ))}
          </div>
        </article>

        <article className="surface stack-sm info-card">
          <div className="stack-xs">
            <p className="eyebrow">Output notes</p>
            <h2>Current summary</h2>
          </div>
          <p className="muted">{getString(detail.outputSummary.notes, "No job notes recorded yet.")}</p>
        </article>
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
