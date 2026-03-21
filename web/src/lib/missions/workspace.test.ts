import { describe, expect, it } from "vitest";

import {
  buildMissionWorkspaceSnapshot,
  formatDatasetStatus,
  formatJobStatus,
  formatMissionOutputStatus,
  formatMissionStage,
  formatOutputArtifactStatus,
} from "./workspace";

describe("missions/workspace", () => {
  it("builds an aerial operations workspace summary with mission, ingest, and job totals", () => {
    const snapshot = buildMissionWorkspaceSnapshot({
      orgName: "Nat Ford Planning",
      tierId: "drone_professional",
      role: "admin",
    });

    expect(snapshot.workspaceLabel).toBe("Nat Ford Planning mission workspace");
    expect(snapshot.entitlementLabel).toBe("Drone Professional");
    expect(snapshot.currentProject.name).toBe("Nat Ford Planning aerial operations");
    expect(snapshot.rail).toHaveLength(3);
    expect(snapshot.statusChips).toHaveLength(6);
    expect(snapshot.statusChips.some((chip) => chip.label === "Proving lane")).toBe(true);
    expect(snapshot.provingHeartbeat.routePath).toBe("/api/internal/proving-heartbeat");
    expect(snapshot.provingHeartbeat.schedule).toBe("* * * * *");
    expect(snapshot.provingHeartbeat.evidenceKind).toBe("proving-job-activity");
    expect(snapshot.totals.missionCount).toBe(3);
    expect(snapshot.totals.totalAcres).toBe(130);
    expect(snapshot.totals.datasetCount).toBe(3);
    expect(snapshot.totals.activeJobCount).toBe(3);
    expect(snapshot.totals.runningProvingJobCount).toBe(1);
    expect(snapshot.totals.queuedProvingJobCount).toBe(0);
    expect(snapshot.totals.completedProvingJobCount).toBe(0);
    expect(snapshot.totals.readyOutputCount).toBe(2);
    expect(snapshot.totals.outputsInProgressCount).toBe(4);
    expect(snapshot.totals.outputsMissingCount).toBe(6);
    expect(snapshot.totals.handoffBacklogCount).toBe(2);
    expect(snapshot.totals.exportedArtifactCount).toBe(0);
    expect(snapshot.v1Readiness.percent).toBeGreaterThan(0);
    expect(snapshot.v1Readiness.items).toHaveLength(6);
    expect(snapshot.v1Readiness.statusLabel).toBeTruthy();
    expect(snapshot.nextActions[0]).toContain("artifact handoff backlog");
    expect(snapshot.nextActions.at(-1)).toContain("stand up project/site/mission/dataset/job tables");
  });

  it("falls back to a generic workspace label and analyst guidance", () => {
    const snapshot = buildMissionWorkspaceSnapshot({
      orgName: null,
      tierId: null,
      role: "analyst",
    });

    expect(snapshot.workspaceLabel).toBe("Mission workspace");
    expect(snapshot.entitlementLabel).toBe("Unknown tier");
    expect(snapshot.currentProject.name).toBe("Aerial operations");
    expect(snapshot.provingHeartbeat.statusLabel).toBe("Awaiting durable heartbeat proof");
    expect(snapshot.nextActions.at(-1)).toContain("org owner");
  });

  it("formats stage and operational statuses into human labels", () => {
    expect(formatMissionStage("capture-planned")).toBe("Capture planned");
    expect(formatMissionStage("ready-for-qa")).toBe("Ready for QA");
    expect(formatMissionOutputStatus("processing")).toBe("Processing");
    expect(formatMissionOutputStatus("missing")).toBe("Missing");
    expect(formatDatasetStatus("flagged")).toBe("Flagged");
    expect(formatJobStatus("needs_review")).toBe("Needs review");
    expect(formatOutputArtifactStatus("draft")).toBe("Draft");
  });
});
