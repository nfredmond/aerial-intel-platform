import Link from "next/link";

import type { DroneOpsAccessResult } from "@/lib/auth/drone-ops-access";
import {
  buildMissionWorkspaceSnapshot,
  formatMissionOutputStatus,
  formatMissionStage,
} from "@/lib/missions/workspace";

import { SignOutForm } from "@/app/dashboard/sign-out-form";

type MissionWorkspaceProps = {
  access: DroneOpsAccessResult;
};

function formatCaptureDate(value: string) {
  const timestamp = new Date(value);

  if (Number.isNaN(timestamp.getTime())) {
    return "TBD";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
  }).format(timestamp);
}

function formatWholeNumber(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(value);
}

function formatOneDecimal(value: number) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value);
}

function getStagePillClassName(stage: string) {
  switch (stage) {
    case "ready-for-qa":
      return "status-pill status-pill--success";
    case "processing":
      return "status-pill status-pill--info";
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

export function MissionWorkspace({ access }: MissionWorkspaceProps) {
  const snapshot = buildMissionWorkspaceSnapshot({
    orgName: access.org?.name,
    tierId: access.entitlement?.tier_id,
    role: access.role,
  });

  return (
    <main className="app-shell stack-md">
      <section className="surface section-header">
        <div className="stack-sm">
          <p className="eyebrow">DroneOps Workspace</p>
          <h1>{snapshot.workspaceLabel}</h1>
          <p className="muted">
            Entitlement-active route for mission planning, processing visibility,
            and QA triage. This is the first real workflow surface beyond sign-in.
          </p>
        </div>

        <div className="header-actions">
          <span className="status-pill status-pill--success">
            {snapshot.entitlementLabel} access active
          </span>
          <Link href="/dashboard" className="button button-secondary">
            Back to dashboard
          </Link>
          <SignOutForm label="Sign out" variant="secondary" />
        </div>
      </section>

      <section className="stats-grid">
        <article className="surface stat-card stack-xs">
          <span className="eyebrow">Active missions</span>
          <strong className="stat-value">{formatWholeNumber(snapshot.totals.missionCount)}</strong>
          <p className="muted">Current field or processing lanes inside the workspace.</p>
        </article>

        <article className="surface stat-card stack-xs">
          <span className="eyebrow">Mapped area</span>
          <strong className="stat-value">{formatWholeNumber(snapshot.totals.totalAcres)} acres</strong>
          <p className="muted">Combined AOI coverage across the current mission set.</p>
        </article>

        <article className="surface stat-card stack-xs">
          <span className="eyebrow">Outputs ready</span>
          <strong className="stat-value">{formatWholeNumber(snapshot.totals.readyOutputCount)}</strong>
          <p className="muted">
            Deliverables already generated and ready for QA or packaging.
          </p>
        </article>

        <article className="surface stat-card stack-xs">
          <span className="eyebrow">Attention required</span>
          <strong className="stat-value">
            {formatWholeNumber(snapshot.totals.missionsNeedingAttention)} missions
          </strong>
          <p className="muted">
            Missions with blockers, pending processing, or capture planning still open.
          </p>
        </article>
      </section>

      <section className="grid-cards">
        <article className="surface info-card stack-sm">
          <h2>Queue health</h2>
          <dl className="kv-grid">
            <div className="kv-row">
              <dt>Outputs in progress</dt>
              <dd>{formatWholeNumber(snapshot.totals.outputsInProgressCount)}</dd>
            </div>
            <div className="kv-row">
              <dt>Outputs missing</dt>
              <dd>{formatWholeNumber(snapshot.totals.outputsMissingCount)}</dd>
            </div>
            <div className="kv-row">
              <dt>Signed-in role</dt>
              <dd>{access.role ?? "Unknown"}</dd>
            </div>
            <div className="kv-row">
              <dt>Organization</dt>
              <dd>{access.org?.name ?? "Unknown"}</dd>
            </div>
          </dl>
        </article>

        <article className="surface info-card stack-sm">
          <h2>Recommended next actions</h2>
          <ol className="stack-xs action-list">
            {snapshot.nextActions.map((action) => (
              <li key={action}>{action}</li>
            ))}
          </ol>
        </article>
      </section>

      <section className="stack-sm">
        <div className="stack-xs">
          <p className="eyebrow">Mission pipeline</p>
          <h2>Field-to-delivery visibility</h2>
          <p className="muted">
            Each mission card is structured around the workflows Nathaniel will need next:
            AOI context, capture status, processing profile, and output readiness.
          </p>
        </div>

        <div className="mission-grid">
          {snapshot.missions.map((mission) => (
            <article key={mission.id} className="surface mission-card stack-sm">
              <div className="mission-card-header">
                <div className="stack-xs">
                  <p className="eyebrow">{mission.siteName}</p>
                  <h3>{mission.name}</h3>
                </div>
                <span className={getStagePillClassName(mission.stage)}>
                  {formatMissionStage(mission.stage)}
                </span>
              </div>

              <dl className="mission-meta-grid">
                <div className="kv-row">
                  <dt>Capture date</dt>
                  <dd>{formatCaptureDate(mission.captureDate)}</dd>
                </div>
                <div className="kv-row">
                  <dt>AOI size</dt>
                  <dd>{formatWholeNumber(mission.areaAcres)} acres</dd>
                </div>
                <div className="kv-row">
                  <dt>Images</dt>
                  <dd>{formatWholeNumber(mission.imageCount)}</dd>
                </div>
                <div className="kv-row">
                  <dt>Target GSD</dt>
                  <dd>{formatOneDecimal(mission.gsdCm)} cm</dd>
                </div>
                <div className="kv-row mission-meta-grid__wide">
                  <dt>Coordinate system</dt>
                  <dd>{mission.coordinateSystem}</dd>
                </div>
                <div className="kv-row mission-meta-grid__wide">
                  <dt>Processing profile</dt>
                  <dd>{mission.processingProfile}</dd>
                </div>
              </dl>

              <div className="stack-xs">
                <h3>Output status</h3>
                <div className="output-pill-grid">
                  {mission.outputs.map((output) => (
                    <div key={`${mission.id}-${output.key}`} className="output-pill-card">
                      <div className="stack-xs">
                        <strong>{output.label}</strong>
                        <span className="muted">{output.format}</span>
                      </div>
                      <span className={getOutputPillClassName(output.status)}>
                        {formatMissionOutputStatus(output.status)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="stack-xs">
                <h3>Current blocker</h3>
                <ul className="stack-xs action-list mission-blocker-list">
                  {mission.blockers.map((blocker) => (
                    <li key={blocker}>{blocker}</li>
                  ))}
                </ul>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
