export type OverlayPriority = "high" | "medium" | "low";

export type OverlayRecommendation = {
  id: string;
  label: string;
  priority: OverlayPriority;
  rationale: string;
};

export type OverlayPlan = {
  summary: string;
  recommendations: OverlayRecommendation[];
};

function upsertRecommendation(
  map: Map<string, OverlayRecommendation>,
  recommendation: OverlayRecommendation,
) {
  const existing = map.get(recommendation.id);

  if (!existing) {
    map.set(recommendation.id, recommendation);
    return;
  }

  const rank = { high: 3, medium: 2, low: 1 } as const;
  if (rank[recommendation.priority] > rank[existing.priority]) {
    map.set(recommendation.id, recommendation);
  }
}

export function getMissionOverlayPlan(input: {
  missionType: string;
  areaAcres: number;
  geometryAttached: boolean;
  terrainRiskLevel: "low" | "moderate" | "elevated";
  missionStatus: string;
  installBundleReady: boolean;
}) {
  const recommendations = new Map<string, OverlayRecommendation>();
  const missionType = input.missionType.toLowerCase();
  const areaAcres = Number.isFinite(input.areaAcres) ? input.areaAcres : 0;

  if (!input.geometryAttached) {
    upsertRecommendation(recommendations, {
      id: "aoi-geometry",
      label: "AOI / mission boundary",
      priority: "high",
      rationale: "Attach real mission geometry first so every other overlay review is tied to an actual footprint instead of notes-only assumptions.",
    });
  }

  upsertRecommendation(recommendations, {
    id: "parcels",
    label: "Parcels / ownership",
    priority: areaAcres > 5 ? "high" : "medium",
    rationale: "Parcel context helps convert drone outputs into planning-grade exhibits, ownership-aware notes, and defensible client handoffs.",
  });

  if (missionType.includes("corridor")) {
    upsertRecommendation(recommendations, {
      id: "roads",
      label: "Road centerlines / ROW",
      priority: "high",
      rationale: "Corridor missions should be checked against actual centerlines and right-of-way context before claiming complete coverage or install readiness.",
    });

    upsertRecommendation(recommendations, {
      id: "utilities",
      label: "Utilities / easements",
      priority: "high",
      rationale: "Linear missions often intersect utilities and easements, so these layers matter for field install logic and client-safe interpretation.",
    });
  }

  if (missionType.includes("inspection") || missionType.includes("facade") || missionType.includes("orbit")) {
    upsertRecommendation(recommendations, {
      id: "assets",
      label: "Asset inventory / target features",
      priority: "high",
      rationale: "Inspection-style missions benefit from explicit target inventories so imagery, findings, and deliverables map back to real assets instead of ad hoc screenshots.",
    });
  }

  if (areaAcres >= 15 || missionType.includes("polygon")) {
    upsertRecommendation(recommendations, {
      id: "hydrology",
      label: "Flood / drainage / hydrology",
      priority: input.terrainRiskLevel === "elevated" ? "high" : "medium",
      rationale: "Larger-area and terrain-sensitive missions should be checked against drainage and flood context before terrain or access conclusions are treated as complete.",
    });

    upsertRecommendation(recommendations, {
      id: "environmental",
      label: "Habitat / fire / vegetation constraints",
      priority: areaAcres >= 30 ? "high" : "medium",
      rationale: "Broad-area missions are more likely to overlap constraint layers that matter for planning, permitting, and client-safe interpretation.",
    });
  }

  if (input.terrainRiskLevel !== "low") {
    upsertRecommendation(recommendations, {
      id: "topography",
      label: "Contours / hillshade / terrain",
      priority: "high",
      rationale: "Terrain risk is already visible in the mission signals, so topographic overlays should be part of QA before install or delivery claims.",
    });
  }

  if (input.installBundleReady || input.missionStatus === "validated" || input.missionStatus === "delivered") {
    upsertRecommendation(recommendations, {
      id: "admin",
      label: "Administrative / permit boundaries",
      priority: "medium",
      rationale: "As the mission approaches install or delivery, admin boundaries help keep handoff language client-safe and operationally precise.",
    });
  }

  const ordered = Array.from(recommendations.values()).sort((left, right) => {
    const rank = { high: 3, medium: 2, low: 1 } as const;
    return rank[right.priority] - rank[left.priority] || left.label.localeCompare(right.label);
  });

  const highCount = ordered.filter((item) => item.priority === "high").length;
  const summary = highCount >= 3
    ? "This mission now has a real GIS overlay plan: multiple high-priority layers should be reviewed before delivery or field handoff." 
    : highCount >= 1
      ? "This mission has a focused GIS overlay plan, with a few high-priority layers driving the next review pass."
      : "This mission can proceed with a lighter GIS overlay review, but core boundary/context layers still matter.";

  return {
    summary,
    recommendations: ordered,
  } satisfies OverlayPlan;
}

export function buildMissionOverlayChecklist(input: {
  missionName: string;
  projectName: string;
  recommendations: OverlayRecommendation[];
}) {
  return [
    `GIS Overlay Checklist — ${input.missionName}`,
    `Project: ${input.projectName}`,
    ...input.recommendations.map((item) => `- [${item.priority.toUpperCase()}] ${item.label}: ${item.rationale}`),
  ].join("\n");
}
