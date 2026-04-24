"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { canPerformDroneOpsAction } from "@/lib/auth/actions";
import { getDroneOpsAccess } from "@/lib/auth/drone-ops-access";
import {
  getArtifactHandoff,
  type ArtifactMetadataRecord,
} from "@/lib/artifact-handoff";
import {
  buildMissionDeliveryPacketZip,
  deliveryPacketFilename,
  type DeliveryPacketArtifact,
} from "@/lib/delivery-packet";
import { getMissionDetail, getString } from "@/lib/missions/detail-data";
import {
  computeExpiresAt,
  generateShareToken,
  parseExpiresInHoursInput,
  parseMaxUsesInput,
} from "@/lib/sharing";
import { normalizeSlug } from "@/lib/slug";
import {
  insertArtifactShareLink,
  insertDeliveryPacket,
  insertOrgEvent,
  selectArtifactApprovalsByArtifact,
  selectArtifactCommentsByArtifact,
  updateArtifactShareLink,
  type ArtifactShareLinkRow,
} from "@/lib/supabase/admin";
import { uploadStorageBytes } from "@/lib/supabase/admin-storage";
import type { Json } from "@/lib/supabase/types";

const DELIVERY_PACKET_BUCKET = "drone-ops";

class NoEligibleArtifactsError extends Error {}

function getStringFormValue(formData: FormData, name: string) {
  const raw = formData.get(name);
  return typeof raw === "string" ? raw.trim() : "";
}

function asMetadataRecord(value: Json): ArtifactMetadataRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as ArtifactMetadataRecord;
}

