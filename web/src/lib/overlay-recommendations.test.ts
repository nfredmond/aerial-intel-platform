import { describe, expect, it } from "vitest";

import {
  buildMissionOverlayChecklist,
  getMissionOverlayPlan,
} from "./overlay-recommendations";

describe("overlay-recommendations", () => {
  it("prioritizes corridor overlays appropriately", () => {
    const plan = getMissionOverlayPlan({
      missionType: "corridor",
      areaAcres: 22,
      geometryAttached: true,
      terrainRiskLevel: "moderate",
      missionStatus: "validated",
      installBundleReady: true,
    });

    expect(plan.recommendations.some((item) => item.id === "roads" && item.priority === "high")).toBe(true);
    expect(plan.recommendations.some((item) => item.id === "utilities" && item.priority === "high")).toBe(true);
    expect(plan.recommendations.some((item) => item.id === "topography")).toBe(true);
  });

  it("builds a copyable overlay checklist", () => {
    const checklist = buildMissionOverlayChecklist({
      missionName: "Downtown corridor baseline",
      projectName: "Grass Valley pilot",
      recommendations: [
        {
          id: "roads",
          label: "Road centerlines / ROW",
          priority: "high",
          rationale: "Needed for corridor QA.",
        },
      ],
    });

    expect(checklist).toContain("GIS Overlay Checklist");
    expect(checklist).toContain("[HIGH] Road centerlines / ROW");
  });
});
