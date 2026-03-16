import type { DroneMembershipRole } from "@/lib/supabase/types";

import { formatEntitlementTier } from "@/lib/auth/access-insights";

export type MissionStage = "capture-planned" | "processing" | "ready-for-qa";
export type MissionOutputStatus = "ready" | "processing" | "missing";
export type OpsTone = "success" | "info" | "warning";

export type MissionOutput = {
  key: "orthomosaic" | "surface-model" | "point-cloud" | "mesh";
  label: string;
  status: MissionOutputStatus;
  format: string;
};

export type MissionRecord = {
  id: string;
  name: string;
  missionType: string;
  siteName: string;
  captureDate: string;
  lastUpdated: string;
  versionLabel: string;
  stage: MissionStage;
  areaAcres: number;
  imageCount: number;
  gsdCm: number;
  coordinateSystem: string;
  processingProfile: string;
  targetDevice: string;
  batteryPlan: string;
  compatibility: string;
  healthScore: number;
  outputs: MissionOutput[];
  blockers: string[];
  warnings: string[];
};

export type WorkspaceRailSection = {
  label: string;
  items: Array<{
    label: string;
    meta: string;
    active?: boolean;
  }>;
};

export type StatusChip = {
  label: string;
  value: string;
  tone: OpsTone;
};

export type DatasetRecord = {
  id: string;
  name: string;
  kind: string;
  status: "ready" | "uploading" | "flagged";
  capturedAt: string;
  imageCount: number;
  footprint: string;
  finding: string;
};

export type JobRecord = {
  id: string;
  name: string;
  engine: string;
  stage: string;
  status: "running" | "queued" | "needs_review" | "completed";
  progress: number;
  eta: string;
  queuePosition: string;
  startedAt: string;
  notes: string;
};

export type OutputArtifactRecord = {
  id: string;
  name: string;
  kind: string;
  status: "ready" | "processing" | "draft";
  format: string;
  delivery: string;
  sourceJob: string;
};

export type ActivityEventRecord = {
  id: string;
  at: string;
  type: string;
  title: string;
  detail: string;
};

export type MissionWorkspaceSnapshot = {
  workspaceLabel: string;
  entitlementLabel: string;
  currentProject: {
    name: string;
    site: string;
    objective: string;
    terrainSource: string;
    coordinateSystem: string;
    collaborationStatus: string;
  };
  rail: WorkspaceRailSection[];
  statusChips: StatusChip[];
  missions: MissionRecord[];
  datasets: DatasetRecord[];
  jobs: JobRecord[];
  outputArtifacts: OutputArtifactRecord[];
  activity: ActivityEventRecord[];
  totals: {
    missionCount: number;
    totalAcres: number;
    readyOutputCount: number;
    outputsInProgressCount: number;
    outputsMissingCount: number;
    missionsNeedingAttention: number;
    datasetCount: number;
    activeJobCount: number;
  };
  nextActions: string[];
};

