import { NextRequest, NextResponse } from "next/server";

import { createLogger, extractRequestId } from "@/lib/logging";
import {
  PROVING_HEARTBEAT_CRON_SCHEDULE,
  PROVING_HEARTBEAT_ROUTE_PATH,
  getProvingHeartbeatAuthModeLabel,
  getProvingHeartbeatCadenceLabel,
} from "@/lib/proving-heartbeat";
import { recordProvingHeartbeatAudit, reconcileProvingJobsOutOfBand } from "@/lib/proving-runs";

export const dynamic = "force-dynamic";

function isAuthorized(request: NextRequest) {
  const configuredSecret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");

  if (configuredSecret) {
    return authorization === `Bearer ${configuredSecret}`;
  }

  const userAgent = request.headers.get("user-agent") ?? "";
  return userAgent.startsWith("vercel-cron/");
}

export async function GET(request: NextRequest) {
  const log = createLogger("api.internal.proving-heartbeat", {
    requestId: extractRequestId(request),
  });
  const startedAtMs = Date.now();

  if (!isAuthorized(request)) {
    log.warn("blocked.unauthorized");
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const invokedAt = new Date().toISOString();
  const heartbeat = {
    routePath: PROVING_HEARTBEAT_ROUTE_PATH,
    schedule: PROVING_HEARTBEAT_CRON_SCHEDULE,
    cadenceLabel: getProvingHeartbeatCadenceLabel(PROVING_HEARTBEAT_CRON_SCHEDULE),
    authModeLabel: getProvingHeartbeatAuthModeLabel(),
    invokedAt,
  };

  try {
    const result = await reconcileProvingJobsOutOfBand();
    const auditRecorded = await recordProvingHeartbeatAudit({
      invokedAt,
      scanned: result.scanned,
      updates: result.updates,
      started: result.started,
      completed: result.completed,
      targets: result.auditTargets,
    });

    log.info("heartbeat.complete", {
      scanned: result.scanned,
      updates: result.updates,
      started: result.started,
      completed: result.completed,
      auditRecorded,
      durationMs: Date.now() - startedAtMs,
    });

    return NextResponse.json({
      ok: true,
      heartbeat,
      auditRecorded,
      scanned: result.scanned,
      updates: result.updates,
      started: result.started,
      completed: result.completed,
    });
  } catch (error) {
    log.error("heartbeat.failed", { error, durationMs: Date.now() - startedAtMs });
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "unknown-error",
        heartbeat,
      },
      { status: 500 },
    );
  }
}
