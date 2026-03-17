import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { BlockedAccessView } from "@/app/dashboard/blocked-access-view";
import { SignOutForm } from "@/app/dashboard/sign-out-form";
import { getDroneOpsAccess } from "@/lib/auth/drone-ops-access";
import { getDatasetSpatialInsight } from "@/lib/gis-insights";
import { getDatasetDetail } from "@/lib/missions/detail-data";
import { updateDataset } from "@/lib/supabase/admin";

function formatDateTime(value: string | null) {
  if (!value) return "TBD";
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) return "TBD";

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(timestamp);
}

function getStatusClassName(status: string) {
  switch (status) {
    case "ready":
      return "status-pill status-pill--success";
    case "preflight_flagged":
      return "status-pill status-pill--warning";
    default:
      return "status-pill status-pill--info";
  }
}

function getCalloutMessage(reviewed?: string) {
  if (!reviewed) return null;

  if (reviewed === "1") {
    return {
      tone: "success",
      text: "Dataset preflight marked reviewed and promoted to ready.",
    } as const;
  }

  if (reviewed === "denied") {
    return {
      tone: "error",
      text: "Viewer access cannot update dataset preflight status.",
    } as const;
  }

  return {
    tone: "error",
    text: "The dataset preflight status could not be updated.",
  } as const;
}

