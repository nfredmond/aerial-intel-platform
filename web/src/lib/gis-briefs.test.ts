import { describe, expect, it } from "vitest";

import { buildDatasetGisBrief, buildMissionGisBrief } from "./gis-briefs";

describe("gis-briefs", () => {
  it("builds a mission GIS brief with the key planning fields", () => {
    const brief = buildMissionGisBrief({
      missionName: "Downtown corridor baseline",
      projectName: "Grass Valley downtown pilot",
      missionType: "corridor",
      areaAcres: 42,
      imageCount: 684,
      coordinateSystem: "EPSG:26910 / NAD83 UTM Zone 10N",
      versionStatus: "approved",
      missionStatus: "validated",
      insight: {
        score: 84,
        riskLevel: "low",
        summary: "Spatial posture is strong enough for planning-grade delivery.",
        recommendations: ["Proceed to delivery QA."],
      },
    });

    expect(brief).toContain("GIS Copilot Brief");
    expect(brief).toContain("Spatial readiness score: 84/100");
    expect(brief).toContain("Proceed to delivery QA.");
  });

  it("builds a dataset GIS brief with capture details", () => {
    const brief = buildDatasetGisBrief({
      datasetName: "Downtown imagery batch",
      projectName: "Grass Valley downtown pilot",
      missionName: "Downtown corridor baseline",
      datasetKind: "image",
      status: "preflight_flagged",
      imageCount: 96,
      overlapFront: 70,
      overlapSide: 60,
      gcpCaptured: false,
      insight: {
        score: 51,
        riskLevel: "elevated",
        summary: "Dataset needs explicit GIS/operator review.",
        recommendations: ["Review overlap before processing."],
      },
    });

    expect(brief).toContain("Dataset status: preflight_flagged");
    expect(brief).toContain("Ground control captured: no");
    expect(brief).toContain("Review overlap before processing.");
  });
});
