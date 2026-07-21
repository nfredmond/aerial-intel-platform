import type { NextRequest } from "next/server";

export type CronAuthResult =
  | { ok: true }
  | { ok: false; reason: "missing-secret" | "invalid-bearer" };

/**
 * Authorize an internal cron/worker route. Fails CLOSED: when CRON_SECRET is
 * not configured the route refuses every request. The previous per-route
 * fallback accepted any request whose User-Agent started with "vercel-cron/",
 * which is attacker-controlled — a single missing env var silently downgraded
 * service-role write routes to no auth at all.
 */
export function checkCronAuth(request: NextRequest): CronAuthResult {
  const configuredSecret = process.env.CRON_SECRET;
  if (!configuredSecret) {
    return { ok: false, reason: "missing-secret" };
  }

  const authorization = request.headers.get("authorization");
  if (authorization !== `Bearer ${configuredSecret}`) {
    return { ok: false, reason: "invalid-bearer" };
  }

  return { ok: true };
}
