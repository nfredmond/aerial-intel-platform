import Link from "next/link";

import type { MissionWorkspaceSnapshot } from "@/lib/missions/workspace";
import {
  formatDatasetStatus,
  formatJobStatus,
  formatOutputArtifactStatus,
} from "@/lib/missions/workspace";

import { SignOutForm } from "@/app/dashboard/sign-out-form";
import { SupportContextCopyButton } from "@/app/dashboard/support-context-copy-button";

import { MissionBoardClient } from "./mission-board-client";

type MissionWorkspaceProps = {
  snapshot: MissionWorkspaceSnapshot;
  source: "database" | "fallback";
  canManageOperations: boolean;
  createMissionAction: (formData: FormData) => Promise<void>;
  bootstrapLiveWorkspaceAction: () => Promise<void>;
  advanceArtifactHandoffAction: (formData: FormData) => Promise<void>;
  advanceWorkspaceProvingJobAction: (formData: FormData) => Promise<void>;
  saveWorkspaceHandoffNoteAction: (formData: FormData) => Promise<void>;
  notice?: {
    tone: "success" | "warning" | "error";
    message: string;
  } | null;
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

function formatWholeNumber(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
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

function getHandoffPillClassName(stage: string) {
  switch (stage) {
    case "exported":
      return "status-pill status-pill--success";
    case "shared":
    case "reviewed":
      return "status-pill status-pill--info";
    default:
      return "status-pill status-pill--warning";
  }
}

function getCalloutClassName(tone: "success" | "warning" | "error") {
  switch (tone) {
    case "success":
      return "callout callout-success";
    case "warning":
      return "callout callout-warning";
    default:
      return "callout callout-error";
  }
}

function getActivityPillClassName(tone: "success" | "info" | "warning") {
  switch (tone) {
    case "success":
      return "status-pill status-pill--success";
    case "info":
      return "status-pill status-pill--info";
    default:
      return "status-pill status-pill--warning";
  }
}

function getChecklistStatusClass(status: string) {
  switch (status) {
    case "complete":
      return "status-pill status-pill--success";
    case "running":
      return "status-pill status-pill--info";
    default:
      return "status-pill status-pill--warning";
  }
}

function getStageChecklistSummary(stageChecklist?: MissionWorkspaceSnapshot["jobs"][number]["stageChecklist"]) {
  if (!stageChecklist || stageChecklist.length === 0) {
    return null;
  }

  const counts = new Map<string, number>();
  for (const item of stageChecklist) {
    counts.set(item.status, (counts.get(item.status) ?? 0) + 1);
  }

  return Array.from(counts.entries()).map(([status, count]) => `${count} ${status}`).join(" · ");
}

function getArtifactAuditLine(artifact: MissionWorkspaceSnapshot["outputArtifacts"][number]) {
  if (artifact.exportedAt) {
    return `Exported ${formatDateTime(artifact.exportedAt)}${artifact.exportedByEmail ? ` by ${artifact.exportedByEmail}` : ""}`;
  }

  if (artifact.sharedAt) {
    return `Shared ${formatDateTime(artifact.sharedAt)}${artifact.sharedByEmail ? ` by ${artifact.sharedByEmail}` : ""}`;
  }

  if (artifact.reviewedAt) {
    return `Reviewed ${formatDateTime(artifact.reviewedAt)}${artifact.reviewedByEmail ? ` by ${artifact.reviewedByEmail}` : ""}`;
  }

  return null;
}

function isProvingWorkspaceJob(job: MissionWorkspaceSnapshot["jobs"][number]) {
  return job.presetId === "v1-proving-run" || job.source === "mission-proving-seed";
}

function getReadinessAction(
  item: MissionWorkspaceSnapshot["v1Readiness"]["items"][number],
  snapshot: MissionWorkspaceSnapshot,
  selectedMission: MissionWorkspaceSnapshot["missions"][number] | null,
) {
  const missionHref = selectedMission ? `/missions/${selectedMission.id}` : "/missions";
  const firstJob = snapshot.jobs[0] ?? null;
  const firstArtifact = snapshot.outputArtifacts[0] ?? null;
  const firstReadyArtifact = snapshot.outputArtifacts.find((artifact) => artifact.status === "ready") ?? firstArtifact;

  switch (item.id) {
    case "mission":
      return { href: "/missions", label: "Open workspace" };
    case "dataset":
      return { href: `${missionHref}#mission-live-action`, label: "Open dataset attach" };
    case "job-submit":
      return { href: `${missionHref}#mission-live-action`, label: "Open job controls" };
    case "job-watch":
      return firstJob ? { href: `/jobs/${firstJob.id}`, label: "Open job detail" } : { href: `${missionHref}#mission-jobs`, label: "Open mission jobs" };
    case "artifact-readiness":
      return { href: `${missionHref}#mission-artifacts`, label: "Open artifact trail" };
    case "deliverable-review":
      return firstReadyArtifact ? { href: `/artifacts/${firstReadyArtifact.id}`, label: "Open deliverable" } : { href: `${missionHref}#mission-handoff`, label: "Open handoff posture" };
    default:
      return null;
  }
}

export function MissionWorkspace({
  snapshot,
  source,
  canManageOperations,
  createMissionAction,
  bootstrapLiveWorkspaceAction,
  advanceArtifactHandoffAction,
  advanceWorkspaceProvingJobAction,
  saveWorkspaceHandoffNoteAction,
  notice,
}: MissionWorkspaceProps) {
  const selectedMission = snapshot.missions[0] ?? null;
  const handoffQueue = snapshot.outputArtifacts.filter(
    (artifact) => artifact.status === "ready" && artifact.handoffStage !== "exported",
  );
  const reviewQueue = handoffQueue.filter((artifact) => artifact.handoffStage === "pending_review");
  const shareQueue = handoffQueue.filter((artifact) => artifact.handoffStage === "reviewed");
  const exportQueue = handoffQueue.filter((artifact) => artifact.handoffStage === "shared");
  const openV1Items = snapshot.v1Readiness.items.filter((item) => !item.complete);
  const solidV1Ready = source === "database" && openV1Items.length === 0;
  const activeProvingJob = snapshot.jobs.find(
    (job) => isProvingWorkspaceJob(job) && ["queued", "running"].includes(job.status),
  ) ?? null;
  const firstReadyArtifact = snapshot.outputArtifacts.find((artifact) => artifact.status === "ready") ?? null;

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

      {notice ? <section className={getCalloutClassName(notice.tone)}>{notice.message}</section> : null}

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
            <article className="surface stat-card stack-xs">
              <span className="eyebrow">Handoff backlog</span>
              <strong className="stat-value">{formatWholeNumber(snapshot.totals.handoffBacklogCount)}</strong>
              <p className="muted">Ready artifacts that still need review/share/export follow-through.</p>
            </article>
            <article className="surface stat-card stack-xs">
              <span className="eyebrow">V1 readiness</span>
              <strong className="stat-value">{snapshot.v1Readiness.percent}%</strong>
              <p className="muted">{snapshot.v1Readiness.statusLabel} · {snapshot.v1Readiness.completeCount}/{snapshot.v1Readiness.totalCount} acceptance steps complete.</p>
            </article>
          </section>

          <MissionBoardClient missions={snapshot.missions} />

          <section className="grid-cards">
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
                  <p className="eyebrow">Artifact handoff queue</p>
                  <div className="stack-sm">
                    {handoffQueue.length > 0 ? (
                      [
                        {
                          id: "review",
                          title: "Review lane",
                          detail: "Ready artifacts waiting for QA/reviewer confirmation before sharing.",
                          items: reviewQueue,
                        },
                        {
                          id: "share",
                          title: "Share lane",
                          detail: "Reviewed artifacts ready for stakeholder or client-facing handoff.",
                          items: shareQueue,
                        },
                        {
                          id: "export",
                          title: "Export lane",
                          detail: "Shared artifacts that still need final packaged delivery traceability.",
                          items: exportQueue,
                        },
                      ].map((lane) => (
                        <section key={lane.id} className="surface-form-shell stack-xs">
                          <div className="ops-list-card-header">
                            <div className="stack-xs">
                              <strong>{lane.title}</strong>
                              <span className="muted">{lane.detail}</span>
                            </div>
                            <span className={lane.items.length > 0 ? "status-pill status-pill--warning" : "status-pill status-pill--success"}>
                              {lane.items.length}
                            </span>
                          </div>
                          {lane.items.length > 0 ? (
                            lane.items.map((artifact) => (
                              <article key={`${artifact.id}-handoff`} className="ops-list-card stack-xs">
                                <div className="ops-list-card-header">
                                  <div className="stack-xs">
                                    <strong>{artifact.name}</strong>
                                    <span className="muted">
                                      {artifact.kind} · {artifact.format}
                                    </span>
                                  </div>
                                  <span className={getHandoffPillClassName(artifact.handoffStage)}>
                                    {artifact.handoffLabel}
                                  </span>
                                </div>
                                <p className="muted">{artifact.nextAction}</p>
                                {artifact.handoffNotePreview ? (
                                  <p className="muted">Note: {artifact.handoffNotePreview}</p>
                                ) : null}
                                {getArtifactAuditLine(artifact) ? (
                                  <p className="muted">{getArtifactAuditLine(artifact)}</p>
                                ) : null}
                                <p className="muted">{artifact.delivery} · Source: {artifact.sourceJob}</p>
                                <div className="header-actions">
                                  {canManageOperations ? (
                                    <form action={advanceArtifactHandoffAction}>
                                      <input type="hidden" name="artifactId" value={artifact.id} />
                                      <input
                                        type="hidden"
                                        name="targetAction"
                                        value={artifact.handoffStage === "pending_review" ? "reviewed" : artifact.handoffStage === "reviewed" ? "shared" : "exported"}
                                      />
                                      <button type="submit" className="button button-primary">
                                        {artifact.handoffStage === "pending_review"
                                          ? "Mark reviewed"
                                          : artifact.handoffStage === "reviewed"
                                            ? "Mark shared"
                                            : "Mark exported"}
                                      </button>
                                    </form>
                                  ) : null}
                                  <Link href={`/artifacts/${artifact.id}`} className="button button-secondary">
                                    Open handoff
                                  </Link>
                                </div>
                                <div className="header-actions">
                                  <SupportContextCopyButton
                                    text={artifact.shareSummary}
                                    buttonLabel="Copy share summary"
                                    successMessage="Share summary copied from the workspace queue."
                                    fallbackAriaLabel={`Share summary for ${artifact.name}`}
                                    fallbackHintMessage="Press Ctrl/Cmd+C, then paste this share summary into chat, docs, or email."
                                  />
                                  <SupportContextCopyButton
                                    text={artifact.exportPacket}
                                    buttonLabel="Copy export packet"
                                    successMessage="Export packet copied from the workspace queue."
                                    fallbackAriaLabel={`Export packet for ${artifact.name}`}
                                    fallbackHintMessage="Press Ctrl/Cmd+C, then paste this export packet into docs, tickets, or a delivery note."
                                  />
                                </div>
                                {canManageOperations ? (
                                  <form action={saveWorkspaceHandoffNoteAction} className="stack-sm surface-form-shell">
                                    <input type="hidden" name="artifactId" value={artifact.id} />
                                    <label className="stack-xs">
                                      <span>Handoff note</span>
                                      <textarea
                                        name="handoffNote"
                                        defaultValue={artifact.handoffNotePreview ?? ""}
                                        placeholder="Capture reviewer context, delivery caveats, or client-safe notes."
                                        rows={3}
                                      />
                                    </label>
                                    <label className="stack-xs">
                                      <span>Next action</span>
                                      <input
                                        name="handoffNextAction"
                                        type="text"
                                        defaultValue={artifact.nextAction}
                                        placeholder="Optional next-step override"
                                      />
                                    </label>
                                    <button type="submit" className="button button-secondary">
                                      Save note
                                    </button>
                                  </form>
                                ) : null}
                              </article>
                            ))
                          ) : (
                            <p className="muted">No artifacts currently waiting in this lane.</p>
                          )}
                        </section>
                      ))
                    ) : (
                      <p className="muted">All ready artifacts are currently exported or no ready artifacts exist yet.</p>
                    )}
                  </div>
                </div>

                <div className="stack-xs">
                  <p className="eyebrow">Outputs</p>
                  <div className="stack-xs">
                    {snapshot.outputArtifacts.map((artifact) => (
                      <article key={artifact.id} className="ops-list-card stack-xs">
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
                          Handoff: {artifact.handoffLabel} · {artifact.delivery}
                        </p>
                        {artifact.handoffNotePreview ? (
                          <p className="muted">Note: {artifact.handoffNotePreview}</p>
                        ) : null}
                        {getArtifactAuditLine(artifact) ? (
                          <p className="muted">{getArtifactAuditLine(artifact)}</p>
                        ) : null}
                        <p className="muted">Next: {artifact.nextAction}</p>
                        <div className="header-actions">
                          <Link href={`/artifacts/${artifact.id}`} className="button button-secondary">
                            Review artifact
                          </Link>
                        </div>
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
            <div className="kv-row">
              <dt>Handoff backlog</dt>
              <dd>{formatWholeNumber(snapshot.totals.handoffBacklogCount)}</dd>
            </div>
            <div className="kv-row">
              <dt>Exported artifacts</dt>
              <dd>{formatWholeNumber(snapshot.totals.exportedArtifactCount)}</dd>
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

          <div className="stack-sm surface-form-shell">
            <div className="stack-xs">
              <p className="eyebrow">V1 milestone bar</p>
              <h3>{snapshot.v1Readiness.statusLabel}</h3>
              <p className="muted">
                This tracks the acceptance bar from the execution plan so we can call the app a solid v1 based on shipped workflow coverage, not vibes.
              </p>
            </div>
            <div className="stack-xs">
              {snapshot.v1Readiness.items.map((item) => {
                const action = getReadinessAction(item, snapshot, selectedMission);

                return (
                  <article key={item.id} className="ops-list-card stack-xs">
                    <div className="ops-list-card-header">
                      <strong>{item.label}</strong>
                      <span className={item.complete ? "status-pill status-pill--success" : "status-pill status-pill--warning"}>
                        {item.complete ? "Complete" : "Open"}
                      </span>
                    </div>
                    <p className="muted">{item.detail}</p>
                    {action ? (
                      <div className="header-actions">
                        <Link href={action.href} className="button button-secondary">
                          {action.label}
                        </Link>
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </div>

          <div className="stack-sm surface-form-shell">
            <div className="stack-xs">
              <p className="eyebrow">V1 go / no-go</p>
              <h3>{solidV1Ready ? "Solid v1" : "Not solid v1 yet"}</h3>
              <p className="muted">
                {solidV1Ready
                  ? "The real data-backed workflow currently clears the acceptance bar end-to-end."
                  : source !== "database"
                    ? "The real data backbone is not active yet, so this workspace still counts as a prototype even if much of the UX loop is implemented."
                    : `${openV1Items.length} acceptance step(s) are still open on the live data path.`}
              </p>
            </div>
            <div className="stack-xs">
              {source !== "database" ? (
                <article className="ops-list-card stack-xs">
                  <div className="ops-list-card-header">
                    <strong>Real data backbone</strong>
                    <span className="status-pill status-pill--warning">Required</span>
                  </div>
                  <p className="muted">
                    Apply/populate the protected aerial-ops tables so mission, dataset, job, event, and artifact flows are real instead of fallback-only.
                  </p>
                  <div className="header-actions">
                    {canManageOperations ? (
                      <form action={bootstrapLiveWorkspaceAction}>
                        <button type="submit" className="button button-primary">
                          Bootstrap live workspace
                        </button>
                      </form>
                    ) : null}
                    <Link href="/missions" className="button button-secondary">
                      Open workspace
                    </Link>
                  </div>
                </article>
              ) : null}
              {openV1Items.length > 0 ? (
                openV1Items.map((item) => {
                  const action = getReadinessAction(item, snapshot, selectedMission);

                  return (
                    <article key={`blocker-${item.id}`} className="ops-list-card stack-xs">
                      <div className="ops-list-card-header">
                        <strong>{item.label}</strong>
                        <span className="status-pill status-pill--warning">Open</span>
                      </div>
                      <p className="muted">{item.detail}</p>
                      {action ? (
                        <div className="header-actions">
                          <Link href={action.href} className="button button-secondary">
                            {action.label}
                          </Link>
                        </div>
                      ) : null}
                    </article>
                  );
                })
              ) : source === "database" ? (
                <article className="ops-list-card stack-xs">
                  <div className="ops-list-card-header">
                    <strong>Acceptance bar cleared</strong>
                    <span className="status-pill status-pill--success">Ready</span>
                  </div>
                  <p className="muted">Nothing in the current acceptance list is blocking a solid-v1 call.</p>
                </article>
              ) : null}
            </div>
          </div>

          <div className="stack-sm surface-form-shell">
            <div className="stack-xs">
              <p className="eyebrow">Live proving focus</p>
              <h3>Continue the real-data path</h3>
              <p className="muted">
                Top-level shortcut into the fastest honest next action on the live proving lane.
              </p>
            </div>
            {activeProvingJob ? (
              <>
                <p className="muted">
                  Active proving job: {activeProvingJob.name} ({activeProvingJob.status}). Advance it here to keep the live path moving, or open the full job page for deeper triage.
                </p>
                {activeProvingJob.latestCheckpoint ? (
                  <p className="muted">Checkpoint: {activeProvingJob.latestCheckpoint}</p>
                ) : null}
                {getStageChecklistSummary(activeProvingJob.stageChecklist) ? (
                  <p className="muted">Checklist: {getStageChecklistSummary(activeProvingJob.stageChecklist)}</p>
                ) : null}
                <div className="header-actions">
                  <form action={advanceWorkspaceProvingJobAction}>
                    <input type="hidden" name="jobId" value={activeProvingJob.id} />
                    <button type="submit" className="button button-primary" disabled={!canManageOperations}>
                      {activeProvingJob.status === "queued" ? "Start proving job now" : "Complete proving job now"}
                    </button>
                  </form>
                  <Link href={`/jobs/${activeProvingJob.id}`} className="button button-secondary">
                    Open proving job
                  </Link>
                </div>
              </>
            ) : firstReadyArtifact ? (
              <>
                <p className="muted">Ready artifacts exist. Move the live proving path forward through review/share/export.</p>
                <Link href={`/artifacts/${firstReadyArtifact.id}`} className="button button-primary">
                  Review first ready artifact
                </Link>
              </>
            ) : selectedMission ? (
              <>
                <p className="muted">No active proving job is surfaced yet. Use the selected mission to keep the live path moving.</p>
                <Link href={`/missions/${selectedMission.id}`} className="button button-primary">
                  Open selected mission
                </Link>
              </>
            ) : (
              <p className="muted">No mission is selected yet. Create or open a mission to continue the proving path.</p>
            )}
          </div>

          <div className="stack-sm surface-form-shell">
            <div className="stack-xs">
              <p className="eyebrow">Create mission draft</p>
              <h3>Quick-start the next v1 lane</h3>
              <p className="muted">
                Create a mission record and version from the protected workspace, then attach a dataset and queue processing from the detail page.
              </p>
            </div>

            {canManageOperations ? (
              <form action={createMissionAction} className="stack-sm">
                <div className="form-grid-2">
                  <label className="stack-xs">
                    <span>Mission name</span>
                    <input name="missionName" type="text" placeholder="e.g. Colgate south slope baseline" required />
                  </label>
                  <label className="stack-xs">
                    <span>Mission type</span>
                    <select name="missionType" defaultValue={selectedMission?.missionType?.toLowerCase().includes("inspection") ? "inspection" : "corridor"}>
                      <option value="corridor">Corridor</option>
                      <option value="polygon">Polygon grid</option>
                      <option value="inspection">Inspection</option>
                      <option value="facade">Facade</option>
                      <option value="orbit">Orbit / POI</option>
                    </select>
                  </label>
                </div>

                <label className="stack-xs">
                  <span>Objective</span>
                  <textarea
                    name="objective"
                    placeholder="What does this mission need to capture, validate, or deliver?"
                    defaultValue={selectedMission?.blockers[0] ?? ""}
                  />
                </label>

                <div className="form-grid-2">
                  <label className="stack-xs">
                    <span>Target device</span>
                    <input
                      name="targetDevice"
                      type="text"
                      defaultValue={selectedMission?.targetDevice ?? "DJI Mavic 3 Enterprise / Pilot 2"}
                    />
                  </label>
                  <label className="stack-xs">
                    <span>Target GSD (cm)</span>
                    <input
                      name="gsdCm"
                      type="number"
                      min="0.5"
                      step="0.1"
                      defaultValue={selectedMission ? String(selectedMission.gsdCm) : "2.0"}
                    />
                  </label>
                </div>

                <button type="submit" className="button button-primary">
                  Draft mission
                </button>
              </form>
            ) : (
              <p className="muted">
                Viewer access can review missions but cannot create them.
              </p>
            )}
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
                {job.latestCheckpoint ? <p className="muted">Checkpoint: {job.latestCheckpoint}</p> : null}
                <p className="muted">{job.notes}</p>
                {job.stageChecklist && job.stageChecklist.length > 0 ? (
                  <div className="header-actions">
                    {job.stageChecklist.map((item) => (
                      <span key={`${job.id}-${item.label}-${item.status}`} className={getChecklistStatusClass(item.status)}>
                        {item.label}: {item.status}
                      </span>
                    ))}
                  </div>
                ) : null}
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
                  <div className="stack-xs">
                    <strong>{event.title}</strong>
                    <span className="muted">{event.type}</span>
                  </div>
                  <span className={getActivityPillClassName(event.tone)}>{event.lane}</span>
                </div>
                <p className="muted">{event.detail}</p>
                <div className="header-actions">
                  <span className="eyebrow">{formatDateTime(event.at)}</span>
                  {event.href ? (
                    <Link href={event.href} className="button button-secondary">
                      Open context
                    </Link>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        </article>
      </section>
    </main>
  );
}