const DEMO_MISSIONS: MissionRecord[] = [
  {
    id: "gv-downtown-corridor",
    name: "Grass Valley downtown curb inventory",
    missionType: "Corridor + oblique",
    siteName: "Main Street to Neal Street",
    captureDate: "2026-03-12",
    lastUpdated: "2026-03-15T20:41:00Z",
    versionLabel: "v0.8 terrain-following draft",
    stage: "ready-for-qa",
    areaAcres: 42,
    imageCount: 684,
    gsdCm: 1.8,
    coordinateSystem: "EPSG:26910 / NAD83 UTM Zone 10N",
    processingProfile: "Urban corridor orthomosaic + DSM",
    targetDevice: "DJI Mavic 3 Enterprise / Pilot 2",
    batteryPlan: "3 batteries · 2 split missions",
    compatibility: "KMZ/WPML export valid for Pilot 2",
    healthScore: 88,
    outputs: [
      { key: "orthomosaic", label: "Orthomosaic", status: "ready", format: "COG" },
      { key: "surface-model", label: "Surface model", status: "ready", format: "COG" },
      { key: "point-cloud", label: "Point cloud", status: "processing", format: "LAZ" },
      { key: "mesh", label: "Mesh", status: "missing", format: "3D Tiles" },
    ],
    blockers: [
      "Run final QA on curb/striping edge sharpness before client export.",
    ],
    warnings: [
      "Terrain-following pass still needs export-time canonical recompute.",
      "Add mission brief PDF before install handoff.",
    ],
  },
  {
    id: "colgate-penstock-phase-1",
    name: "Colgate penstock slope condition baseline",
    missionType: "Facade + inspection",
    siteName: "Colgate powerhouse approach",
    captureDate: "2026-03-10",
    lastUpdated: "2026-03-15T19:58:00Z",
    versionLabel: "v0.5 inspection draft",
    stage: "processing",
    areaAcres: 61,
    imageCount: 918,
    gsdCm: 1.4,
    coordinateSystem: "EPSG:26910 / NAD83 UTM Zone 10N",
    processingProfile: "Infrastructure inspection with dense cloud export",
    targetDevice: "Matrice 30T / Pilot 2",
    batteryPlan: "4 batteries · 3 split flights",
    compatibility: "Needs controller-specific install checklist",
    healthScore: 72,
    outputs: [
      { key: "orthomosaic", label: "Orthomosaic", status: "processing", format: "COG" },
      { key: "surface-model", label: "Surface model", status: "processing", format: "COG" },
      { key: "point-cloud", label: "Point cloud", status: "processing", format: "LAZ" },
      { key: "mesh", label: "Mesh", status: "missing", format: "3D Tiles" },
    ],
    blockers: [
      "Confirm image overlap on the upper slope before treating this as pilot-grade evidence.",
    ],
    warnings: [
      "Find-GCP marker detection flow not wired yet.",
      "Field handoff should include dry-run install mode.",
    ],
  },
  {
    id: "nevada-county-fairgrounds-aoi",
    name: "Nevada County Fairgrounds event logistics map",
    missionType: "Polygon grid",
    siteName: "Fairgrounds campus",
    captureDate: "2026-03-18",
    lastUpdated: "2026-03-15T18:22:00Z",
    versionLabel: "v0.3 planning draft",
    stage: "capture-planned",
    areaAcres: 27,
    imageCount: 0,
    gsdCm: 2.2,
    coordinateSystem: "EPSG:26910 / NAD83 UTM Zone 10N",
    processingProfile: "Venue-ready orthomosaic planning capture",
    targetDevice: "Mavic 3 Enterprise / Pilot 2",
    batteryPlan: "2 batteries · 1 split route",
    compatibility: "Ready for mission simulation, install helper pending",
    healthScore: 64,
    outputs: [
      { key: "orthomosaic", label: "Orthomosaic", status: "missing", format: "COG" },
      { key: "surface-model", label: "Surface model", status: "missing", format: "COG" },
      { key: "point-cloud", label: "Point cloud", status: "missing", format: "LAZ" },
      { key: "mesh", label: "Mesh", status: "missing", format: "3D Tiles" },
    ],
    blockers: [
      "Lock flight window, ground control plan, and deliverable scope before launch day.",
    ],
    warnings: [
      "Battery-aware splitting is still static demo logic.",
      "Terrain preview layer needs browser-side DEM sampling.",
    ],
  },
];

const DEMO_DATASETS: DatasetRecord[] = [
  {
    id: "dataset-gv-2026-03-12",
    name: "GV downtown corridor imagery",
    kind: "RGB image set",
    status: "ready",
    capturedAt: "2026-03-12T17:20:00Z",
    imageCount: 684,
    footprint: "42 acres / corridor coverage",
    finding: "EXIF and capture order reconstructed; ready for processing.",
  },
  {
    id: "dataset-colgate-2026-03-10",
    name: "Colgate slope inspection batch",
    kind: "RGB + inspection oblique",
    status: "flagged",
    capturedAt: "2026-03-10T16:05:00Z",
    imageCount: 918,
    footprint: "61 acres / hillside",
    finding: "Upper-slope overlap warning flagged for manual review.",
  },
  {
    id: "dataset-fairgrounds-brief",
    name: "Fairgrounds planning brief",
    kind: "Mission template",
    status: "uploading",
    capturedAt: "2026-03-15T22:00:00Z",
    imageCount: 0,
    footprint: "27 acres / event campus",
    finding: "Waiting on capture upload and field brief lock.",
  },
];