async function getRequestOrigin() {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  if (!host) return "";
  const proto = requestHeaders.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

async function revokeCreatedLinks(links: ArtifactShareLinkRow[]) {
  const revokedAt = new Date().toISOString();
  await Promise.all(
    links.map((link) =>
      updateArtifactShareLink(link.id, { revoked_at: revokedAt }).catch(() => undefined),
    ),
  );
}

export async function createMissionDeliveryPacketAction(formData: FormData) {
  const missionId = getStringFormValue(formData, "missionId");
  if (!missionId) {
    redirect("/missions");
  }

  const access = await getDroneOpsAccess();
  if (!access.user) {
    redirect("/sign-in");
  }

  if (!access.org?.id || !access.hasMembership || !access.hasActiveEntitlement) {
    redirect("/dashboard");
  }

  if (!canPerformDroneOpsAction(access, "artifacts.export")) {
    redirect(`/missions/${missionId}?packet=denied#mission-delivery-packets`);
  }

  const detail = await getMissionDetail(access, missionId);
  if (!detail) {
    redirect("/missions");
  }

  const defaultTitle = `${detail.mission.name} delivery packet`;
  const title = getStringFormValue(formData, "packetTitle") || defaultTitle;
  const note = getStringFormValue(formData, "packetNote") || null;
  const expiresInHours = parseExpiresInHoursInput(
    getStringFormValue(formData, "shareExpiresInHours"),
  ) ?? 168;
  const maxUses = parseMaxUsesInput(getStringFormValue(formData, "shareMaxUses")) ?? 10;
  const expiresAt = computeExpiresAt(expiresInHours);
  const origin = await getRequestOrigin();
  const packetId = crypto.randomUUID();
  const generatedAtIso = new Date().toISOString();
  const filename = deliveryPacketFilename(title, generatedAtIso);
  const createdLinks: ArtifactShareLinkRow[] = [];

  try {
    const eligibleArtifacts: DeliveryPacketArtifact[] = [];

    for (const output of detail.outputs) {
      const approvals = await selectArtifactApprovalsByArtifact(output.id);
      const latestApproval = approvals[0] ?? null;
      if (
        output.status !== "ready" ||
        !output.storage_path ||
        latestApproval?.decision !== "approved"
      ) {
        continue;
      }

      const comments = await selectArtifactCommentsByArtifact(output.id);
      const shareLink = await insertArtifactShareLink({
        org_id: access.org.id,
        artifact_id: output.id,
        token: generateShareToken(),
        note: note ? `Delivery packet: ${title}. ${note}` : `Delivery packet: ${title}.`,
        max_uses: maxUses,
        expires_at: expiresAt,
        created_by: access.user.id,
      });

      if (!shareLink) {
        throw new Error("Share link creation returned no row.");
      }

      createdLinks.push(shareLink);

      const metadata = asMetadataRecord(output.metadata);
      const artifactName = getString(metadata.name, output.kind.replaceAll("_", " "));
      eligibleArtifacts.push({
        id: output.id,
        name: artifactName,
        kind: output.kind,
        status: output.status,
        format: getString(metadata.format, output.kind),
        deliveryNote: getString(metadata.delivery, "No delivery note recorded"),
        storageBucket: output.storage_bucket,
        storagePath: output.storage_path,
        handoff: getArtifactHandoff(metadata),
        latestApproval,
        comments,
        shareLink,
        shareUrl: origin
          ? `${origin}/s/${encodeURIComponent(shareLink.token)}`
          : `/s/${encodeURIComponent(shareLink.token)}`,
        metadata,
      });
    }

    if (eligibleArtifacts.length === 0) {
      throw new NoEligibleArtifactsError();
    }

    const zipBytes = buildMissionDeliveryPacketZip({
      packetId,
      title,
      mission: {
        id: detail.mission.id,
        name: detail.mission.name,
        objective: detail.mission.objective,
        status: detail.mission.status,
      },
      projectName: detail.project?.name ?? null,
      siteName: detail.site?.name ?? null,
      generatedAtIso,
      generatedByEmail: access.user.email ?? null,
      note,
      artifacts: eligibleArtifacts,
    });

    const orgSlug = normalizeSlug(access.org.slug || access.org.name || "org") || "org";
    const storagePath = `${orgSlug}/missions/${detail.mission.id}/delivery-packets/${packetId}/${filename}`;
    const uploaded = await uploadStorageBytes({
      bucket: DELIVERY_PACKET_BUCKET,
      path: storagePath,
      bytes: zipBytes,
      contentType: "application/zip",
      upsert: false,
    });

    await insertDeliveryPacket({
      id: packetId,
      org_id: access.org.id,
      mission_id: detail.mission.id,
      title,
      status: "ready",
      storage_bucket: DELIVERY_PACKET_BUCKET,
      storage_path: uploaded.path,
      artifact_ids: eligibleArtifacts.map((artifact) => artifact.id),
      share_link_ids: createdLinks.map((link) => link.id),
      created_by: access.user.id,
      created_by_email: access.user.email ?? null,
      metadata: {
        filename,
        note,
        artifactCount: eligibleArtifacts.length,
        shareExpiresAt: expiresAt,
        shareExpiresInHours: expiresInHours,
        shareMaxUses: maxUses,
        generatedAt: generatedAtIso,
      },
    });

    await insertOrgEvent({
      org_id: access.org.id,
      actor_user_id: access.user.id,
      event_type: "delivery_packet.created",
      payload: {
        title: "Mission delivery packet created",
        detail: `${title} includes ${eligibleArtifacts.length} approved artifact link(s).`,
        missionId: detail.mission.id,
        packetId,
        artifactIds: eligibleArtifacts.map((artifact) => artifact.id),
        shareLinkIds: createdLinks.map((link) => link.id),
        storagePath: uploaded.path,
      },
    }).catch(() => undefined);
  } catch (error) {
    await revokeCreatedLinks(createdLinks);
    if (error instanceof NoEligibleArtifactsError) {
      redirect(`/missions/${missionId}?packet=none-eligible#mission-delivery-packets`);
    }
    redirect(`/missions/${missionId}?packet=error#mission-delivery-packets`);
  }

  redirect(`/missions/${missionId}?packet=created#mission-delivery-packets`);
}
