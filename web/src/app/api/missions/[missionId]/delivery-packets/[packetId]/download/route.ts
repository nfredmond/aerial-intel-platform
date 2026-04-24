import { NextResponse } from "next/server";

import { canPerformDroneOpsAction } from "@/lib/auth/actions";
import { getDroneOpsAccess } from "@/lib/auth/drone-ops-access";
import { deliveryPacketFilename } from "@/lib/delivery-packet";
import { createLogger, extractRequestId } from "@/lib/logging";
import { tryCreateSignedDownloadUrl } from "@/lib/storage-delivery";
import { selectDeliveryPacketForDownload } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const SIGNED_URL_TTL_SECONDS = 5 * 60;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ missionId: string; packetId: string }> },
) {
  const log = createLogger("api.missions.delivery-packet-download", {
    requestId: extractRequestId(request),
  });
  const startedAtMs = Date.now();

  try {
    const access = await getDroneOpsAccess();
    if (!access.user) {
      log.warn("blocked.unauthenticated");
      return NextResponse.redirect(new URL("/sign-in", request.url), { status: 302 });
    }

    if (
      !access.org?.id ||
      !access.hasMembership ||
      !access.hasActiveEntitlement ||
      !canPerformDroneOpsAction(access, "artifacts.export")
    ) {
      log.warn("blocked.forbidden", { userId: access.user.id });
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    const { missionId, packetId } = await params;
    const packet = await selectDeliveryPacketForDownload({
      orgId: access.org.id,
      missionId,
      packetId,
    });

    if (!packet?.storage_bucket || !packet.storage_path) {
      log.warn("packet.not_found", { missionId, packetId });
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }

    const signedUrl = await tryCreateSignedDownloadUrl({
      bucket: packet.storage_bucket,
      path: packet.storage_path,
      expiresInSeconds: SIGNED_URL_TTL_SECONDS,
      download: deliveryPacketFilename(packet.title, packet.created_at),
    });

    if (!signedUrl) {
      log.error("signed_url.failed", { missionId, packetId });
      return NextResponse.json({ ok: false, error: "download_unavailable" }, { status: 404 });
    }

    log.info("packet.redirected", {
      missionId,
      packetId,
      durationMs: Date.now() - startedAtMs,
    });

    return NextResponse.redirect(signedUrl, { status: 302 });
  } catch (error) {
    log.error("packet.download_failed", { error, durationMs: Date.now() - startedAtMs });
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "unknown-error" },
      { status: 500 },
    );
  }
}
