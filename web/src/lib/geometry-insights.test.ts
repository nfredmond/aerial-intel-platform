import { describe, expect, it } from "vitest";

import {
  getDatasetCoverageInsight,
  getMissionGeometryInsight,
  getTerrainInsight,
} from "./geometry-insights";

describe("geometry-insights", () => {
  it("derives geometry metrics from a simple polygon", () => {
    const insight = getMissionGeometryInsight({
      geometry: {
        type: "Polygon",
        coordinates: [[
          [-121.0, 39.0],
          [-121.0, 39.01],
          [-120.99, 39.01],
          [-120.99, 39.0],
          [-121.0, 39.0],
        ]],
      },
      fallbackAreaAcres: 0,
      missionType: "polygon",
    });

    expect(insight.hasGeometry).toBe(true);
    expect(insight.areaAcres).toBeGreaterThan(0);
    expect(insight.bboxLabel).toContain("m ×");
  });

  it("gracefully handles missing geometry", () => {
    const insight = getDatasetCoverageInsight({
      geometry: null,
      status: "preflight_flagged",
    });

    expect(insight.hasGeometry).toBe(false);
    expect(insight.summary).toContain("not attached yet");
    expect(insight.recommendations.length).toBeGreaterThan(0);
  });

  it("raises terrain concern when terrain warnings are present", () => {
    const calm = getTerrainInsight({
      areaAcres: 10,
      gsdCm: 3,
      missionType: "polygon",
      warnings: [],
    });

    const rough = getTerrainInsight({
      areaAcres: 60,
      gsdCm: 1.8,
      missionType: "corridor",
      warnings: ["Terrain-following validation still pending."],
    });

    expect(rough.score).toBeLessThan(calm.score);
    expect(rough.recommendations.join(" ")).toContain("terrain");
  });
});
