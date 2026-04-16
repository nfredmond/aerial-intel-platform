import { NextRequest, NextResponse } from "next/server";

import {
  applyDispatchCallback,
  isDispatchCallbackAuthorized,
  parseDispatchCallbackPayload,
} from "@/lib/dispatch-callback";
import { createLogger, extractRequestId } from "@/lib/logging";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const log = createLogger("api.dispatch.adapter.callback", {
    requestId: extractRequestId(request),
  });
  const startedAtMs = Date.now();

  if (!isDispatchCallbackAuthorized(request.headers.get("authorization"))) {
    log.warn("blocked.unauthorized");
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    log.warn("reject.invalid_json");
    return NextResponse.json({ ok: false, error: "invalid-json" }, { status: 400 });
  }

  try {
    const payload = parseDispatchCallbackPayload(body);
    const result = await applyDispatchCallback(payload);
    log.info("callback.applied", {
      jobId: payload.job.id,
      action: result.action,
      durationMs: Date.now() - startedAtMs,
    });
    return NextResponse.json(result, { status: result.action === "updated" ? 202 : 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown-error";
    const status = message.includes("not found") ? 404 : 400;
    log.error("callback.failed", { error, status, durationMs: Date.now() - startedAtMs });
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
