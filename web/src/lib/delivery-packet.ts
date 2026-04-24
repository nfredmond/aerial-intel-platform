import { strToU8, zipSync } from "fflate";

import type { ArtifactHandoffSummary } from "@/lib/artifact-handoff";
import type {
  ArtifactApprovalRow,
  ArtifactCommentRow,
  ArtifactShareLinkRow,
} from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/types";

export type DeliveryPacketArtifact = {
  id: string;
  name: string;
  kind: string;
  status: string;
  format: string;
  deliveryNote: string;
  storageBucket: string | null;
  storagePath: string | null;
  handoff: ArtifactHandoffSummary;
  latestApproval: ArtifactApprovalRow | null;
  comments: ArtifactCommentRow[];
  shareLink: ArtifactShareLinkRow;
  shareUrl: string;
  metadata: Record<string, Json | undefined>;
};

export type DeliveryPacketInput = {
  packetId: string;
  title: string;
  mission: {
    id: string;
    name: string;
    objective: string | null;
    status: string;
  };
  projectName: string | null;
  siteName: string | null;
  generatedAtIso: string;
  generatedByEmail: string | null;
  note: string | null;
  artifacts: DeliveryPacketArtifact[];
};

export type DeliveryPacketEligibilitySummary = {
  readyArtifactCount: number;
  approvedArtifactCount: number;
  ineligibleCount: number;
};

type FileMap = Record<string, Uint8Array>;

function compactText(value: string | null | undefined, fallback = "Not recorded") {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed.length > 0 ? trimmed : fallback;
}

function textFileBytes(text: string) {
  return new Uint8Array(strToU8(text));
}

export function deliveryPacketFilename(title: string, generatedAtIso: string) {
  const safeTitle = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72) || "delivery-packet";
  const stamp = generatedAtIso.replace(/[-:.TZ]/g, "").slice(0, 14);
  return `${safeTitle}-${stamp}.zip`;
}

function markdownList(items: string[]) {
  return items.length > 0
    ? items.map((item) => `- ${item}`).join("\n")
    : "- None recorded";
}

function unresolvedCommentCount(comments: ArtifactCommentRow[]) {
  return comments.filter((comment) => !comment.resolved_at).length;
}

function getSavedReportSummary(metadata: Record<string, Json | undefined>) {
  const raw = metadata.copilotReportSummary;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const record = raw as Record<string, unknown>;
  const summary = typeof record.summary === "string" && record.summary.trim()
    ? record.summary.trim()
    : null;
  if (!summary) return null;
  return {
    summary,
    modelId: typeof record.modelId === "string" ? record.modelId : null,
    generatedAt: typeof record.generatedAt === "string" ? record.generatedAt : null,
    keptSentences: typeof record.keptSentences === "number" ? record.keptSentences : null,
    totalSentences: typeof record.totalSentences === "number" ? record.totalSentences : null,
  };
}

function artifactMarkdown(artifact: DeliveryPacketArtifact) {
  const approval = artifact.latestApproval;
  const savedSummary = getSavedReportSummary(artifact.metadata);
  const unresolved = unresolvedCommentCount(artifact.comments);
  const commentLines = artifact.comments.map((comment) => {
    const status = comment.resolved_at ? "resolved" : "open";
    return `${comment.author_email ?? "Unknown reviewer"} (${status}, ${comment.created_at}): ${comment.body}`;
  });

  return [
    `# ${artifact.name}`,
    "",
    "## Artifact",
    "",
    `- ID: ${artifact.id}`,
    `- Kind: ${artifact.kind}`,
    `- Status: ${artifact.status}`,
    `- Format: ${artifact.format}`,
    `- Delivery note: ${artifact.deliveryNote}`,
    `- Storage: ${artifact.storageBucket && artifact.storagePath ? `${artifact.storageBucket}/${artifact.storagePath}` : "Not attached"}`,
    `- Download: ${artifact.shareUrl}`,
    "",
    "## Approval",
    "",
    approval
      ? markdownList([
          `Decision: ${approval.decision}`,
          `Reviewer: ${approval.reviewer_email ?? "Unknown reviewer"}`,
          `Decided at: ${approval.decided_at}`,
          `Note: ${compactText(approval.note)}`,
        ])
      : "- No approval recorded",
    "",
    "## Handoff",
    "",
    markdownList([
      `Stage: ${artifact.handoff.stageLabel}`,
      `Reviewed at: ${compactText(artifact.handoff.reviewedAt)}`,
      `Shared at: ${compactText(artifact.handoff.sharedAt)}`,
      `Exported at: ${compactText(artifact.handoff.exportedAt)}`,
      `Note: ${compactText(artifact.handoff.note)}`,
      `Next action: ${artifact.handoff.nextAction}`,
    ]),
    "",
    "## Report Summary",
    "",
    savedSummary
      ? [
          savedSummary.summary,
          "",
          `Model: ${compactText(savedSummary.modelId)}`,
          `Generated at: ${compactText(savedSummary.generatedAt)}`,
          savedSummary.keptSentences !== null && savedSummary.totalSentences !== null
            ? `Grounding: ${savedSummary.keptSentences}/${savedSummary.totalSentences} sentences kept`
            : null,
        ].filter(Boolean).join("\n")
      : "No saved Copilot report summary is attached to this artifact metadata.",
    "",
    "## Comments",
    "",
    `Total comments: ${artifact.comments.length}`,
    `Unresolved comments: ${unresolved}`,
    "",
    markdownList(commentLines),
    "",
  ].join("\n");
}