const DEMO_JOBS: JobRecord[] = [
  {
    id: "job-gv-dense-cloud",
    name: "GV corridor dense cloud refresh",
    engine: "ODM via NodeODM",
    stage: "Point cloud densification",
    status: "running",
    progress: 68,
    eta: "18 min",
    queuePosition: "Running now",
    startedAt: "2026-03-15T20:12:00Z",
    notes: "COG orthomosaic and DSM already emitted; mesh/3D Tiles follow-on still pending.",
  },
  {
    id: "job-colgate-baseline",
    name: "Colgate baseline processing",
    engine: "ODM / future ClusterODM lane",
    stage: "Preflight review",
    status: "needs_review",
    progress: 24,
    eta: "Needs operator decision",
    queuePosition: "Priority review",
    startedAt: "2026-03-15T19:34:00Z",
    notes: "Overlap warning should be cleared before full dense reconstruction.",
  },
  {
    id: "job-fairgrounds-sim",
    name: "Fairgrounds simulation package",
    engine: "Mission planner validation",
    stage: "Queueing export bundle",
    status: "queued",
    progress: 6,
    eta: "After capture brief approval",
    queuePosition: "Queue position 2",
    startedAt: "2026-03-15T18:47:00Z",
    notes: "Pending terrain preview recompute and PDF mission brief generation.",
  },
];

const DEMO_OUTPUTS: OutputArtifactRecord[] = [
  {
    id: "artifact-gv-ortho",
    name: "Downtown corridor orthomosaic",
    kind: "Raster deliverable",
    status: "ready",
    format: "COG + map tiles",
    delivery: "Internal QA share",
    sourceJob: "GV corridor dense cloud refresh",
  },
  {
    id: "artifact-gv-dsm",
    name: "Downtown surface model",
    kind: "Elevation",
    status: "ready",
    format: "COG",
    delivery: "Ready for TiTiler publishing",
    sourceJob: "GV corridor dense cloud refresh",
  },
  {
    id: "artifact-gv-point-cloud",
    name: "Downtown point cloud",
    kind: "3D",
    status: "processing",
    format: "LAZ / COPC target",
    delivery: "Hold for QA",
    sourceJob: "GV corridor dense cloud refresh",
  },
  {
    id: "artifact-colgate-brief",
    name: "Colgate install bundle",
    kind: "Mission package",
    status: "draft",
    format: "KMZ + PDF brief",
    delivery: "Needs controller validation",
    sourceJob: "Colgate baseline processing",
  },
];

const DEMO_ACTIVITY: ActivityEventRecord[] = [
  {
    id: "evt-upload-completed",
    at: "2026-03-15T20:19:00Z",
    type: "upload.completed",
    title: "GV corridor upload committed",
    detail: "684 images validated, thumbnails generated, capture map ready.",
  },
  {
    id: "evt-preflight-flagged",
    at: "2026-03-15T19:41:00Z",
    type: "preflight.flagged",
    title: "Colgate overlap warning",
    detail: "Upper-slope overlap dropped below the target threshold in one segment.",
  },
  {
    id: "evt-job-stage-changed",
    at: "2026-03-15T20:58:00Z",
    type: "job.stage.changed",
    title: "GV job entered dense cloud stage",
    detail: "Point cloud generation is underway; ETA refreshed to 18 minutes.",
  },
  {
    id: "evt-install-ready",
    at: "2026-03-15T18:55:00Z",
    type: "install.bundle.ready",
    title: "Fairgrounds mission brief draft generated",
    detail: "Export shell created, but terrain-following validation still needs server-side recompute.",
  },
];

function sumOutputsByStatus(
  missions: MissionRecord[],
  status: MissionOutputStatus,
) {
  return missions.flatMap((mission) => mission.outputs).filter((output) => output.status === status)
    .length;
}

function getMissionStageLabel(stage: MissionStage) {
  switch (stage) {
    case "capture-planned":
      return "Capture planned";
    case "processing":
      return "Processing";
    case "ready-for-qa":
      return "Ready for QA";
    default:
      return stage;
  }
}

