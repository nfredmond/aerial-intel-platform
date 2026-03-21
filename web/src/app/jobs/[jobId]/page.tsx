import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { BlockedAccessView } from "@/app/dashboard/blocked-access-view";
import { SignOutForm } from "@/app/dashboard/sign-out-form";
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
import { getJobDetail, getString } from "@/lib/missions/detail-data";
import {
  advanceManualProvingJob,
  isManualProvingJobDetail,
} from "@/lib/proving-runs";
import {
  insertJobEvent,
  insertProcessingJob,
  updateProcessingJob,
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
      text: "This job is not marked as a manual proving run, so the proving controls are unavailable.",
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
      const clonedInputSummary = {
        ...refreshedDetail.inputSummary,
        name: `${getString(refreshedDetail.inputSummary.name, `${refreshedDetail.job.engine.toUpperCase()} job`)} retry`,
        retryOfJobId: refreshedDetail.job.id,
      };

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
        input_summary: clonedInputSummary,
        output_summary: {
          eta: "Pending queue pickup",
          notes: `Retry requested from job ${refreshedDetail.job.id}.`,
          runLogPath: refreshedDetail.outputSummary.runLogPath,
        },
        external_job_reference: null,
        created_by: refreshedAccess.user.id,
      });

      if (!insertedJob?.id) {
        redirect(`/jobs/${jobId}?action=error`);
      }

      await insertJobEvent({
        org_id: refreshedAccess.org.id,
        job_id: insertedJob.id,
        event_type: "job.retried",
        payload: {
          title: "Retry job queued",
          detail: `Retry requested from job ${refreshedDetail.job.id}.`,
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

  const benchmarkSummary = getBenchmarkSummaryView(detail.outputSummary.benchmarkSummary ?? detail.outputSummary);
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
              <h3>Manual proving controls</h3>
              <p className="muted">
                Use these only for the live v1 proving lane while the full asynchronous worker backend is still under construction.
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

          {provingJob ? (
            <div className="stack-xs surface-form-shell">
              <h3>Live proving next step</h3>
              {detail.job.status === "queued" ? (
                <>
                  <p className="muted">This proving job is queued. Start it to move the live run into active processing.</p>
                  <form action={startProvingJob}>
                    <button
                      type="submit"
                      className="button button-primary"
                      disabled={access.role === "viewer"}
                    >
                      Start proving job now
                    </button>
                  </form>
                </>
              ) : detail.job.status === "running" ? (
                <>
                  <p className="muted">This proving job is running. Complete it once you want ready artifacts for the delivery lane.</p>
                  <form action={completeProvingJob}>
                    <button
                      type="submit"
                      className="button button-primary"
                      disabled={access.role === "viewer"}
                    >
                      Complete proving job now
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
          <p className="eyebrow">Run logs</p>
          <h2>Execution log tail</h2>
          <p className="muted">
            This surfaces imported log context when available so operators can inspect recent run output without leaving the app.
          </p>
        </div>
        <dl className="kv-grid">
          <div className="kv-row">
            <dt>Log path</dt>
            <dd>{getString(detail.outputSummary.runLogPath, benchmarkSummary?.runLog ?? "No log path recorded")}</dd>
          </div>
        </dl>
        {logTail.length > 0 ? (
          <pre className="log-panel">{logTail.join("\n")}</pre>
        ) : (
          <p className="muted">No log tail has been imported for this job yet.</p>
        )}
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
