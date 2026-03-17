import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { BlockedAccessView } from "@/app/dashboard/blocked-access-view";
import { SignOutForm } from "@/app/dashboard/sign-out-form";
import { SupportContextCopyButton } from "@/app/dashboard/support-context-copy-button";
import { GeometryJsonField } from "@/components/geometry-json-field";
import { GeometryPreviewCard } from "@/components/geometry-preview-card";
import { getDroneOpsAccess } from "@/lib/auth/drone-ops-access";
import { formatGeoJsonSurface, parseGeoJsonSurface } from "@/lib/geojson";
import { buildDatasetGisBrief } from "@/lib/gis-briefs";
import { getCoverageComparisonInsight, getDatasetCoverageInsight } from "@/lib/geometry-insights";
import { getDatasetSpatialInsight } from "@/lib/gis-insights";
import { getDatasetDetail } from "@/lib/missions/detail-data";
import { updateDataset } from "@/lib/supabase/admin";
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

function getCalloutMessage(input: { reviewed?: string; geometry?: string }) {
  if (input.reviewed) {
    if (input.reviewed === "1") {
      return {
        tone: "success",
        text: "Dataset preflight marked reviewed and promoted to ready.",
      } as const;
    }

    if (input.reviewed === "denied") {
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

  if (input.geometry) {
    if (input.geometry === "1") {
      return {
        tone: "success",
        text: "Dataset footprint geometry saved. Coverage comparison and footprint intelligence now use the attached GeoJSON shape.",
      } as const;
    }

    if (input.geometry === "denied") {
      return {
        tone: "error",
        text: "Viewer access cannot update dataset footprint geometry.",
      } as const;
    }

    if (input.geometry === "invalid") {
      return {
        tone: "error",
        text: "Geometry must be valid GeoJSON Polygon or MultiPolygon JSON.",
      } as const;
    }

    return {
      tone: "error",
      text: "The dataset footprint geometry could not be updated.",
    } as const;
  }

  return null;
}

export default async function DatasetDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ datasetId: string }>;
  searchParams: Promise<{ reviewed?: string; geometry?: string }>;
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

  async function attachDatasetGeometry(formData: FormData) {
    "use server";

    const refreshedAccess = await getDroneOpsAccess();
    if (!refreshedAccess.user) {
      redirect("/sign-in");
    }

    if (!refreshedAccess.org?.id || !refreshedAccess.hasMembership || !refreshedAccess.hasActiveEntitlement) {
      redirect("/dashboard");
    }

    if (refreshedAccess.role === "viewer") {
      redirect(`/datasets/${datasetId}?geometry=denied`);
    }

    const refreshedDetail = await getDatasetDetail(refreshedAccess, datasetId);
    if (!refreshedDetail) {
      redirect("/missions");
    }

    const geometryValue = formData.get("geometryJson");
    const geometryText = typeof geometryValue === "string" ? geometryValue.trim() : "";

    try {
      const geometry = parseGeoJsonSurface(geometryText);
      await updateDataset(refreshedDetail.dataset.id, {
        spatial_footprint: geometry,
      });
    } catch (error) {
      if (error instanceof SyntaxError || error instanceof Error) {
        redirect(`/datasets/${datasetId}?geometry=invalid`);
      }
      redirect(`/datasets/${datasetId}?geometry=error`);
    }

    redirect(`/datasets/${datasetId}?geometry=1`);
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
  const datasetGisBrief = buildDatasetGisBrief({
    datasetName: detail.dataset.name,
    projectName: detail.project?.name ?? "Project pending",
    missionName: detail.mission?.name ?? "Mission pending",
    datasetKind: detail.dataset.kind,
    status: detail.dataset.status,
    imageCount: typeof metadata.imageCount === "number" ? metadata.imageCount : 0,
    overlapFront: typeof preflight.overlapFront === "number" ? preflight.overlapFront : undefined,
    overlapSide: typeof preflight.overlapSide === "number" ? preflight.overlapSide : undefined,
    gcpCaptured: preflight.gcpCaptured === true,
    insight: datasetSpatialInsight,
  });
  const datasetGeometry = (detail.dataset.spatial_footprint as Json | null) ?? null;
  const missionGeometry = (detail.mission?.planning_geometry as Json | null | undefined) ?? null;
  const datasetCoverageInsight = getDatasetCoverageInsight({
    geometry: datasetGeometry,
    status: detail.dataset.status,
  });
  const coverageComparisonInsight = getCoverageComparisonInsight({
    missionGeometry,
    datasetGeometry,
  });
  const geometryJson = formatGeoJsonSurface(datasetGeometry);
  const callout = getCalloutMessage({ reviewed: resolvedSearchParams.reviewed, geometry: resolvedSearchParams.geometry });

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

          <form action={attachDatasetGeometry} className="stack-sm surface-form-shell">
            <div className="stack-xs">
              <h3>Attach footprint geometry</h3>
              <p className="muted">Paste GeoJSON Polygon or MultiPolygon to power coverage and footprint analytics.</p>
            </div>
            <GeometryJsonField
              name="geometryJson"
              label="GeoJSON"
              mode="dataset"
              defaultValue={geometryJson}
              placeholder='{"type":"Polygon","coordinates":[...]}'
            />
            <button type="submit" className="button button-secondary" disabled={access.role === "viewer"}>
              Save footprint geometry
            </button>
          </form>
        </aside>
      </section>

      <section className="grid-cards">
        <GeometryPreviewCard
          title="Mission AOI and dataset footprint"
          subtitle="Quick visual preview of the current dataset footprint against the mission AOI when both geometries are attached."
          missionGeometry={missionGeometry}
          datasetGeometry={datasetGeometry}
        />

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
            <p className="eyebrow">Coverage geometry</p>
            <h2>Footprint posture</h2>
          </div>
          <div className="ops-list-card-header">
            <p className="muted">{datasetCoverageInsight.summary}</p>
            <span className={datasetCoverageInsight.hasGeometry ? "status-pill status-pill--success" : "status-pill status-pill--warning"}>
              {datasetCoverageInsight.hasGeometry ? "Footprint attached" : "Footprint missing"}
            </span>
          </div>
          <dl className="kv-grid">
            <div className="kv-row">
              <dt>Coverage area</dt>
              <dd>{datasetCoverageInsight.areaAcres ? `${datasetCoverageInsight.areaAcres} acres` : "Unknown"}</dd>
            </div>
            <div className="kv-row">
              <dt>Extent</dt>
              <dd>{datasetCoverageInsight.bboxLabel}</dd>
            </div>
            <div className="kv-row">
              <dt>Shape class</dt>
              <dd>{datasetCoverageInsight.shapeClass}</dd>
            </div>
          </dl>
          <ul className="action-list mission-blocker-list">
            {datasetCoverageInsight.recommendations.map((item) => <li key={item}>{item}</li>)}
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
          <SupportContextCopyButton
            text={datasetGisBrief}
            buttonLabel="Copy GIS copilot brief"
            successMessage="Dataset GIS copilot brief copied. Paste it into notes, Slack, or QA docs."
            fallbackAriaLabel="Dataset GIS copilot brief"
            fallbackHintMessage="Press Ctrl/Cmd+C, then paste this GIS brief into docs, chat, or a review checklist."
          />
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
