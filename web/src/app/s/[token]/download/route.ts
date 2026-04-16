import { NextResponse, type NextRequest } from "next/server";

import { createLogger, extractRequestId } from "@/lib/logging";
import { validateShareLink } from "@/lib/sharing";
import { tryCreateSignedDownloadUrl } from "@/lib/storage-delivery";
import {
  selectArtifactShareLinkByToken,
  selectProcessingOutputById,
  updateArtifactShareLink,
} from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const SIGNED_URL_TTL_SECONDS = 5 * 60;

function redirectTo(url: string) {
  return NextResponse.redirect(url, { status: 302 });
}

function rejectWith(path: string, origin: URL) {
  return NextResponse.redirect(new URL(path, origin), { status: 302 });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const log = createLogger("app.s.download", { requestId: extractRequestId(request) });
  const { token } = await params;
  const origin = new URL(request.url);

  let link;
  try {
    link = await selectArtifactShareLinkByToken(token);
  } catch (error) {
    log.error("lookup.failed", { error });
    return rejectWith(`/s/${encodeURIComponent(token)}`, origin);
  }

  const validation = validateShareLink(link);
  if (!validation.ok) {
    log.info("share.rejected", { reason: validation.reason });
    return rejectWith(`/s/${encodeURIComponent(token)}`, origin);
  }

  const valid = validation.link;

  let artifact;
  try {
    artifact = await selectProcessingOutputById(valid.artifact_id);
  } catch (error) {
    log.error("artifact.lookup.failed", { error, artifactId: valid.artifact_id });
    return rejectWith(`/s/${encodeURIComponent(token)}`, origin);
  }

  if (!artifact || artifact.status !== "ready" || !artifact.storage_path) {
    log.warn("artifact.unavailable", { artifactId: valid.artifact_id });
    return rejectWith(`/s/${encodeURIComponent(token)}`, origin);
  }

  const signedUrl = await tryCreateSignedDownloadUrl({
    bucket: artifact.storage_bucket,
    path: artifact.storage_path,
    expiresInSeconds: SIGNED_URL_TTL_SECONDS,
    download: true,
  });

  if (!signedUrl) {
    log.error("signed_url.failed", { artifactId: valid.artifact_id });
    return rejectWith(`/s/${encodeURIComponent(token)}`, origin);
  }

  try {
    await updateArtifactShareLink(valid.id, {
      use_count: valid.use_count + 1,
      last_used_at: new Date().toISOString(),
    });
  } catch (error) {
    log.warn("increment.failed", { error, linkId: valid.id });
  }

  log.info("share.redirected", {
    linkId: valid.id,
    artifactId: valid.artifact_id,
    useCount: valid.use_count + 1,
  });

  return redirectTo(signedUrl);
}
