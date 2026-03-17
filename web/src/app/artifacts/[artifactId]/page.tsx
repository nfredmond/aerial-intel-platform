import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { BlockedAccessView } from "@/app/dashboard/blocked-access-view";
import { SignOutForm } from "@/app/dashboard/sign-out-form";
import { SupportContextCopyButton } from "@/app/dashboard/support-context-copy-button";
import { getDroneOpsAccess } from "@/lib/auth/drone-ops-access";
import {
  buildArtifactExportPacket,
  buildArtifactShareSummary,
  getArtifactHandoff,
  type ArtifactHandoffStage,
  updateArtifactHandoffMetadata,
} from "@/lib/artifact-handoff";
import {
  getBenchmarkOutputForArtifact,
  getBenchmarkSummaryView,
} from "@/lib/benchmark-summary";
import { getArtifactDetail, getString } from "@/lib/missions/detail-data";
import { insertJobEvent, updateProcessingOutput } from "@/lib/supabase/admin";

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

function handoffClass(stage: ArtifactHandoffStage) {
  switch (stage) {
    case "reviewed":
    case "shared":
    case "exported":
      return "status-pill status-pill--success";
    default:
      return "status-pill status-pill--warning";
  }
}

function getCalloutMessage(action?: string) {
  switch (action) {
    case "reviewed":
      return {
        tone: "success",
        text: "Artifact marked reviewed. The handoff trail now records review timing and the next action.",
      } as const;
    case "shared":
      return {
        tone: "success",
        text: "Artifact marked shared. The handoff trail now records a client/ops share checkpoint.",
      } as const;
    case "exported":
      return {
        tone: "success",
        text: "Artifact marked exported. Final delivery traceability is now recorded on this artifact.",
      } as const;
    case "not-ready":
      return {
        tone: "error",
        text: "Only ready artifacts can be marked reviewed, shared, or exported.",
      } as const;
    case "denied":
      return {
        tone: "error",
        text: "Viewer access cannot update artifact handoff state.",
      } as const;
    case "error":
      return {
        tone: "error",
        text: "Artifact handoff state could not be updated. Check server configuration and try again.",
      } as const;
    default:
      return null;
  }
}

