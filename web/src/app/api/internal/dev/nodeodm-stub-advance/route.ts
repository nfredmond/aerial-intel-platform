import { NextRequest, NextResponse } from "next/server";

import { createLogger, extractRequestId } from "@/lib/logging";
import { getSharedStubNodeOdmClient } from "@/lib/nodeodm/stub";
import { NodeOdmError } from "@/lib/nodeodm/errors";

export const dynamic = "force-dynamic";

const VALID_TARGETS = new Set(["running", "completed", "failed", "canceled", "progress"]);

function isDevStubEnabled(): boolean {
  return process.env.AERIAL_NODEODM_MODE === "stub" && process.env.NODE_ENV !== "production";
}

function notFound() {
  return NextResponse.json({ ok: false, error: "not-found" }, { status: 404 });
}

export async function POST(request: NextRequest) {
  const log = createLogger("api.internal.dev.nodeodm-stub-advance", {
    requestId: extractRequestId(request),
  });

  if (!isDevStubEnabled()) {
    log.warn("blocked.not-stub-mode");
    return notFound();
  }

  const url = new URL(request.url);
  const taskUuid = url.searchParams.get("taskUuid");
  const to = url.searchParams.get("to");

  if (!taskUuid) {
    return NextResponse.json({ ok: false, error: "missing-taskUuid" }, { status: 400 });
  }
  if (!to || !VALID_TARGETS.has(to)) {
    return NextResponse.json(
      { ok: false, error: "invalid-to", allowed: [...VALID_TARGETS] },
      { status: 400 },
    );
  }

  const stub = getSharedStubNodeOdmClient();
  try {
    switch (to) {
      case "running":
        await stub.commitTask(taskUuid);
        break;
      case "completed":
        stub.completeTask(taskUuid);
        break;
      case "failed":
        stub.failTask(taskUuid);
        break;
      case "canceled":
        await stub.cancelTask(taskUuid);
        break;
      case "progress": {
        await stub.taskInfo(taskUuid);
        break;
      }
    }
  } catch (error) {
    if (error instanceof NodeOdmError && error.kind === "not_found") {
      return NextResponse.json({ ok: false, error: "task-not-found" }, { status: 404 });
    }
    log.error("advance.failed", { error });
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "unknown-error" },
      { status: 500 },
    );
  }

  const info = await stub.taskInfo(taskUuid);
  log.info("advance.ok", { taskUuid, to, statusCode: info.status?.code });
  return NextResponse.json({
    ok: true,
    taskUuid,
    to,
    statusCode: info.status?.code ?? null,
    progress: info.progress ?? null,
  });
}
