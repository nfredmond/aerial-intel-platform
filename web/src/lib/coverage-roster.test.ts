import { describe, expect, it } from "vitest";

import { buildCoverageRosterSummary, getCoverageRoster } from "./coverage-roster";

describe("coverage-roster", () => {
  it("sorts comparable datasets ahead of datasets without geometry", () => {
    const missionGeometry = {
      type: "Polygon",
      coordinates: [[[-121, 39], [-121, 39.02], [-120.98, 39.02], [-120.98, 39], [-121, 39]]],
    };

    const roster = getCoverageRoster({
      missionGeometry,
      datasets: [
        {
          id: "no-geom",
          name: "No geometry dataset",
          status: "ready",
          spatialFootprint: null,
        },
        {
          id: "geom",
          name: "Comparable dataset",
          status: "ready",
          spatialFootprint: {
            type: "Polygon",
            coordinates: [[[-121, 39], [-121, 39.015], [-120.985, 39.015], [-120.985, 39], [-121, 39]]],
          },
        },
      ],
    });

    expect(roster[0]?.id).toBe("geom");
    expect(roster[0]?.coveragePercent).toBeGreaterThan(0);
    expect(roster[1]?.comparable).toBe(false);
  });

  it("builds a copyable summary", () => {
    const summary = buildCoverageRosterSummary({
      missionName: "Downtown corridor baseline",
      items: [
        {
          id: "geom",
          name: "Comparable dataset",
          status: "ready",
          comparable: true,
          coveragePercent: 83.2,
          overlapAreaAcres: 12.5,
          summary: "Coverage looks materially present.",
        },
      ],
    });

    expect(summary).toContain("Dataset Coverage Roster");
    expect(summary).toContain("83.2%");
  });
});