export default async function ArtifactDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ artifactId: string }>;
  searchParams: Promise<{ action?: string }>;
}) {
  const access = await getDroneOpsAccess();

  if (!access.user) {
    redirect("/sign-in");
  }

  if (!access.hasMembership || !access.hasActiveEntitlement) {
    return <BlockedAccessView access={access} />;
  }

  const { artifactId } = await params;
  const resolvedSearchParams = await searchParams;
  const detail = await getArtifactDetail(access, artifactId);

  if (!detail) {
    notFound();
  }

  async function updateArtifactState(targetAction: "reviewed" | "shared" | "exported") {
    "use server";

    const refreshedAccess = await getDroneOpsAccess();
    if (!refreshedAccess.user) {
      redirect("/sign-in");
    }

    if (!refreshedAccess.org?.id || !refreshedAccess.hasMembership || !refreshedAccess.hasActiveEntitlement) {
      redirect("/dashboard");
    }

    if (refreshedAccess.role === "viewer") {
      redirect(`/artifacts/${artifactId}?action=denied`);
    }

    const refreshedDetail = await getArtifactDetail(refreshedAccess, artifactId);
    if (!refreshedDetail) {
      redirect("/missions");
    }

    if (refreshedDetail.output.status !== "ready") {
      redirect(`/artifacts/${artifactId}?action=not-ready`);
    }

    const currentHandoff = getArtifactHandoff(refreshedDetail.metadata);
    const actorEmail = refreshedAccess.user.email ?? null;
    const now = new Date().toISOString();

    const nextMetadata = updateArtifactHandoffMetadata(refreshedDetail.metadata, {
      reviewedAt: currentHandoff.reviewedAt ?? now,
      reviewedByEmail: currentHandoff.reviewedByEmail ?? actorEmail,
      sharedAt: targetAction === "shared" || targetAction === "exported" ? currentHandoff.sharedAt ?? now : undefined,
      sharedByEmail:
        targetAction === "shared" || targetAction === "exported"
          ? currentHandoff.sharedByEmail ?? actorEmail
          : undefined,
      exportedAt: targetAction === "exported" ? currentHandoff.exportedAt ?? now : undefined,
      exportedByEmail: targetAction === "exported" ? currentHandoff.exportedByEmail ?? actorEmail : undefined,
      note:
        targetAction === "exported"
          ? "Final export/delivery checkpoint recorded from artifact detail page."
          : targetAction === "shared"
            ? "Artifact share checkpoint recorded from artifact detail page."
            : "Artifact reviewed from artifact detail page.",
    });

    try {
      await updateProcessingOutput(refreshedDetail.output.id, {
        metadata: nextMetadata,
      });

      await insertJobEvent({
        org_id: refreshedAccess.org.id,
        job_id: refreshedDetail.output.job_id,
        event_type:
          targetAction === "reviewed"
            ? "artifact.reviewed"
            : targetAction === "shared"
              ? "artifact.shared"
              : "artifact.exported",
        payload: {
          title:
            targetAction === "reviewed"
              ? "Artifact reviewed"
              : targetAction === "shared"
                ? "Artifact shared"
                : "Artifact exported",
          detail:
            targetAction === "reviewed"
              ? `${getString(refreshedDetail.metadata.name, refreshedDetail.output.kind.replaceAll("_", " "))} was marked reviewed from the artifact detail page.`
              : targetAction === "shared"
                ? `${getString(refreshedDetail.metadata.name, refreshedDetail.output.kind.replaceAll("_", " "))} was marked shared from the artifact detail page.`
                : `${getString(refreshedDetail.metadata.name, refreshedDetail.output.kind.replaceAll("_", " "))} was marked exported from the artifact detail page.`,
        },
      });
    } catch {
      redirect(`/artifacts/${artifactId}?action=error`);
    }

    redirect(`/artifacts/${artifactId}?action=${targetAction}`);
  }

  const artifactName = getString(detail.metadata.name, detail.output.kind.replaceAll("_", " "));
  const storagePath = detail.output.storage_path ?? "Storage path pending";
  const benchmarkSummary = getBenchmarkSummaryView(detail.outputSummary.benchmarkSummary ?? detail.outputSummary);
  const benchmarkOutput = getBenchmarkOutputForArtifact(benchmarkSummary, detail.output.kind);
  const handoff = getArtifactHandoff(detail.metadata);
  const exportPacket = buildArtifactExportPacket({
    artifactName,
    artifactKind: detail.output.kind,
    artifactStatus: detail.output.status,
    artifactFormat: getString(detail.metadata.format, "Derived artifact"),
    missionName: detail.mission?.name,
    projectName: detail.project?.name,
    datasetName: detail.dataset?.name,
    storagePath,
    deliveryNote: getString(detail.metadata.delivery, "Delivery note pending"),
    handoff,
  });

  const shareSummary = buildArtifactShareSummary({
    artifactName,
    missionName: detail.mission?.name,
    projectName: detail.project?.name,
    status: detail.output.status,
    storagePath,
    handoffStageLabel: handoff.stageLabel,
  });
  const callout = getCalloutMessage(resolvedSearchParams.action);

  return (
    <main className="app-shell stack-md">
      <section className="surface section-header">
        <div className="stack-sm">
          <p className="eyebrow">Artifact detail</p>
          <h1>{artifactName}</h1>
          <p className="muted">
            {detail.project?.name ?? "Project pending"}
            {detail.mission ? ` · ${detail.mission.name}` : ""}
            {detail.job ? ` · ${detail.job.engine}` : ""}
          </p>
        </div>

        <div className="header-actions">
          <Link href={detail.mission ? `/missions/${detail.mission.id}` : "/missions"} className="button button-secondary">
            Back to mission
          </Link>
          {detail.job ? (
            <Link href={`/jobs/${detail.job.id}`} className="button button-secondary">
              View job
            </Link>
          ) : null}
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
            <p className="eyebrow">Artifact summary</p>
            <h2>Review and delivery context</h2>
          </div>

          <dl className="mission-meta-grid">
            <div className="kv-row">
              <dt>Status</dt>
              <dd><span className={statusClass(detail.output.status)}>{detail.output.status}</span></dd>
            </div>
            <div className="kv-row">
              <dt>Kind</dt>
              <dd>{detail.output.kind.replaceAll("_", " ")}</dd>
            </div>
            <div className="kv-row">
              <dt>Format</dt>
              <dd>{getString(detail.metadata.format, "Derived artifact")}</dd>
            </div>
            <div className="kv-row">
              <dt>Delivery</dt>
              <dd>{getString(detail.metadata.delivery, "Delivery note pending")}</dd>
            </div>
            <div className="kv-row">
              <dt>Handoff stage</dt>
              <dd><span className={handoffClass(handoff.stage)}>{handoff.stageLabel}</span></dd>
            </div>
            <div className="kv-row">
              <dt>Bucket</dt>
              <dd>{detail.output.storage_bucket ?? "Storage bucket pending"}</dd>
            </div>
            <div className="kv-row mission-meta-grid__wide">
              <dt>Storage path</dt>
              <dd>{storagePath}</dd>
            </div>
            <div className="kv-row">
              <dt>Created</dt>
              <dd>{formatDateTime(detail.output.created_at)}</dd>
            </div>
            <div className="kv-row">
              <dt>Updated</dt>
              <dd>{formatDateTime(detail.output.updated_at)}</dd>
            </div>
          </dl>
        </article>

        <aside className="surface stack-sm">
          <div className="stack-xs">
            <p className="eyebrow">Handoff controls</p>
            <h2>Record review, share, and export</h2>
            <p className="muted">
              This extends the v1 artifact surface from copy-only summaries into a real handoff audit trail while signed URLs and client portal delivery are still pending.
            </p>
          </div>

          <dl className="kv-grid">
            <div className="kv-row">
              <dt>Current stage</dt>
              <dd>{handoff.stageLabel}</dd>
            </div>
            <div className="kv-row">
              <dt>Reviewed</dt>
              <dd>{handoff.reviewedAt ? formatDateTime(handoff.reviewedAt) : "Not recorded"}</dd>
            </div>
            <div className="kv-row">
              <dt>Shared</dt>
              <dd>{handoff.sharedAt ? formatDateTime(handoff.sharedAt) : "Not recorded"}</dd>
            </div>
            <div className="kv-row">
              <dt>Exported</dt>
              <dd>{handoff.exportedAt ? formatDateTime(handoff.exportedAt) : "Not recorded"}</dd>
            </div>
            <div className="kv-row mission-meta-grid__wide">
              <dt>Next action</dt>
              <dd>{handoff.nextAction}</dd>
            </div>
          </dl>

          <div className="stack-xs surface-form-shell">
            <h3>Update handoff state</h3>
            <form action={updateArtifactState.bind(null, "reviewed")}>
              <button type="submit" className="button button-secondary" disabled={access.role === "viewer" || detail.output.status !== "ready"}>
                Mark reviewed
              </button>
            </form>
            <form action={updateArtifactState.bind(null, "shared")}>
              <button type="submit" className="button button-secondary" disabled={access.role === "viewer" || detail.output.status !== "ready"}>
                Mark shared
              </button>
            </form>
            <form action={updateArtifactState.bind(null, "exported")}>
              <button type="submit" className="button button-secondary" disabled={access.role === "viewer" || detail.output.status !== "ready"}>
                Mark exported
              </button>
            </form>
            {detail.output.status !== "ready" ? (
              <p className="muted">Artifact handoff actions unlock once the artifact itself is ready.</p>
            ) : null}
          </div>

          <div className="stack-sm">
            <SupportContextCopyButton
              text={shareSummary}
              buttonLabel="Copy share summary"
              successMessage="Share summary copied. Paste it into chat, email, or a client handoff note."
              fallbackAriaLabel="Share summary text"
              fallbackHintMessage="Press Ctrl/Cmd+C, then paste this share summary into chat, docs, or email."
            />
            <SupportContextCopyButton
              text={exportPacket}
              buttonLabel="Copy export packet"
              successMessage="Export packet copied. Paste it into an ops note, ticket, or delivery checklist."
              fallbackAriaLabel="Export packet text"
              fallbackHintMessage="Press Ctrl/Cmd+C, then paste this export packet into docs, tickets, or a delivery note."
            />
          </div>
        </aside>
      </section>

      <section className="grid-cards">
        <article className="surface stack-sm info-card">
          <div className="stack-xs">
            <p className="eyebrow">Source context</p>
            <h2>Mission and dataset linkage</h2>
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
              <dt>Job stage</dt>
              <dd>{detail.job?.stage ?? "No job linked"}</dd>
            </div>
            <div className="kv-row">
              <dt>ETA</dt>
              <dd>{getString(detail.outputSummary.eta, "Pending")}</dd>
            </div>
          </dl>
        </article>

        <article className="surface stack-sm info-card">
          <div className="stack-xs">
            <p className="eyebrow">Job notes</p>
            <h2>Current processing context</h2>
          </div>
          <p className="muted">{getString(detail.outputSummary.notes, "No job notes recorded yet.")}</p>
          <p className="muted">{handoff.note ?? "No artifact-specific handoff note recorded yet."}</p>
        </article>
      </section>

      {benchmarkSummary ? (
        <section className="surface stack-sm">
          <div className="stack-xs">
            <p className="eyebrow">Benchmark linkage</p>
            <h2>Evidence from imported ODM benchmark</h2>
            <p className="muted">
              This artifact is linked to benchmark evidence when available, so reviewers can see whether the source run actually emitted a real file and what QA posture it had.
            </p>
          </div>

          <div className="grid-cards">
            <article className="surface-form-shell stack-sm">
              <dl className="mission-meta-grid">
                <div className="kv-row">
                  <dt>Benchmark project</dt>
                  <dd>{benchmarkSummary.projectName}</dd>
                </div>
                <div className="kv-row">
                  <dt>Run status</dt>
                  <dd>
                    <span className={statusClass(benchmarkSummary.status)}>{benchmarkSummary.status}</span>
                  </dd>
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
                  <dt>Duration</dt>
                  <dd>{benchmarkSummary.durationSeconds} sec</dd>
                </div>
                <div className="kv-row mission-meta-grid__wide">
                  <dt>Run log</dt>
                  <dd>{benchmarkSummary.runLog}</dd>
                </div>
              </dl>
            </article>

            <article className="surface-form-shell stack-sm">
              <div className="stack-xs">
                <h3>Artifact-specific benchmark output</h3>
              </div>
              {benchmarkOutput ? (
                <dl className="kv-grid">
                  <div className="kv-row">
                    <dt>Mapped output</dt>
                    <dd>{benchmarkOutput.key.replaceAll("_", " ")}</dd>
                  </div>
                  <div className="kv-row">
                    <dt>Exists</dt>
                    <dd>{benchmarkOutput.exists ? "Yes" : "No"}</dd>
                  </div>
                  <div className="kv-row">
                    <dt>Non-zero size</dt>
                    <dd>{benchmarkOutput.nonZeroSize ? "Yes" : "No"}</dd>
                  </div>
                  <div className="kv-row">
                    <dt>Size</dt>
                    <dd>{benchmarkOutput.sizeBytes} bytes</dd>
                  </div>
                  <div className="kv-row">
                    <dt>Benchmark path</dt>
                    <dd>{benchmarkOutput.path}</dd>
                  </div>
                </dl>
              ) : (
                <p className="muted">This artifact kind does not map directly to a benchmark output file.</p>
              )}
            </article>
          </div>
        </section>
      ) : null}

      <section className="surface stack-sm">
        <div className="stack-xs">
          <p className="eyebrow">Artifact timeline</p>
          <h2>Recent events</h2>
        </div>
        <div className="stack-xs">
          {detail.events.slice(0, 8).map((event) => {
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
