import { NextRequest, NextResponse } from "next/server";

import {
  applyDispatchCallback,
  isDispatchCallbackAuthorized,
  parseDispatchCallbackPayload,
} from "@/lib/dispatch-callback";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!isDispatchCallbackAuthorized(request.headers.get("authorization"))) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid-json" }, { status: 400 });
  }

  try {
    const payload = parseDispatchCallbackPayload(body);
    const result = await applyDispatchCallback(payload);
    return NextResponse.json(result, { status: result.action === "updated" ? 202 : 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown-error";
    const status = message.includes("not found") ? 404 : 400;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
