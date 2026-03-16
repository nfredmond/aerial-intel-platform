import { describe, expect, it } from "vitest";

import {
  buildMissionWorkspaceSnapshot,
  formatMissionOutputStatus,
  formatMissionStage,
} from "./workspace";

describe("missions/workspace", () => {
  it("builds a mission workspace summary with GIS/drone totals", () => {
    const snapshot = buildMissionWorkspaceSnapshot({
      orgName: "Nat Ford Planning",
      tierId: "drone_professional",
      role: "admin",
    });

    expect(snapshot.workspaceLabel).toBe("Nat Ford Planning mission workspace");
    expect(snapshot.entitlementLabel).toBe("Drone Professional");
    expect(snapshot.totals.missionCount).toBe(3);
    expect(snapshot.totals.totalAcres).toBe(130);
    expect(snapshot.totals.readyOutputCount).toBe(2);
    expect(snapshot.totals.outputsInProgressCount).toBe(4);
    expect(snapshot.totals.outputsMissingCount).toBe(6);
    expect(snapshot.nextActions[0]).toContain("QA-ready mission");
    expect(snapshot.nextActions.at(-1)).toContain("assign analysts/viewers");
  });

  it("falls back to a generic workspace label and analyst guidance", () => {
    const snapshot = buildMissionWorkspaceSnapshot({
      orgName: null,
      tierId: null,
      role: "analyst",
    });

    expect(snapshot.workspaceLabel).toBe("Mission workspace");
    expect(snapshot.entitlementLabel).toBe("Unknown tier");
    expect(snapshot.nextActions.at(-1)).toContain("org owner");
  });

  it("formats stage and output statuses into human labels", () => {
    expect(formatMissionStage("capture-planned")).toBe("Capture planned");
    expect(formatMissionStage("ready-for-qa")).toBe("Ready for QA");
    expect(formatMissionOutputStatus("processing")).toBe("Processing");
    expect(formatMissionOutputStatus("missing")).toBe("Missing");
  });
});
