import { describe, expect, it } from "vitest";

import {
  buildProvingHeartbeatSummary,
  PROVING_HEARTBEAT_CRON_SCHEDULE,
  PROVING_HEARTBEAT_ROUTE_PATH,
} from "./proving-heartbeat";

describe("proving-heartbeat", () => {
  it("prefers durable worker-heartbeat evidence when available", () => {
    const summary = buildProvingHeartbeatSummary({
      queuedProvingJobCount: 0,
      runningProvingJobCount: 1,
      completedProvingJobCount: 0,
      latestWorkerHeartbeatAt: "2026-03-20T17:41:00.000Z",
      latestWorkerHeartbeatSummary: "GV corridor dense cloud refresh advanced from the worker heartbeat lane.",
      latestWorkerHeartbeatDetail: "Worker heartbeat advanced the proving run to active processing from worker heartbeat.",
      latestProvingJobActivityAt: "2026-03-20T17:41:00.000Z",
    });

    expect(summary.routePath).toBe(PROVING_HEARTBEAT_ROUTE_PATH);
    expect(summary.schedule).toBe(PROVING_HEARTBEAT_CRON_SCHEDULE);
    expect(summary.evidenceKind).toBe("worker-heartbeat-event");
    expect(summary.statusLabel).toBe("Heartbeat proving active");
    expect(summary.tone).toBe("success");
  });

  it("falls back to proving job activity when no persisted heartbeat event exists", () => {
    const summary = buildProvingHeartbeatSummary({
      queuedProvingJobCount: 1,
      runningProvingJobCount: 0,
      completedProvingJobCount: 0,
      latestProvingJobActivityAt: "2026-03-20T17:39:00.000Z",
      latestProvingJobActivitySummary: "GV corridor dense cloud refresh is the latest proving-lane activity signal.",
      latestProvingJobActivityDetail: "Latest proving job status is queued at stage submitted.",
    });

    expect(summary.evidenceKind).toBe("proving-job-activity");
    expect(summary.statusLabel).toBe("Awaiting durable heartbeat proof");
    expect(summary.lastSignalSummary).toContain("latest proving-lane activity signal");
  });

  it("calls out the honest gap when no proving evidence exists yet", () => {
    const summary = buildProvingHeartbeatSummary({
      queuedProvingJobCount: 0,
      runningProvingJobCount: 0,
      completedProvingJobCount: 0,
    });

    expect(summary.evidenceKind).toBe("none");
    expect(summary.lastSignalAt).toBeNull();
    expect(summary.lastSignalDetail).toContain("honest gap");
  });
});
