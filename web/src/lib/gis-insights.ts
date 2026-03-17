type RiskLevel = "low" | "moderate" | "elevated";

type MissionInsightInput = {
  missionType: string;
  areaAcres: number;
  imageCount: number;
  gsdCm: number;
  coordinateSystem: string;
  warnings: string[];
  blockers: string[];
  availableExports: string[];
  versionStatus?: string;
  missionStatus?: string;
};

type DatasetInsightInput = {
  datasetKind: string;
  status: string;
  imageCount: number;
  overlapFront?: number;
  overlapSide?: number;
  gcpCaptured?: boolean;
  reviewed?: boolean;
  findings: string[];
};

export type SpatialInsight = {
  score: number;
  riskLevel: RiskLevel;
  summary: string;
  recommendations: string[];
};

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function toRiskLevel(score: number): RiskLevel {
  if (score >= 80) return "low";
  if (score >= 60) return "moderate";
  return "elevated";
}

export function getMissionSpatialInsight(input: MissionInsightInput): SpatialInsight {
  const recommendations: string[] = [];
  let score = 72;

  const acres = Number.isFinite(input.areaAcres) ? input.areaAcres : 0;
  const imageCount = Number.isFinite(input.imageCount) ? input.imageCount : 0;
  const density = acres > 0 ? imageCount / acres : 0;

  if (input.missionType.toLowerCase().includes("corridor") && acres > 25) {
    recommendations.push("Large corridor mission: keep flight blocks segmented so field re-fly and deliverable QA stay manageable.");
    score -= 6;
  }

  if (input.gsdCm > 0 && input.gsdCm <= 2.5) {
    recommendations.push("High-resolution capture target: plan for heavier orthomosaic/DSM artifacts and longer QA cycles.");
    score += 4;
  }

  if (density > 0 && density < 12) {
    recommendations.push("Capture density looks light for production mapping; review overlap and missed coverage before processing promises.");
    score -= 10;
  } else if (density >= 18) {
    recommendations.push("Image density looks healthy for strong reconstruction and cleaner seam handling.");
    score += 8;
  }

  if (/epsg:269|utm/i.test(input.coordinateSystem)) {
    recommendations.push("Projected coordinate system is already planner-friendly for distance/area deliverables.");
    score += 6;
  } else if (input.coordinateSystem && !/unknown/i.test(input.coordinateSystem)) {
    recommendations.push("Consider exporting a projected deliverable in addition to geographic coordinates for field and CAD use.");
  }

  if (input.availableExports.includes("install_bundle")) {
    recommendations.push("Install bundle is available, so field deployment and repeat capture can be tracked as a real operational loop.");
    score += 5;
  }

  if (input.blockers.length > 0) {
    score -= Math.min(18, input.blockers.length * 6);
    recommendations.push("Resolve current blockers before promising client-ready spatial deliverables.");
  }

  if (input.warnings.length > 0) {
    score -= Math.min(12, input.warnings.length * 4);
    recommendations.push("Warnings indicate the mission should stay in GIS QA review, not automatic delivery mode.");
  }

  if (input.versionStatus === "approved" || input.versionStatus === "installed") {
    score += 6;
  }

  if (input.missionStatus === "delivered") {
    score += 5;
  }

  const finalScore = clampScore(score);
  const riskLevel = toRiskLevel(finalScore);
  const summary =
    riskLevel === "low"
      ? "Spatial posture is strong enough for planning-grade delivery, with only normal QA discipline needed."
      : riskLevel === "moderate"
        ? "Spatial posture is workable, but this mission still benefits from explicit GIS QA before delivery or repeat-flight reuse."
        : "Spatial posture is fragile right now; use the mission as an internal draft until GIS QA issues are resolved.";

  return {
    score: finalScore,
    riskLevel,
    summary,
    recommendations,
  };
}

export function getDatasetSpatialInsight(input: DatasetInsightInput): SpatialInsight {
  const recommendations: string[] = [];
  let score = 68;

  if (input.status === "preflight_flagged") {
    score -= 18;
    recommendations.push("Dataset is preflight-flagged and should stay in review until findings are cleared or explicitly accepted.");
  }

  if (input.reviewed) {
    score += 10;
    recommendations.push("A reviewer has already accepted the preflight posture, which reduces operational ambiguity.");
  }

  if (typeof input.overlapFront === "number") {
    if (input.overlapFront >= 80) {
      score += 7;
    } else if (input.overlapFront < 75) {
      score -= 10;
      recommendations.push("Front overlap is below the usual mapping comfort zone; corridor continuity risk is higher.");
    }
  }

  if (typeof input.overlapSide === "number") {
    if (input.overlapSide >= 70) {
      score += 6;
    } else if (input.overlapSide < 65) {
      score -= 10;
      recommendations.push("Side overlap is below the normal mapping target; seamline and hole risk is elevated.");
    }
  }

  if (input.gcpCaptured) {
    score += 8;
    recommendations.push("Ground control recorded: stronger footing for survey-adjacent or repeatable GIS alignment workflows.");
  } else {
    recommendations.push("No ground control recorded: keep positional claims qualified unless another control source exists.");
  }

  if (input.imageCount >= 250) {
    score += 6;
  } else if (input.imageCount > 0 && input.imageCount < 100) {
    score -= 8;
    recommendations.push("Low image count means the capture may be fine for quick context, but not automatically robust for dense reconstruction.");
  }

  if (input.datasetKind !== "image") {
    recommendations.push(`Dataset kind is ${input.datasetKind}; some GIS QA assumptions here are tuned for image mapping first.`);
  }

  if (input.findings.length > 2) {
    score -= 6;
  }

  const finalScore = clampScore(score);
  const riskLevel = toRiskLevel(finalScore);
  const summary =
    riskLevel === "low"
      ? "Dataset looks spatially healthy for downstream processing and GIS packaging."
      : riskLevel === "moderate"
        ? "Dataset is usable, but a planner/GIS review is still worth doing before production delivery."
        : "Dataset needs explicit GIS/operator review before it should drive processing or delivery commitments.";

  return {
    score: finalScore,
    riskLevel,
    summary,
    recommendations,
  };
}
