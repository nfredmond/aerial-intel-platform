import type { DroneMembershipRole } from "@/lib/supabase/types";

import { formatEntitlementTier } from "@/lib/auth/access-insights";

export type MissionStage = "capture-planned" | "processing" | "ready-for-qa";
export type MissionOutputStatus = "ready" | "processing" | "missing";

export type MissionOutput = {
  key: "orthomosaic" | "surface-model" | "point-cloud" | "mesh";
  label: string;
  status: MissionOutputStatus;
  format: string;
};

export type MissionRecord = {
  id: string;
  name: string;
  siteName: string;
  captureDate: string;
  stage: MissionStage;
  areaAcres: number;
  imageCount: number;
  gsdCm: number;
  coordinateSystem: string;
  processingProfile: string;
  outputs: MissionOutput[];
  blockers: string[];
};

export type MissionWorkspaceSnapshot = {
  workspaceLabel: string;
  entitlementLabel: string;
  missions: MissionRecord[];
  totals: {
    missionCount: number;
    totalAcres: number;
    readyOutputCount: number;
    outputsInProgressCount: number;
    outputsMissingCount: number;
    missionsNeedingAttention: number;
  };
  nextActions: string[];
};

const DEMO_MISSIONS: MissionRecord[] = [
  {
    id: "gv-downtown-corridor",
    name: "Grass Valley downtown curb inventory",
    siteName: "Main Street to Neal Street",
    captureDate: "2026-03-12",
    stage: "ready-for-qa",
    areaAcres: 42,
    imageCount: 684,
    gsdCm: 1.8,
    coordinateSystem: "EPSG:26910 / NAD83 UTM Zone 10N",
    processingProfile: "Urban corridor orthomosaic + DSM",
    outputs: [
      { key: "orthomosaic", label: "Orthomosaic", status: "ready", format: "GeoTIFF" },
      { key: "surface-model", label: "Surface model", status: "ready", format: "GeoTIFF" },
      { key: "point-cloud", label: "Point cloud", status: "processing", format: "LAZ" },
      { key: "mesh", label: "Mesh", status: "missing", format: "OBJ" },
    ],
    blockers: [
      "Run final QA on curb/striping edge sharpness before client export.",
    ],
  },
  {
    id: "colgate-penstock-phase-1",
    name: "Colgate penstock slope condition baseline",
    siteName: "Colgate powerhouse approach",
    captureDate: "2026-03-10",
    stage: "processing",
    areaAcres: 61,
    imageCount: 918,
    gsdCm: 1.4,
    coordinateSystem: "EPSG:26910 / NAD83 UTM Zone 10N",
    processingProfile: "Infrastructure inspection with dense cloud export",
    outputs: [
      { key: "orthomosaic", label: "Orthomosaic", status: "processing", format: "GeoTIFF" },
      { key: "surface-model", label: "Surface model", status: "processing", format: "GeoTIFF" },
      { key: "point-cloud", label: "Point cloud", status: "processing", format: "LAZ" },
      { key: "mesh", label: "Mesh", status: "missing", format: "OBJ" },
    ],
    blockers: [
      "Confirm image overlap on the upper slope before treating this as pilot-grade evidence.",
    ],
  },
  {
    id: "nevada-county-fairgrounds-aoi",
    name: "Nevada County Fairgrounds event logistics map",
    siteName: "Fairgrounds campus",
    captureDate: "2026-03-18",
    stage: "capture-planned",
    areaAcres: 27,
    imageCount: 0,
    gsdCm: 2.2,
    coordinateSystem: "EPSG:26910 / NAD83 UTM Zone 10N",
    processingProfile: "Venue-ready orthomosaic planning capture",
    outputs: [
      { key: "orthomosaic", label: "Orthomosaic", status: "missing", format: "GeoTIFF" },
      { key: "surface-model", label: "Surface model", status: "missing", format: "GeoTIFF" },
      { key: "point-cloud", label: "Point cloud", status: "missing", format: "LAZ" },
      { key: "mesh", label: "Mesh", status: "missing", format: "OBJ" },
    ],
    blockers: [
      "Lock flight window, ground control plan, and deliverable scope before launch day.",
    ],
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
  const entitlementLabel = formatEntitlementTier(options.tierId);
  const missionCount = missions.length;
  const totalAcres = missions.reduce((total, mission) => total + mission.areaAcres, 0);
  const readyOutputCount = sumOutputsByStatus(missions, "ready");
  const outputsInProgressCount = sumOutputsByStatus(missions, "processing");
  const outputsMissingCount = sumOutputsByStatus(missions, "missing");
  const missionsNeedingAttention = missions.filter(
    (mission) => mission.stage !== "ready-for-qa" || mission.blockers.length > 0,
  ).length;

  const nextActions = [
    missions.find((mission) => mission.stage === "ready-for-qa")
      ? "Validate the next QA-ready mission against orthomosaic seamlines, DSM artifacts, and site control before export."
      : null,
    missions.find((mission) => mission.stage === "processing")
      ? "Review in-flight processing runs and confirm the required delivery set includes orthomosaic, DSM, and point cloud outputs."
      : null,
    missions.find((mission) => mission.stage === "capture-planned")
      ? "Turn the planned capture into a locked field brief with launch window, overlap target, and control strategy."
      : null,
    options.role === "owner" || options.role === "admin"
      ? `Use your ${entitlementLabel} plan to assign analysts/viewers before client handoff so QA and review do not bottleneck on one operator.`
      : "Escalate georeferencing gaps or export blockers to your org owner before promising delivery timing.",
  ].filter((value): value is string => Boolean(value));

  return {
    workspaceLabel: options.orgName?.trim() ? `${options.orgName} mission workspace` : "Mission workspace",
    entitlementLabel,
    missions,
    totals: {
      missionCount,
      totalAcres,
      readyOutputCount,
      outputsInProgressCount,
      outputsMissingCount,
      missionsNeedingAttention,
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
