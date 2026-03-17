import type { SpatialInsight } from "@/lib/gis-insights";

export function buildMissionGisBrief(input: {
  missionName: string;
  projectName: string;
  missionType: string;
  areaAcres: number;
  imageCount: number;
  coordinateSystem: string;
  versionStatus: string;
  missionStatus: string;
  insight: SpatialInsight;
}) {
  const nextAction = input.insight.recommendations[0] ?? "Continue GIS QA review before client-facing delivery.";
  const qaPosture =
    input.insight.riskLevel === "low"
      ? "Planning-grade posture is strong."
      : input.insight.riskLevel === "moderate"
        ? "Usable, but still merits explicit GIS QA."
        : "Internal draft posture only until GIS issues are resolved.";

  return [
    `GIS Copilot Brief — ${input.missionName}`,
    `Project: ${input.projectName}`,
    `Mission type: ${input.missionType}`,
    `Mission status: ${input.missionStatus}`,
    `Version status: ${input.versionStatus}`,
    `Coverage: ${input.areaAcres} acres · ${input.imageCount} images`,
    `Coordinate system: ${input.coordinateSystem}`,
    `Spatial readiness score: ${input.insight.score}/100 (${input.insight.riskLevel})`,
    `Assessment: ${input.insight.summary}`,
    `QA posture: ${qaPosture}`,
    `Recommended next action: ${nextAction}`,
  ].join("\n");
}

export function buildDatasetGisBrief(input: {
  datasetName: string;
  projectName: string;
  missionName: string;
  datasetKind: string;
  status: string;
  imageCount: number;
  overlapFront?: number;
  overlapSide?: number;
  gcpCaptured?: boolean;
  insight: SpatialInsight;
}) {
  const nextAction = input.insight.recommendations[0] ?? "Advance to manual GIS QA before processing.";

  return [
    `GIS Copilot Brief — ${input.datasetName}`,
    `Project: ${input.projectName}`,
    `Mission: ${input.missionName}`,
    `Dataset kind: ${input.datasetKind}`,
    `Dataset status: ${input.status}`,
    `Capture: ${input.imageCount} images · front overlap ${input.overlapFront ?? "?"}% · side overlap ${input.overlapSide ?? "?"}%`,
    `Ground control captured: ${input.gcpCaptured ? "yes" : "no"}`,
    `Spatial readiness score: ${input.insight.score}/100 (${input.insight.riskLevel})`,
    `Assessment: ${input.insight.summary}`,
    `Recommended next action: ${nextAction}`,
  ].join("\n");
}
