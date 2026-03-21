import { NextRequest, NextResponse } from "next/server";

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

  try {
    const result = await reconcileProvingJobsOutOfBand();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "unknown-error",
      },
      { status: 500 },
    );
  }
}
