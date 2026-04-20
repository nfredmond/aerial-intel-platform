import { NextResponse } from "next/server";

import { canPerformDroneOpsAction } from "@/lib/auth/actions";
import { getDroneOpsAccess } from "@/lib/auth/drone-ops-access";
import { buildCopilotAuditCsv, copilotAuditFilename } from "@/lib/copilot/audit-export";
import { createLogger, extractRequestId } from "@/lib/logging";
import { selectRecentCopilotEventsForOrg } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function readLimit(request: Request) {
  const parsed = Number(new URL(request.url).searchParams.get("limit") ?? "500");
  if (!Number.isFinite(parsed)) return 500;
  return parsed;
}

export async function GET(request: Request) {
  const log = createLogger("api.admin.copilot-events", {
    requestId: extractRequestId(request),
  });
  const startedAtMs = Date.now();

  try {
    const access = await getDroneOpsAccess();
    if (!access.user) {
      log.warn("blocked.unauthenticated");
      return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
    }
    if (
      !access.hasMembership ||
      !access.hasActiveEntitlement ||
      !canPerformDroneOpsAction(access, "admin.support")
    ) {
      log.warn("blocked.forbidden", { userId: access.user.id });
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    const orgId = access.org?.id;
    if (!orgId) {
      log.warn("blocked.missing_org", { userId: access.user.id });
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    const rows = await selectRecentCopilotEventsForOrg(orgId, readLimit(request));
    const body = buildCopilotAuditCsv(rows);
    const filename = copilotAuditFilename({ orgSlug: access.org?.slug });

    log.info("events.exported", {
      orgId,
      rows: rows.length,
      durationMs: Date.now() - startedAtMs,
    });

    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    log.error("events.export_failed", { error, durationMs: Date.now() - startedAtMs });
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "unknown-error" },
      { status: 500 },
    );
  }
}
