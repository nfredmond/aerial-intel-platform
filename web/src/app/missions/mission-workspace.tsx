import Link from "next/link";

import type { MissionWorkspaceSnapshot } from "@/lib/missions/workspace";
import {
  formatDatasetStatus,
  formatJobStatus,
  formatMissionOutputStatus,
  formatMissionStage,
  formatOutputArtifactStatus,
} from "@/lib/missions/workspace";

import { SignOutForm } from "@/app/dashboard/sign-out-form";

type MissionWorkspaceProps = {
  snapshot: MissionWorkspaceSnapshot;
  source: "database" | "fallback";
};

function formatDateTime(value: string) {
  const timestamp = new Date(value);

  if (Number.isNaN(timestamp.getTime())) {
    return "TBD";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(timestamp);
}

function formatDate(value: string) {
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

function getToneClassName(tone: "success" | "info" | "warning") {
  switch (tone) {
    case "success":
      return "status-pill status-pill--success";
    case "info":
      return "status-pill status-pill--info";
    default:
      return "status-pill status-pill--warning";
  }
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

function getDatasetPillClassName(status: string) {
  switch (status) {
    case "ready":
      return "status-pill status-pill--success";
    case "uploading":
      return "status-pill status-pill--info";
    default:
      return "status-pill status-pill--warning";
  }
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

export function MissionWorkspace({ snapshot, source }: MissionWorkspaceProps) {
  const selectedMission = snapshot.missions[0] ?? null;

  return (
    <main className="ops-workspace-shell">
      <section className="ops-topbar surface">
        <div className="stack-xs">
          <p className="eyebrow">Aerial Operations OS</p>
          <h1>{snapshot.workspaceLabel}</h1>
          <p className="muted">
            Mission-control shell for planning, ingest, processing, install, and
            deliverable review. This now reflects the upgraded product direction,
            not just an auth dashboard.
          </p>
        </div>

        <div className="ops-topbar-actions">
          <label className="ops-command-search" htmlFor="ops-command-search">
            <span className="eyebrow">Command</span>
            <input
              id="ops-command-search"
              name="ops-command-search"
              type="text"
              value="Search missions, datasets, jobs, or commands"
              readOnly
              aria-readonly="true"
            />
          </label>
          <Link href="/dashboard" className="button button-secondary">
            Dashboard
          </Link>
          <SignOutForm label="Sign out" variant="secondary" />
        </div>
      </section>

      <section className="ops-status-strip">
        {snapshot.statusChips.map((chip) => (
          <article key={`${chip.label}-${chip.value}`} className="surface status-chip-card stack-xs">
            <span className="eyebrow">{chip.label}</span>
            <strong>{chip.value}</strong>
            <span className={getToneClassName(chip.tone)}>{chip.label}</span>
          </article>
        ))}
      </section>

      <section className="surface ops-source-banner stack-xs">
        <p className="eyebrow">Workspace data source</p>
        <p className="muted">
          {source === "database"
            ? "This workspace is loading from real Supabase aerial-ops tables on the protected route."
            : "This workspace is using the built-in fallback snapshot because the new aerial-ops tables are empty or not applied yet."}
        </p>
      </section>

      <section className="ops-main-grid">
        <aside className="ops-rail surface stack-md">
          <div className="stack-xs">
            <p className="eyebrow">Workspace rail</p>
            <h2>Projects and operations</h2>
            <p className="muted">
              The old app stopped at auth. This shell starts introducing the multi-lane
              operations model from the new master plan.
            </p>
          </div>

          {snapshot.rail.map((section) => (
            <div key={section.label} className="stack-xs">
              <h3>{section.label}</h3>
              <ul className="ops-rail-list">
                {section.items.map((item) => (
                  <li key={`${section.label}-${item.label}`} className={item.active ? "ops-rail-item ops-rail-item--active" : "ops-rail-item"}>
                    <span>{item.label}</span>
                    <span className="muted">{item.meta}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </aside>

        <section className="ops-center-column stack-md">
          <article className="surface section-header">
            <div className="stack-sm">
              <div className="stack-xs">
                <p className="eyebrow">Current project</p>
                <h2>{snapshot.currentProject.name}</h2>
                <p className="muted">{snapshot.currentProject.objective}</p>
              </div>

              <dl className="kv-grid ops-project-meta">
                <div className="kv-row">
                  <dt>Sites in focus</dt>
                  <dd>{snapshot.currentProject.site}</dd>
                </div>
                <div className="kv-row">
                  <dt>Terrain source</dt>
                  <dd>{snapshot.currentProject.terrainSource}</dd>
                </div>
                <div className="kv-row">
                  <dt>Coordinate system</dt>
                  <dd>{snapshot.currentProject.coordinateSystem}</dd>
                </div>
                <div className="kv-row">
                  <dt>Collaboration status</dt>
                  <dd>{snapshot.currentProject.collaborationStatus}</dd>
                </div>
              </dl>
            </div>

            <div className="header-actions">
              <span className="status-pill status-pill--success">
                {snapshot.entitlementLabel} access active
              </span>
              <span className={source === "database" ? "status-pill status-pill--info" : "status-pill status-pill--warning"}>
                {source === "database" ? "Query-backed workspace" : "Fallback workspace"}
              </span>
              <Link href="/dashboard" className="button button-secondary">
                Account context
              </Link>
            </div>
          </article>

          <section className="stats-grid">
            <article className="surface stat-card stack-xs">
              <span className="eyebrow">Active missions</span>
              <strong className="stat-value">{formatWholeNumber(snapshot.totals.missionCount)}</strong>
              <p className="muted">Planning, processing, and repeat-capture lanes currently surfaced.</p>
            </article>
            <article className="surface stat-card stack-xs">
              <span className="eyebrow">Mapped area</span>
              <strong className="stat-value">{formatWholeNumber(snapshot.totals.totalAcres)} acres</strong>
              <p className="muted">Current pilot coverage across corridor, inspection, and event planning work.</p>
            </article>
            <article className="surface stat-card stack-xs">
              <span className="eyebrow">Tracked datasets</span>
              <strong className="stat-value">{formatWholeNumber(snapshot.totals.datasetCount)}</strong>
              <p className="muted">Upload/preflight lanes that should graduate into real ingest sessions next.</p>
            </article>
            <article className="surface stat-card stack-xs">
              <span className="eyebrow">Active jobs</span>
              <strong className="stat-value">{formatWholeNumber(snapshot.totals.activeJobCount)}</strong>
              <p className="muted">Processing, validation, and install-bundle work visible in the bottom console.</p>
            </article>
          </section>

          <section className="grid-cards">
            <article className="surface info-card stack-sm">
              <h2>Mission lanes</h2>
              <div className="mission-grid mission-grid--single-column">
                {snapshot.missions.map((mission) => (
                  <article key={mission.id} className="ops-mission-card stack-sm">
                    <div className="mission-card-header">
                      <div className="stack-xs">
                        <p className="eyebrow">{mission.siteName}</p>
                        <h3>{mission.name}</h3>
                        <p className="muted">
                          {mission.missionType} · {mission.versionLabel} · updated {formatDateTime(mission.lastUpdated)}
                        </p>
                      </div>
                      <div className="stack-xs ops-mission-header-pills">
                        <span className={getStagePillClassName(mission.stage)}>
                          {formatMissionStage(mission.stage)}
                        </span>
                        <span className="status-pill status-pill--info">Health {mission.healthScore}</span>
                      </div>
                    </div>

                    <dl className="mission-meta-grid">
                      <div className="kv-row">
                        <dt>Capture date</dt>
                        <dd>{formatDate(mission.captureDate)}</dd>
                      </div>
                      <div className="kv-row">
                        <dt>AOI size</dt>
                        <dd>{formatWholeNumber(mission.areaAcres)} acres</dd>
                      </div>
                      <div className="kv-row">
                        <dt>Target GSD</dt>
                        <dd>{formatOneDecimal(mission.gsdCm)} cm</dd>
                      </div>
                      <div className="kv-row">
                        <dt>Images</dt>
                        <dd>{formatWholeNumber(mission.imageCount)}</dd>
                      </div>
                      <div className="kv-row mission-meta-grid__wide">
                        <dt>Device target</dt>
                        <dd>{mission.targetDevice}</dd>
                      </div>
                      <div className="kv-row mission-meta-grid__wide">
                        <dt>Battery/install plan</dt>
                        <dd>{mission.batteryPlan}</dd>
                      </div>
                      <div className="kv-row mission-meta-grid__wide">
                        <dt>Compatibility</dt>
                        <dd>{mission.compatibility}</dd>
                      </div>
                    </dl>

                    <div className="stack-xs">
                      <h3>Output readiness</h3>
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

                    <div className="ops-two-column-list-grid">
                      <div className="stack-xs">
                        <h3>Current blocker</h3>
                        <ul className="action-list mission-blocker-list">
                          {mission.blockers.map((blocker) => (
                            <li key={blocker}>{blocker}</li>
                          ))}
                        </ul>
                      </div>
                      <div className="stack-xs">
                        <h3>Validation gaps</h3>
                        <ul className="action-list mission-blocker-list">
                          {mission.warnings.map((warning) => (
                            <li key={warning}>{warning}</li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    <div className="header-actions">
                      <Link href={`/missions/${mission.id}`} className="button button-secondary">
                        Open mission detail
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            </article>

            <article className="surface info-card stack-sm">
              <h2>Ingest and deliverables</h2>
              <div className="stack-sm">
                <div className="stack-xs">
                  <p className="eyebrow">Datasets</p>
                  <div className="stack-xs">
                    {snapshot.datasets.map((dataset) => (
                      <article key={dataset.id} className="ops-list-card">
                        <div className="ops-list-card-header">
                          <div className="stack-xs">
                            <strong>{dataset.name}</strong>
                            <span className="muted">
                              {dataset.kind} · {formatWholeNumber(dataset.imageCount)} frames · {dataset.footprint}
                            </span>
                          </div>
                          <span className={getDatasetPillClassName(dataset.status)}>
                            {formatDatasetStatus(dataset.status)}
                          </span>
                        </div>
                        <p className="muted">
                          Captured {formatDateTime(dataset.capturedAt)} · {dataset.finding}
                        </p>
                      </article>
                    ))}
                  </div>
                </div>

                <div className="stack-xs">
                  <p className="eyebrow">Outputs</p>
                  <div className="stack-xs">
                    {snapshot.outputArtifacts.map((artifact) => (
                      <article key={artifact.id} className="ops-list-card">
                        <div className="ops-list-card-header">
                          <div className="stack-xs">
                            <strong>{artifact.name}</strong>
                            <span className="muted">
                              {artifact.kind} · {artifact.format}
                            </span>
                          </div>
                          <span className={getOutputPillClassName(artifact.status)}>
                            {formatOutputArtifactStatus(artifact.status)}
                          </span>
                        </div>
                        <p className="muted">
                          {artifact.delivery} · Source: {artifact.sourceJob}
                        </p>
                      </article>
                    ))}
                  </div>
                </div>
              </div>
            </article>
          </section>
        </section>

        <aside className="ops-inspector surface stack-md">
          <div className="stack-xs">
            <p className="eyebrow">Contextual inspector</p>
            <h2>{selectedMission?.name ?? "Mission detail pending"}</h2>
            <p className="muted">
              The right rail now behaves like a mission-control inspector instead of a dead-end detail card.
            </p>
          </div>

          <dl className="kv-grid">
            <div className="kv-row">
              <dt>Mission type</dt>
              <dd>{selectedMission?.missionType ?? "No mission selected"}</dd>
            </div>
            <div className="kv-row">
              <dt>Version</dt>
              <dd>{selectedMission?.versionLabel ?? "No version yet"}</dd>
            </div>
            <div className="kv-row">
              <dt>Processing profile</dt>
              <dd>{selectedMission?.processingProfile ?? "No processing profile yet"}</dd>
            </div>
            <div className="kv-row">
              <dt>Coordinate system</dt>
              <dd>{selectedMission?.coordinateSystem ?? "Unknown CRS"}</dd>
            </div>
            <div className="kv-row">
              <dt>Outputs ready</dt>
              <dd>{formatWholeNumber(snapshot.totals.readyOutputCount)}</dd>
            </div>
            <div className="kv-row">
              <dt>Outputs in progress</dt>
              <dd>{formatWholeNumber(snapshot.totals.outputsInProgressCount)}</dd>
            </div>
            <div className="kv-row">
              <dt>Outputs missing</dt>
              <dd>{formatWholeNumber(snapshot.totals.outputsMissingCount)}</dd>
            </div>
            <div className="kv-row">
              <dt>Missions needing attention</dt>
              <dd>{formatWholeNumber(snapshot.totals.missionsNeedingAttention)}</dd>
            </div>
          </dl>

          <div className="stack-xs">
            <h3>Next shipping actions</h3>
            <ol className="action-list">
              {snapshot.nextActions.map((action) => (
                <li key={action}>{action}</li>
              ))}
            </ol>
          </div>
        </aside>
      </section>

      <section className="ops-console-grid">
        <article className="surface stack-sm">
          <div className="stack-xs">
            <p className="eyebrow">Job console</p>
            <h2>Processing and validation lanes</h2>
          </div>
          <div className="stack-sm">
            {snapshot.jobs.map((job) => (
              <article key={job.id} className="ops-job-card stack-xs">
                <div className="ops-list-card-header">
                  <div className="stack-xs">
                    <strong>{job.name}</strong>
                    <span className="muted">
                      {job.engine} · {job.stage} · started {formatDateTime(job.startedAt)}
                    </span>
                  </div>
                  <span className={getJobPillClassName(job.status)}>{formatJobStatus(job.status)}</span>
                </div>
                <div className="ops-progress-row">
                  <div className="ops-progress-track" aria-hidden="true">
                    <span className="ops-progress-fill" style={{ width: `${job.progress}%` }} />
                  </div>
                  <strong>{job.progress}%</strong>
                </div>
                <div className="ops-job-meta muted">
                  <span>{job.queuePosition}</span>
                  <span>ETA: {job.eta}</span>
                </div>
                <p className="muted">{job.notes}</p>
                <div className="header-actions">
                  <Link href={`/jobs/${job.id}`} className="button button-secondary">
                    View job
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </article>

        <article className="surface stack-sm">
          <div className="stack-xs">
            <p className="eyebrow">Activity feed</p>
            <h2>Event history</h2>
          </div>
          <div className="stack-xs">
            {snapshot.activity.map((event) => (
              <article key={event.id} className="ops-event-card stack-xs">
                <div className="ops-list-card-header">
                  <strong>{event.title}</strong>
                  <span className="muted">{event.type}</span>
                </div>
                <p className="muted">{event.detail}</p>
                <span className="eyebrow">{formatDateTime(event.at)}</span>
              </article>
            ))}
          </div>
        </article>
      </section>
    </main>
  );
}
