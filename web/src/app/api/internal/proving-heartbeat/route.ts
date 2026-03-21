import { NextRequest, NextResponse } from "next/server";

import {
  PROVING_HEARTBEAT_CRON_SCHEDULE,
  PROVING_HEARTBEAT_ROUTE_PATH,
  getProvingHeartbeatAuthModeLabel,
  getProvingHeartbeatCadenceLabel,
} from "@/lib/proving-heartbeat";
import { reconcileProvingJobsOutOfBand } from "@/lib/proving-runs";

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
  if (!isAuthorized(request)) {
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
    return NextResponse.json({ ok: true, heartbeat, ...result });
  } catch (error) {
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