function readme(input: DeliveryPacketInput) {
  return [
    `# ${input.title}`,
    "",
    `_Generated ${input.generatedAtIso}_`,
    "",
    "## Mission",
    "",
    `- Mission: ${input.mission.name}`,
    `- Mission ID: ${input.mission.id}`,
    `- Status: ${input.mission.status}`,
    `- Project: ${input.projectName ?? "Not linked"}`,
    `- Site: ${input.siteName ?? "Not linked"}`,
    `- Objective: ${input.mission.objective ?? "Not recorded"}`,
    `- Generated by: ${input.generatedByEmail ?? "Unknown"}`,
    `- Packet note: ${input.note ?? "None"}`,
    "",
    "## Contents",
    "",
    "- `manifest.json` - machine-readable packet inventory.",
    "- `artifact-links.csv` - external download links for approved artifacts.",
    "- `review-summary.md` - approval and comment posture across included artifacts.",
    "- `artifacts/*.md` - one review sheet per included artifact.",
    "",
    "## Delivery Boundary",
    "",
    "Large artifact files are not embedded in this ZIP. Use the governed `/s/` links in the packet to download each artifact. Those links can expire, be revoked, and count against their configured download limits.",
    "",
  ].join("\n");
}

function manifest(input: DeliveryPacketInput) {
  return {
    schemaVersion: "aerial-intel.delivery-packet.v1",
    packetId: input.packetId,
    title: input.title,
    generatedAtUtc: input.generatedAtIso,
    generatedByEmail: input.generatedByEmail,
    note: input.note,
    mission: input.mission,
    projectName: input.projectName,
    siteName: input.siteName,
    artifacts: input.artifacts.map((artifact) => ({
      id: artifact.id,
      name: artifact.name,
      kind: artifact.kind,
      status: artifact.status,
      format: artifact.format,
      deliveryNote: artifact.deliveryNote,
      storage: {
        bucket: artifact.storageBucket,
        path: artifact.storagePath,
      },
      handoff: {
        stage: artifact.handoff.stage,
        reviewedAt: artifact.handoff.reviewedAt,
        sharedAt: artifact.handoff.sharedAt,
        exportedAt: artifact.handoff.exportedAt,
        nextAction: artifact.handoff.nextAction,
      },
      approval: artifact.latestApproval
        ? {
            decision: artifact.latestApproval.decision,
            reviewerEmail: artifact.latestApproval.reviewer_email,
            decidedAt: artifact.latestApproval.decided_at,
          }
        : null,
      comments: {
        total: artifact.comments.length,
        unresolved: unresolvedCommentCount(artifact.comments),
      },
      share: {
        id: artifact.shareLink.id,
        url: artifact.shareUrl,
        expiresAt: artifact.shareLink.expires_at,
        maxUses: artifact.shareLink.max_uses,
      },
    })),
  };
}

function artifactLinksCsv(input: DeliveryPacketInput) {
  const escape = (value: string | number | null | undefined) => {
    const text = String(value ?? "");
    return `"${text.replaceAll('"', '""')}"`;
  };
  const rows = [
    ["artifact_id", "name", "kind", "download_url", "expires_at", "max_uses"],
    ...input.artifacts.map((artifact) => [
      artifact.id,
      artifact.name,
      artifact.kind,
      artifact.shareUrl,
      artifact.shareLink.expires_at ?? "",
      artifact.shareLink.max_uses ?? "",
    ]),
  ];
  return rows.map((row) => row.map(escape).join(",")).join("\n") + "\n";
}

function reviewSummary(input: DeliveryPacketInput) {
  const lines = input.artifacts.flatMap((artifact) => {
    const approval = artifact.latestApproval;
    return [
      `## ${artifact.name}`,
      "",
      `- Kind: ${artifact.kind}`,
      `- Approval: ${approval?.decision ?? "not recorded"}`,
      `- Reviewer: ${approval?.reviewer_email ?? "not recorded"}`,
      `- Decided at: ${approval?.decided_at ?? "not recorded"}`,
      `- Handoff stage: ${artifact.handoff.stageLabel}`,
      `- Unresolved comments: ${unresolvedCommentCount(artifact.comments)}`,
      `- Download: ${artifact.shareUrl}`,
      "",
    ];
  });

  return [
    `# Review Summary - ${input.title}`,
    "",
    `Included approved artifacts: ${input.artifacts.length}`,
    "",
    ...lines,
  ].join("\n");
}

export function buildMissionDeliveryPacketZip(input: DeliveryPacketInput): Uint8Array {
  const files: FileMap = {
    "README.md": textFileBytes(readme(input)),
    "manifest.json": textFileBytes(JSON.stringify(manifest(input), null, 2)),
    "artifact-links.csv": textFileBytes(artifactLinksCsv(input)),
    "review-summary.md": textFileBytes(reviewSummary(input)),
  };

  for (const [index, artifact] of input.artifacts.entries()) {
    const safe = artifact.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64) || `artifact-${index + 1}`;
    files[`artifacts/${String(index + 1).padStart(2, "0")}-${safe}.md`] = textFileBytes(
      artifactMarkdown(artifact),
    );
  }

  return zipSync(files);
}

export function summarizeDeliveryPacketEligibility(input: {
  readyArtifactCount: number;
  approvedArtifactCount: number;
  totalArtifactCount: number;
}): DeliveryPacketEligibilitySummary {
  return {
    readyArtifactCount: input.readyArtifactCount,
    approvedArtifactCount: input.approvedArtifactCount,
    ineligibleCount: Math.max(0, input.totalArtifactCount - input.approvedArtifactCount),
  };
}
