export type MissionReadinessStep = {
  id: string;
  label: string;
  done: boolean;
  detail: string;
};

export type MissionReadinessSummary = {
  percent: number;
  completeCount: number;
  totalCount: number;
  summary: string;
  steps: MissionReadinessStep[];
};

export function getMissionReadinessSummary(input: {
  hasMissionGeometry: boolean;
  datasetCount: number;
  primaryDatasetHasGeometry: boolean;
  primaryDatasetReady: boolean;
  jobCount: number;
  readyOutputCount: number;
  installBundleReady: boolean;
  versionApproved: boolean;
  installConfirmed: boolean;
  overlayReviewedCount: number;
  overlayTotalCount: number;
  delivered: boolean;
}) {
  const steps: MissionReadinessStep[] = [
    {
      id: "aoi",
      label: "Attach mission AOI geometry",
      done: input.hasMissionGeometry,
      detail: input.hasMissionGeometry ? "AOI geometry is attached." : "AOI geometry is still missing.",
    },
    {
      id: "dataset",
      label: "Attach at least one dataset",
      done: input.datasetCount > 0,
      detail: input.datasetCount > 0 ? `${input.datasetCount} dataset(s) attached.` : "No datasets attached yet.",
    },
    {
      id: "footprint",
      label: "Attach primary dataset footprint",
      done: input.primaryDatasetHasGeometry,
      detail: input.primaryDatasetHasGeometry ? "Primary dataset footprint is attached." : "Primary dataset footprint geometry is still missing.",
    },
    {
      id: "preflight",
      label: "Clear preflight / review dataset",
      done: input.primaryDatasetReady,
      detail: input.primaryDatasetReady ? "Primary dataset is ready for downstream work." : "Primary dataset still needs review or remains flagged.",
    },
    {
      id: "processing",
      label: "Queue processing",
      done: input.jobCount > 0,
      detail: input.jobCount > 0 ? `${input.jobCount} processing/planner job(s) recorded.` : "No jobs queued yet.",
    },
    {
      id: "outputs",
      label: "Generate ready outputs",
      done: input.readyOutputCount > 0,
      detail: input.readyOutputCount > 0 ? `${input.readyOutputCount} ready output artifact(s) available.` : "No ready artifacts yet.",
    },
    {
      id: "install-bundle",
      label: "Generate install bundle",
      done: input.installBundleReady,
      detail: input.installBundleReady ? "Install bundle is available." : "Install bundle not generated yet.",
    },
    {
      id: "approval",
      label: "Approve version",
      done: input.versionApproved,
      detail: input.versionApproved ? "Latest version is approved or installed." : "Latest version still needs approval.",
    },
    {
      id: "overlay-review",
      label: "Review GIS overlays",
      done: input.overlayTotalCount > 0 && input.overlayReviewedCount === input.overlayTotalCount,
      detail: input.overlayTotalCount > 0
        ? `${input.overlayReviewedCount}/${input.overlayTotalCount} overlay layers reviewed.`
        : "No overlay recommendations generated yet.",
    },
    {
      id: "install-confirmation",
      label: "Confirm install state",
      done: input.installConfirmed,
      detail: input.installConfirmed ? "Install has been confirmed." : "Install confirmation not recorded yet.",
    },
    {
      id: "delivery",
      label: "Mark delivered",
      done: input.delivered,
      detail: input.delivered ? "Mission is marked delivered." : "Mission is not yet marked delivered.",
    },
  ];

  const completeCount = steps.filter((step) => step.done).length;
  const totalCount = steps.length;
  const percent = Math.round((completeCount / totalCount) * 100);

  const summary = percent >= 85
    ? "Mission is nearing full operational readiness and looks close to a complete field/delivery loop."
    : percent >= 60
      ? "Mission is materially underway, but some operational or GIS QA checkpoints are still open."
      : "Mission is still in setup/QA buildout mode and should not be treated as fully delivery-ready yet.";

  return {
    percent,
    completeCount,
    totalCount,
    summary,
    steps,
  } satisfies MissionReadinessSummary;
}

export function buildMissionReadinessChecklist(input: {
  missionName: string;
  steps: MissionReadinessStep[];
}) {
  return [
    `Mission Readiness Checklist — ${input.missionName}`,
    ...input.steps.map((step) => `- [${step.done ? "x" : " "}] ${step.label}: ${step.detail}`),
  ].join("\n");
}
