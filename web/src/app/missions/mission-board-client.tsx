"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import type { MissionWorkspaceSnapshot } from "@/lib/missions/workspace";
import {
  formatMissionOutputStatus,
  formatMissionStage,
} from "@/lib/missions/workspace";
import { formatDateTime } from "@/lib/ui/datetime";

type Mission = MissionWorkspaceSnapshot["missions"][number];

type MissionBoardClientProps = {
  missions: MissionWorkspaceSnapshot["missions"];
};

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

function getMissionReadyOutputCount(mission: Mission) {
  return mission.outputs.filter((output) => output.status === "ready").length;
}

function getMissionReadinessPercent(mission: Mission) {
  const outputPercent = mission.outputs.length > 0
    ? (getMissionReadyOutputCount(mission) / mission.outputs.length) * 50
    : 0;
  const blockerPoints = mission.blockers.length === 0 ? 20 : Math.max(0, 20 - mission.blockers.length * 10);
  const warningPoints = mission.warnings.length === 0 ? 10 : Math.max(0, 10 - mission.warnings.length * 5);
  const stagePoints = mission.stage === "ready-for-qa" ? 20 : mission.stage === "processing" ? 10 : 0;

  return Math.max(0, Math.min(100, Math.round(outputPercent + blockerPoints + warningPoints + stagePoints)));
}

function getMissionReadinessTone(percent: number) {
  if (percent >= 80) return "status-pill status-pill--success";
  if (percent >= 60) return "status-pill status-pill--info";
  return "status-pill status-pill--warning";
}

function getMissionPriorityScore(mission: Mission) {
  const readiness = getMissionReadinessPercent(mission);
  return readiness + Math.max(0, mission.healthScore - mission.blockers.length * 8 - mission.warnings.length * 4);
}

function getMissionRiskLabel(mission: Mission) {
  if (mission.blockers.length > 0 || mission.healthScore < 60) {
    return { label: "Fragile", className: "status-pill status-pill--warning" };
  }

  if (mission.stage === "ready-for-qa") {
    return { label: "QA-ready", className: "status-pill status-pill--success" };
  }

  return { label: "In progress", className: "status-pill status-pill--info" };
}

function getProvingStatusClass(status?: string | null) {
  switch (status) {
    case "completed":
      return "status-pill status-pill--success";
    case "running":
      return "status-pill status-pill--info";
    case "queued":
      return "status-pill status-pill--warning";
    default:
      return "status-pill status-pill--warning";
  }
}

