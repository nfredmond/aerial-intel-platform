import { describe, expect, it } from "vitest";

import { getDatasetSpatialInsight, getMissionSpatialInsight } from "./gis-insights";

describe("gis-insights", () => {
  it("scores a strong mission posture higher than a fragile one", () => {
    const strong = getMissionSpatialInsight({
      missionType: "corridor",
      areaAcres: 12,
      imageCount: 320,
      gsdCm: 1.8,
      coordinateSystem: "EPSG:26910 / NAD83 UTM Zone 10N",
      warnings: [],
      blockers: [],
      availableExports: ["kmz", "install_bundle"],
      versionStatus: "approved",
      missionStatus: "validated",
    });

    const weak = getMissionSpatialInsight({
      missionType: "corridor",
      areaAcres: 42,
      imageCount: 180,
      gsdCm: 4,
      coordinateSystem: "EPSG:4326",
      warnings: ["terrain pending"],
      blockers: ["coverage gap"],
      availableExports: [],
      versionStatus: "draft",
      missionStatus: "draft",
    });

    expect(strong.score).toBeGreaterThan(weak.score);
    expect(strong.riskLevel).not.toBe("elevated");
    expect(weak.recommendations.length).toBeGreaterThan(0);
  });

  it("flags weaker preflight datasets lower than reviewed healthy datasets", () => {
    const reviewed = getDatasetSpatialInsight({
      datasetKind: "image",
      status: "ready",
      imageCount: 400,
      overlapFront: 82,
      overlapSide: 72,
      gcpCaptured: true,
      reviewed: true,
      findings: [],
    });

    const flagged = getDatasetSpatialInsight({
      datasetKind: "image",
      status: "preflight_flagged",
      imageCount: 60,
      overlapFront: 68,
      overlapSide: 58,
      gcpCaptured: false,
      reviewed: false,
      findings: ["low overlap", "low image count", "no GCPs"],
    });

    expect(reviewed.score).toBeGreaterThan(flagged.score);
    expect(flagged.riskLevel).toBe("elevated");
    expect(flagged.summary).toContain("review");
  });
});
