import { NextResponse } from "next/server";

import { getDroneOpsAccess } from "@/lib/auth/drone-ops-access";
import { buildInstallBundle, installBundleFilename } from "@/lib/install-bundle";
import { createLogger, extractRequestId } from "@/lib/logging";
import { getMissionDetail } from "@/lib/missions/detail-data";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ missionId: string }> },
) {
  const log = createLogger("api.missions.install-bundle", {
    requestId: extractRequestId(request),
  });
  const startedAtMs = Date.now();

  try {
    const access = await getDroneOpsAccess();
    if (!access.user) {
      log.warn("blocked.unauthenticated");
      return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
    }
    if (!access.hasMembership || !access.hasActiveEntitlement) {
      log.warn("blocked.forbidden", { userId: access.user.id });
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    const { missionId } = await params;
    const detail = await getMissionDetail(access, missionId);
    if (!detail) {
      log.warn("mission.not_found", { missionId });
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }

    const generatedAtIso = new Date().toISOString();
    const zipBytes = buildInstallBundle({ detail, generatedAtIso });
    const filename = installBundleFilename(detail, generatedAtIso);
    const body = new Uint8Array(zipBytes);

    log.info("bundle.built", {
      missionId,
      missionSlug: detail.mission.slug,
      bytes: body.byteLength,
      durationMs: Date.now() - startedAtMs,
    });

    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Length": String(body.byteLength),
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    log.error("bundle.failed", { error, durationMs: Date.now() - startedAtMs });
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "unknown-error" },
      { status: 500 },
    );
  }
}