export function MissionBoardClient({ missions }: MissionBoardClientProps) {
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("all");
  const [riskFilter, setRiskFilter] = useState("all");
  const [sortBy, setSortBy] = useState("priority");

  const stageOptions = useMemo(
    () => Array.from(new Set(missions.map((mission) => mission.stage))).sort(),
    [missions],
  );

  const filteredMissions = useMemo(() => {
    const query = search.trim().toLowerCase();

    return missions.filter((mission) => {
      const risk = getMissionRiskLabel(mission).label.toLowerCase();
      const matchesQuery =
        !query
        || mission.name.toLowerCase().includes(query)
        || mission.siteName.toLowerCase().includes(query)
        || mission.missionType.toLowerCase().includes(query)
        || mission.versionLabel.toLowerCase().includes(query);
      const matchesStage = stageFilter === "all" || mission.stage === stageFilter;
      const matchesRisk = riskFilter === "all" || risk === riskFilter;

      return matchesQuery && matchesStage && matchesRisk;
    });
  }, [missions, riskFilter, search, stageFilter]);

  const rankedMissions = useMemo(() => {
    const next = [...filteredMissions];

    next.sort((left, right) => {
      switch (sortBy) {
        case "readiness":
          return getMissionReadinessPercent(right) - getMissionReadinessPercent(left);
        case "health":
          return right.healthScore - left.healthScore;
        case "updated":
          return new Date(right.lastUpdated).getTime() - new Date(left.lastUpdated).getTime();
        case "name":
          return left.name.localeCompare(right.name);
        default:
          return getMissionPriorityScore(right) - getMissionPriorityScore(left);
      }
    });

    return next;
  }, [filteredMissions, sortBy]);

  const deliveryReadyCount = filteredMissions.filter((mission) => getMissionReadinessPercent(mission) >= 80).length;
  const fragileCount = filteredMissions.filter((mission) => mission.blockers.length > 0 || mission.healthScore < 60).length;
  const qaReadyCount = filteredMissions.filter((mission) => mission.stage === "ready-for-qa").length;

  return (
    <section className="grid-cards">
      <article className="surface info-card stack-sm">
        <div className="stack-xs">
          <p className="eyebrow">GIS triage board</p>
          <h2>Priority queue and delivery posture</h2>
          <p className="muted">Search, filter, and rank missions by readiness and risk before drilling into detail.</p>
        </div>

        <div className="filter-toolbar">
          <label className="stack-xs filter-toolbar__field">
            <span>Search missions</span>
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Mission name, site, type, version"
            />
          </label>
          <label className="stack-xs filter-toolbar__field">
            <span>Stage</span>
            <select value={stageFilter} onChange={(event) => setStageFilter(event.target.value)}>
              <option value="all">All stages</option>
              {stageOptions.map((stage) => (
                <option key={stage} value={stage}>{stage}</option>
              ))}
            </select>
          </label>
          <label className="stack-xs filter-toolbar__field">
            <span>Risk</span>
            <select value={riskFilter} onChange={(event) => setRiskFilter(event.target.value)}>
              <option value="all">All risk states</option>
              <option value="fragile">Fragile</option>
              <option value="qa-ready">QA-ready</option>
              <option value="in progress">In progress</option>
            </select>
          </label>
          <label className="stack-xs filter-toolbar__field">
            <span>Sort</span>
            <select value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
              <option value="priority">Priority</option>
              <option value="readiness">Readiness</option>
              <option value="health">Health</option>
              <option value="updated">Updated</option>
              <option value="name">Name</option>
            </select>
          </label>
          <button
            type="button"
            className="button button-secondary filter-toolbar__reset"
            onClick={() => {
              setSearch("");
              setStageFilter("all");
              setRiskFilter("all");
              setSortBy("priority");
            }}
          >
            Reset filters
          </button>
        </div>

        <div className="status-dashboard-grid">
          <article className="status-dashboard-card stack-xs">
            <strong>Delivery-ready</strong>
            <span className="status-pill status-pill--success">{deliveryReadyCount}</span>
            <p className="muted">Filtered missions with readiness at or above 80%.</p>
          </article>
          <article className="status-dashboard-card stack-xs">
            <strong>Fragile missions</strong>
            <span className="status-pill status-pill--warning">{fragileCount}</span>
            <p className="muted">Filtered missions with blockers or low health.</p>
          </article>
          <article className="status-dashboard-card stack-xs">
            <strong>QA-ready</strong>
            <span className="status-pill status-pill--info">{qaReadyCount}</span>
            <p className="muted">Filtered missions currently at the ready-for-QA stage.</p>
          </article>
          <article className="status-dashboard-card stack-xs">
            <strong>Top priority</strong>
            <span className="status-pill status-pill--info">{rankedMissions[0]?.name ?? "None"}</span>
            <p className="muted">Best current candidate for the next focused ops/GIS pass.</p>
          </article>
        </div>

        <div className="stack-xs">
          {rankedMissions.slice(0, 3).map((mission) => {
            const readinessPercent = getMissionReadinessPercent(mission);
            const risk = getMissionRiskLabel(mission);
            const readyOutputs = getMissionReadyOutputCount(mission);

            return (
              <article key={`queue-${mission.id}`} className="ops-list-card stack-xs">
                <div className="ops-list-card-header">
                  <strong>{mission.name}</strong>
                  <span className={risk.className}>{risk.label}</span>
                </div>
                <div className="status-meter" aria-hidden="true">
                  <span className="status-meter-fill" style={{ width: `${readinessPercent}%` }} />
                </div>
                <p className="muted">
                  {readinessPercent}% ready · {readyOutputs}/{mission.outputs.length} outputs ready · {mission.blockers.length} blockers · {mission.warnings.length} warnings
                </p>
                {mission.provingJobStatus ? (
                  <p className="muted">
                    Proving: {mission.provingJobStatus}{mission.provingCheckpoint ? ` · ${mission.provingCheckpoint}` : ""}
                  </p>
                ) : null}
              </article>
            );
          })}
          {rankedMissions.length === 0 ? <p className="muted">No missions match the current filters.</p> : null}
        </div>
      </article>

      <article className="surface info-card stack-sm">
        <h2>Mission lanes</h2>
        <div className="mission-grid mission-grid--single-column">
          {filteredMissions.map((mission) => {
            const readyOutputCount = getMissionReadyOutputCount(mission);
            const readinessPercent = getMissionReadinessPercent(mission);

            return (
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

                <div className="surface-form-shell stack-sm mission-readiness-shell">
                  <div className="ops-list-card-header">
                    <strong>Mission readiness</strong>
                    <span className={getMissionReadinessTone(readinessPercent)}>{readinessPercent}% ready</span>
                  </div>
                  <div className="status-meter" aria-hidden="true">
                    <span className="status-meter-fill" style={{ width: `${readinessPercent}%` }} />
                  </div>
                  <div className="mission-inline-stats">
                    <span><strong>{readyOutputCount}/{mission.outputs.length}</strong> outputs ready</span>
                    <span><strong>{mission.blockers.length}</strong> blockers</span>
                    <span><strong>{mission.warnings.length}</strong> warnings</span>
                    <span><strong>{mission.healthScore}</strong> health</span>
                  </div>
                </div>

                {mission.provingJobStatus ? (
                  <div className="surface-form-shell stack-sm">
                    <div className="ops-list-card-header">
                      <strong>Live proving posture</strong>
                      <span className={getProvingStatusClass(mission.provingJobStatus)}>{mission.provingJobStatus}</span>
                    </div>
                    <p className="muted">{mission.provingCheckpoint ?? "No proving checkpoint recorded yet."}</p>
                    <div className="mission-inline-stats">
                      <span><strong>{mission.provingStage ?? "Unknown stage"}</strong> current stage</span>
                      <span><strong>{typeof mission.provingProgress === "number" ? mission.provingProgress : 0}%</strong> progress</span>
                    </div>
                  </div>
                ) : null}

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
                  <Link href={`/missions/${mission.id}#mission-datasets`} className="button button-secondary">
                    Datasets
                  </Link>
                  <Link href={`/missions/${mission.id}#mission-jobs`} className="button button-secondary">
                    Jobs
                  </Link>
                  <Link href={`/missions/${mission.id}#mission-install`} className="button button-secondary">
                    Install
                  </Link>
                </div>
              </article>
            );
          })}
          {filteredMissions.length === 0 ? <p className="muted">No mission lanes match the current filters.</p> : null}
        </div>
      </article>
    </section>
  );
}