export default async function DatasetDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ datasetId: string }>;
  searchParams: Promise<{ reviewed?: string }>;
}) {
  const access = await getDroneOpsAccess();

  if (!access.user) {
    redirect("/sign-in");
  }

  if (!access.hasMembership || !access.hasActiveEntitlement) {
    return <BlockedAccessView access={access} />;
  }

  const { datasetId } = await params;
  const detail = await getDatasetDetail(access, datasetId);
  const resolvedSearchParams = await searchParams;

  if (!detail) {
    notFound();
  }

  async function markDatasetReviewed() {
    "use server";

    const refreshedAccess = await getDroneOpsAccess();
    if (!refreshedAccess.user) {
      redirect("/sign-in");
    }

    if (!refreshedAccess.org?.id || !refreshedAccess.hasMembership || !refreshedAccess.hasActiveEntitlement) {
      redirect("/dashboard");
    }

    if (refreshedAccess.role === "viewer") {
      redirect(`/datasets/${datasetId}?reviewed=denied`);
    }

    const refreshedDetail = await getDatasetDetail(refreshedAccess, datasetId);
    if (!refreshedDetail) {
      redirect("/missions");
    }

    const metadata = (refreshedDetail.dataset.metadata as Record<string, unknown> | null) ?? {};
    const preflight = (metadata.preflight as Record<string, unknown> | null) ?? {};

    try {
      await updateDataset(refreshedDetail.dataset.id, {
        status: "ready",
        metadata: {
          ...metadata,
          preflight: {
            ...preflight,
            reviewed: true,
            reviewedAt: new Date().toISOString(),
            findings: Array.isArray(preflight.findings)
              ? preflight.findings.filter((value): value is string => typeof value === "string")
              : ["Preflight review completed manually."],
          },
        },
      });
    } catch {
      redirect(`/datasets/${datasetId}?reviewed=error`);
    }

    redirect(`/datasets/${datasetId}?reviewed=1`);
  }

  const metadata = (detail.dataset.metadata as Record<string, unknown> | null) ?? {};
  const preflight = (metadata.preflight as Record<string, unknown> | null) ?? {};
  const findings = Array.isArray(preflight.findings)
    ? preflight.findings.filter((value): value is string => typeof value === "string")
    : [];
  const datasetSpatialInsight = getDatasetSpatialInsight({
    datasetKind: detail.dataset.kind,
    status: detail.dataset.status,
    imageCount: typeof metadata.imageCount === "number" ? metadata.imageCount : 0,
    overlapFront: typeof preflight.overlapFront === "number" ? preflight.overlapFront : undefined,
    overlapSide: typeof preflight.overlapSide === "number" ? preflight.overlapSide : undefined,
    gcpCaptured: preflight.gcpCaptured === true,
    reviewed: preflight.reviewed === true,
    findings,
  });
  const callout = getCalloutMessage(resolvedSearchParams.reviewed);

  return (
    <main className="app-shell stack-md">
      <section className="surface section-header">
        <div className="stack-sm">
          <p className="eyebrow">Dataset detail</p>
          <h1>{detail.dataset.name}</h1>
          <p className="muted">
            {detail.project?.name ?? "Project pending"}
            {detail.mission ? ` · ${detail.mission.name}` : ""}
          </p>
        </div>

        <div className="header-actions">
          <Link href={detail.mission ? `/missions/${detail.mission.id}` : "/missions"} className="button button-secondary">
            Back to mission
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
            <p className="eyebrow">Capture summary</p>
            <h2>Dataset preflight posture</h2>
          </div>

          <dl className="mission-meta-grid">
            <div className="kv-row">
              <dt>Status</dt>
              <dd><span className={getStatusClassName(detail.dataset.status)}>{detail.dataset.status}</span></dd>
            </div>
            <div className="kv-row">
              <dt>Kind</dt>
              <dd>{detail.dataset.kind}</dd>
            </div>
            <div className="kv-row">
              <dt>Captured</dt>
              <dd>{formatDateTime(detail.dataset.captured_at)}</dd>
            </div>
            <div className="kv-row">
              <dt>Image count</dt>
              <dd>{typeof metadata.imageCount === "number" ? metadata.imageCount : 0}</dd>
            </div>
            <div className="kv-row">
              <dt>Front overlap</dt>
              <dd>{typeof preflight.overlapFront === "number" ? `${preflight.overlapFront}%` : "Unknown"}</dd>
            </div>
            <div className="kv-row">
              <dt>Side overlap</dt>
              <dd>{typeof preflight.overlapSide === "number" ? `${preflight.overlapSide}%` : "Unknown"}</dd>
            </div>
            <div className="kv-row">
              <dt>GCP captured</dt>
              <dd>{preflight.gcpCaptured === true ? "Yes" : "No"}</dd>
            </div>
            <div className="kv-row">
              <dt>Reviewed</dt>
              <dd>{preflight.reviewed === true ? "Yes" : "No"}</dd>
            </div>
          </dl>
        </article>

        <aside className="surface stack-sm">
          <div className="stack-xs">
            <p className="eyebrow">Reviewer action</p>
            <h2>Approve preflight</h2>
            <p className="muted">
              Use this when the capture set has been reviewed and is safe to advance into the processing queue.
            </p>
          </div>

          <form action={markDatasetReviewed}>
            <button
              type="submit"
              className="button button-primary"
              disabled={detail.dataset.status === "ready" || access.role === "viewer"}
            >
              Mark preflight reviewed
            </button>
          </form>
          {detail.dataset.status === "ready" ? (
            <p className="muted">This dataset is already marked ready.</p>
          ) : null}
        </aside>
      </section>

      <section className="grid-cards">
        <article className="surface stack-sm info-card">
          <div className="stack-xs">
            <p className="eyebrow">Preflight findings</p>
            <h2>Capture review notes</h2>
          </div>
          <ul className="action-list mission-blocker-list">
            {findings.length > 0 ? findings.map((item) => <li key={item}>{item}</li>) : <li>No preflight findings recorded.</li>}
          </ul>
        </article>

        <article className="surface stack-sm info-card">
          <div className="stack-xs">
            <p className="eyebrow">GIS spatial intelligence</p>
            <h2>Dataset readiness insight</h2>
          </div>
          <div className="ops-list-card-header">
            <p className="muted">{datasetSpatialInsight.summary}</p>
            <span className={datasetSpatialInsight.riskLevel === "low" ? "status-pill status-pill--success" : datasetSpatialInsight.riskLevel === "moderate" ? "status-pill status-pill--info" : "status-pill status-pill--warning"}>
              Score {datasetSpatialInsight.score}
            </span>
          </div>
          <ul className="action-list mission-blocker-list">
            {datasetSpatialInsight.recommendations.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </article>

        <article className="surface stack-sm info-card">
          <div className="stack-xs">
            <p className="eyebrow">Downstream linkage</p>
            <h2>Jobs and outputs</h2>
          </div>
          <dl className="kv-grid">
            <div className="kv-row">
              <dt>Jobs</dt>
              <dd>{detail.jobs.length}</dd>
            </div>
            <div className="kv-row">
              <dt>Outputs</dt>
              <dd>{detail.outputs.length}</dd>
            </div>
            <div className="kv-row">
              <dt>Latest event</dt>
              <dd>{detail.events[0] ? detail.events[0].event_type : "None"}</dd>
            </div>
          </dl>
        </article>
      </section>
    </main>
  );
}