export function buildMissionWorkspaceSnapshot(options: {
  orgName: string | null | undefined;
  tierId: string | null | undefined;
  role: DroneMembershipRole | null;
}): MissionWorkspaceSnapshot {
  const missions = DEMO_MISSIONS;
  const datasets = DEMO_DATASETS;
  const jobs = DEMO_JOBS;
  const outputArtifacts = DEMO_OUTPUTS;
  const activity = DEMO_ACTIVITY;
  const entitlementLabel = formatEntitlementTier(options.tierId);
  const missionCount = missions.length;
  const totalAcres = missions.reduce((total, mission) => total + mission.areaAcres, 0);
  const readyOutputCount = sumOutputsByStatus(missions, "ready");
  const outputsInProgressCount = sumOutputsByStatus(missions, "processing");
  const outputsMissingCount = sumOutputsByStatus(missions, "missing");
  const missionsNeedingAttention = missions.filter(
    (mission) => mission.stage !== "ready-for-qa" || mission.blockers.length > 0,
  ).length;
  const datasetCount = datasets.length;
  const activeJobCount = jobs.filter((job) => job.status !== "completed").length;

  const workspaceName = options.orgName?.trim()
    ? `${options.orgName} mission workspace`
    : "Mission workspace";

  const currentProjectName = options.orgName?.trim()
    ? `${options.orgName} aerial operations`
    : "Aerial operations";

  const statusChips: StatusChip[] = [
    {
      label: "Mission health",
      value: "2 stable · 1 needs review",
      tone: "info",
    },
    {
      label: "Terrain validation",
      value: "Browser preview only",
      tone: "warning",
    },
    {
      label: "Processing lane",
      value: "1 running · 1 queued",
      tone: "success",
    },
    {
      label: "Install readiness",
      value: "PDF brief + KMZ pending",
      tone: "warning",
    },
  ];

  const rail: WorkspaceRailSection[] = [
    {
      label: "Projects",
      items: [
        { label: currentProjectName, meta: "Active pilot", active: true },
        { label: "Nevada County demos", meta: "2 sites" },
      ],
    },
    {
      label: "Sites",
      items: [
        { label: "Grass Valley downtown", meta: "Corridor mapping" },
        { label: "Colgate powerhouse", meta: "Inspection" },
        { label: "Fairgrounds campus", meta: "Repeatable capture" },
      ],
    },
    {
      label: "Operations",
      items: [
        { label: "Missions", meta: `${missionCount} active`, active: true },
        { label: "Datasets", meta: `${datasetCount} tracked` },
        { label: "Jobs", meta: `${activeJobCount} live` },
        { label: "Outputs", meta: `${outputArtifacts.length} surfaced` },
      ],
    },
  ];

  const nextActions = [
    missions.find((mission) => mission.stage === "ready-for-qa")
      ? "Ship the next QA-ready mission slice by turning the downtown corridor run into the first real artifact review screen with COG/point-cloud status." 
      : null,
    missions.find((mission) => mission.stage === "processing")
      ? "Wire processing jobs to persistent Supabase records so preflight flags, queue state, logs, and artifact generation are no longer demo-only." 
      : null,
    missions.find((mission) => mission.stage === "capture-planned")
      ? "Promote the fairgrounds mission into a repeatable planning workflow with terrain-following validation, install bundle generation, and mission brief export." 
      : null,
    options.role === "owner" || options.role === "admin"
      ? `Use the ${entitlementLabel} lane to stand up project/site/mission/dataset/job tables before expanding billing or enterprise auth.`
      : "Escalate georeferencing, install, or entitlement blockers to your org owner before promising delivery timing.",
  ].filter((value): value is string => Boolean(value));

  return {
    workspaceLabel: workspaceName,
    entitlementLabel,
    currentProject: {
      name: currentProjectName,
      site: "Grass Valley downtown + Colgate pilot set",
      objective: "Turn the auth-first DroneOps shell into a real aerial operations OS covering planning, ingest, processing, delivery, and repeat capture.",
      terrainSource: "Browser DEM preview now · server-side canonical validator next",
      coordinateSystem: "EPSG:26910 / NAD83 UTM Zone 10N",
      collaborationStatus: "Single-operator prototype moving toward shared review and approvals",
    },
    rail,
    statusChips,
    missions,
    datasets,
    jobs,
    outputArtifacts,
    activity,
    totals: {
      missionCount,
      totalAcres,
      readyOutputCount,
      outputsInProgressCount,
      outputsMissingCount,
      missionsNeedingAttention,
      datasetCount,
      activeJobCount,
    },
    nextActions,
  };
}

export function formatMissionStage(stage: MissionStage) {
  return getMissionStageLabel(stage);
}

export function formatMissionOutputStatus(status: MissionOutputStatus) {
  switch (status) {
    case "ready":
      return "Ready";
    case "processing":
      return "Processing";
    case "missing":
      return "Missing";
    default:
      return status;
  }
}

export function formatDatasetStatus(status: DatasetRecord["status"]) {
  switch (status) {
    case "ready":
      return "Ready";
    case "uploading":
      return "Uploading";
    case "flagged":
      return "Flagged";
    default:
      return status;
  }
}

export function formatJobStatus(status: JobRecord["status"]) {
  switch (status) {
    case "running":
      return "Running";
    case "queued":
      return "Queued";
    case "needs_review":
      return "Needs review";
    case "completed":
      return "Completed";
    default:
      return status;
  }
}

export function formatOutputArtifactStatus(status: OutputArtifactRecord["status"]) {
  switch (status) {
    case "ready":
      return "Ready";
    case "processing":
      return "Processing";
    case "draft":
      return "Draft";
    default:
      return status;
  }
}
