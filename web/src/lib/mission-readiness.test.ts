import { describe, expect, it } from "vitest";

import { buildMissionReadinessChecklist, getMissionReadinessSummary } from "./mission-readiness";

describe("mission-readiness", () => {
  it("summarizes readiness progress", () => {
    const readiness = getMissionReadinessSummary({
      hasMissionGeometry: true,
      datasetCount: 1,
      primaryDatasetHasGeometry: true,
      primaryDatasetReady: true,
      jobCount: 2,
      readyOutputCount: 4,
      installBundleReady: true,
      versionApproved: true,
      installConfirmed: false,
      overlayReviewedCount: 3,
      overlayTotalCount: 4,
      delivered: false,
    });

    expect(readiness.completeCount).toBeGreaterThan(0);
    expect(readiness.percent).toBeGreaterThan(50);
    expect(readiness.steps).toHaveLength(11);
  });

  it("builds a copyable checklist", () => {
    const checklist = buildMissionReadinessChecklist({
      missionName: "Downtown corridor baseline",
      steps: [
        {
          id: "aoi",
          label: "Attach mission AOI geometry",
          done: true,
          detail: "AOI geometry is attached.",
        },
      ],
    });

    expect(checklist).toContain("Mission Readiness Checklist");
    expect(checklist).toContain("[x] Attach mission AOI geometry");
  });
});
