export type ProvingHeartbeatEvidenceKind = "worker-heartbeat-event" | "proving-job-activity" | "none";
export type ProvingHeartbeatTone = "success" | "info" | "warning";

export type ProvingHeartbeatSummary = {
  routePath: string;
  schedule: string;
  cadenceLabel: string;
  schedulePosture: string;
  authModeLabel: string;
  routeAvailable: boolean;
  statusLabel: string;
  tone: ProvingHeartbeatTone;
  evidenceKind: ProvingHeartbeatEvidenceKind;
  evidenceLabel: string;
  lastSignalAt: string | null;
  lastSignalSummary: string;
  lastSignalDetail: string;
};

export const PROVING_HEARTBEAT_ROUTE_PATH = "/api/internal/proving-heartbeat";
export const PROVING_HEARTBEAT_CRON_SCHEDULE = "* * * * *";

export function getProvingHeartbeatCadenceLabel(schedule: string) {
  return schedule === "* * * * *" ? "Every minute via Vercel cron" : `Cron schedule ${schedule}`;
}

export function getProvingHeartbeatAuthModeLabel() {
  return "Bearer CRON_SECRET when configured; otherwise Vercel cron user-agent";
}

export function buildProvingHeartbeatSummary(input: {
  queuedProvingJobCount: number;
  runningProvingJobCount: number;
  completedProvingJobCount: number;
  latestWorkerHeartbeatAt?: string | null;
  latestWorkerHeartbeatSummary?: string | null;
  latestWorkerHeartbeatDetail?: string | null;
  latestProvingJobActivityAt?: string | null;
  latestProvingJobActivitySummary?: string | null;
  latestProvingJobActivityDetail?: string | null;
}): ProvingHeartbeatSummary {
  const cadenceLabel = getProvingHeartbeatCadenceLabel(PROVING_HEARTBEAT_CRON_SCHEDULE);
  const activeProvingJobCount = input.queuedProvingJobCount + input.runningProvingJobCount;
  const routeAvailable = true;

  if (input.latestWorkerHeartbeatAt) {
    return {
      routePath: PROVING_HEARTBEAT_ROUTE_PATH,
      schedule: PROVING_HEARTBEAT_CRON_SCHEDULE,
      cadenceLabel,
      schedulePosture: `${cadenceLabel} on ${PROVING_HEARTBEAT_ROUTE_PATH}`,
      authModeLabel: getProvingHeartbeatAuthModeLabel(),
      routeAvailable,
      statusLabel: activeProvingJobCount > 0 ? "Heartbeat proving active" : "Heartbeat proven",
      tone: activeProvingJobCount > 0 ? "success" : "info",
      evidenceKind: "worker-heartbeat-event",
      evidenceLabel: "Durable worker-heartbeat event",
      lastSignalAt: input.latestWorkerHeartbeatAt,
      lastSignalSummary: input.latestWorkerHeartbeatSummary ?? "Worker heartbeat touched the proving lane.",
      lastSignalDetail:
        input.latestWorkerHeartbeatDetail
        ?? "The last persisted proving-lane automation signal came from the worker heartbeat path.",
    };
  }

  if (input.latestProvingJobActivityAt) {
    return {
      routePath: PROVING_HEARTBEAT_ROUTE_PATH,
      schedule: PROVING_HEARTBEAT_CRON_SCHEDULE,
      cadenceLabel,
      schedulePosture: `${cadenceLabel} on ${PROVING_HEARTBEAT_ROUTE_PATH}`,
      authModeLabel: getProvingHeartbeatAuthModeLabel(),
      routeAvailable,
      statusLabel: activeProvingJobCount > 0 ? "Awaiting durable heartbeat proof" : "Heartbeat route configured",
      tone: activeProvingJobCount > 0 ? "warning" : input.completedProvingJobCount > 0 ? "info" : "warning",
      evidenceKind: "proving-job-activity",
      evidenceLabel: "Fallback to latest proving job activity",
      lastSignalAt: input.latestProvingJobActivityAt,
      lastSignalSummary:
        input.latestProvingJobActivitySummary
        ?? "Proving job activity is visible, but no persisted worker-heartbeat event has been recorded yet.",
      lastSignalDetail:
        input.latestProvingJobActivityDetail
        ?? "Use proving-job timestamps as the current health signal until heartbeat executions write their own durable audit trail.",
    };
  }

  return {
    routePath: PROVING_HEARTBEAT_ROUTE_PATH,
    schedule: PROVING_HEARTBEAT_CRON_SCHEDULE,
    cadenceLabel,
    schedulePosture: `${cadenceLabel} on ${PROVING_HEARTBEAT_ROUTE_PATH}`,
    authModeLabel: getProvingHeartbeatAuthModeLabel(),
    routeAvailable,
    statusLabel: "No heartbeat evidence yet",
    tone: "warning",
    evidenceKind: "none",
    evidenceLabel: "No persisted proving heartbeat or proving job signal yet",
    lastSignalAt: null,
    lastSignalSummary: "The heartbeat route exists, but the workspace has no durable run metadata yet.",
    lastSignalDetail:
      "This is an honest gap: the current proving slice can show route/schedule posture immediately, but it still needs a persisted run audit record when the cron fires without touching jobs.",
  };
}
