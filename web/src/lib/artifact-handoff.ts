import type { Json } from "@/lib/supabase/types";

export type ArtifactMetadataRecord = Record<string, Json | undefined>;

type JsonRecord = ArtifactMetadataRecord;

export type ArtifactHandoffStage = "pending_review" | "reviewed" | "shared" | "exported";

export type ArtifactHandoffSummary = {
  stage: ArtifactHandoffStage;
  stageLabel: string;
  reviewedAt: string | null;
  reviewedByEmail: string | null;
  sharedAt: string | null;
  sharedByEmail: string | null;
  exportedAt: string | null;
  exportedByEmail: string | null;
  note: string | null;
  nextAction: string;
};

export type ArtifactHandoffCounts = {
  pendingReviewCount: number;
  reviewedCount: number;
  sharedCount: number;
  exportedCount: number;
};

export type ArtifactHandoffPatch = {
  reviewedAt?: string | null;
  reviewedByEmail?: string | null;
  sharedAt?: string | null;
  sharedByEmail?: string | null;
  exportedAt?: string | null;
  exportedByEmail?: string | null;
  note?: string | null;
  nextAction?: string | null;
};

function asRecord(value: Json | undefined | null): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as JsonRecord;
}

function asString(value: Json | undefined) {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function getDefaultNextAction(stage: ArtifactHandoffStage) {
  switch (stage) {
    case "reviewed":
      return "Share the reviewed artifact summary with the field or client handoff lane.";
    case "shared":
      return "Export/package the artifact and record final delivery traceability.";
    case "exported":
      return "Artifact handoff is recorded. Keep downstream portal/share-link status in sync.";
    default:
      return "Review artifact quality and GIS posture before sharing or export.";
  }
}

export function formatArtifactHandoffStage(stage: ArtifactHandoffStage) {
  switch (stage) {
    case "pending_review":
      return "Pending review";
    case "reviewed":
      return "Reviewed";
    case "shared":
      return "Shared";
    case "exported":
      return "Exported";
    default:
      return stage;
  }
}

export function getArtifactHandoff(metadata: JsonRecord): ArtifactHandoffSummary {
  const handoff = asRecord(metadata.handoff);
  const reviewedAt = asString(handoff.reviewedAt);
  const reviewedByEmail = asString(handoff.reviewedByEmail);
  const sharedAt = asString(handoff.sharedAt);
  const sharedByEmail = asString(handoff.sharedByEmail);
  const exportedAt = asString(handoff.exportedAt);
  const exportedByEmail = asString(handoff.exportedByEmail);
  const note = asString(handoff.note);

  const stage: ArtifactHandoffStage = exportedAt
    ? "exported"
    : sharedAt
      ? "shared"
      : reviewedAt
        ? "reviewed"
        : "pending_review";

  return {
    stage,
    stageLabel: formatArtifactHandoffStage(stage),
    reviewedAt,
    reviewedByEmail,
    sharedAt,
    sharedByEmail,
    exportedAt,
    exportedByEmail,
    note,
    nextAction: asString(handoff.nextAction) ?? getDefaultNextAction(stage),
  };
}

export function updateArtifactHandoffMetadata(metadata: JsonRecord, patch: ArtifactHandoffPatch) {
  const handoff = asRecord(metadata.handoff);

  const nextHandoff: JsonRecord = {
    ...handoff,
  };

  const assignIfPresent = (key: keyof ArtifactHandoffPatch, value: string | null | undefined) => {
    if (value === undefined) {
      return;
    }

    nextHandoff[key] = value;
  };

  assignIfPresent("reviewedAt", patch.reviewedAt);
  assignIfPresent("reviewedByEmail", patch.reviewedByEmail);
  assignIfPresent("sharedAt", patch.sharedAt);
  assignIfPresent("sharedByEmail", patch.sharedByEmail);
  assignIfPresent("exportedAt", patch.exportedAt);
  assignIfPresent("exportedByEmail", patch.exportedByEmail);
  assignIfPresent("note", patch.note);
  assignIfPresent("nextAction", patch.nextAction);

  const summary = getArtifactHandoff({
    ...metadata,
    handoff: nextHandoff,
  });

  nextHandoff.stage = summary.stage;
  nextHandoff.nextAction = patch.nextAction ?? getDefaultNextAction(summary.stage);

  return {
    ...metadata,
    handoff: nextHandoff,
  } satisfies JsonRecord;
}

export function summarizeArtifactHandoffs(metadataRecords: ArtifactMetadataRecord[]) {
  return metadataRecords.reduce<ArtifactHandoffCounts>(
    (summary, metadata) => {
      const handoff = getArtifactHandoff(metadata);

      switch (handoff.stage) {
        case "exported":
          summary.exportedCount += 1;
          break;
        case "shared":
          summary.sharedCount += 1;
          break;
        case "reviewed":
          summary.reviewedCount += 1;
          break;
        default:
          summary.pendingReviewCount += 1;
          break;
      }

      return summary;
    },
    {
      pendingReviewCount: 0,
      reviewedCount: 0,
      sharedCount: 0,
      exportedCount: 0,
    },
  );
}

export function buildArtifactShareSummary(input: {
  artifactName: string;
  missionName?: string | null;
  projectName?: string | null;
  status: string;
  storagePath: string;
  handoffStageLabel: string;
  handoffNote?: string | null;
}) {
  return [
    input.artifactName,
    input.missionName ? `Mission: ${input.missionName}` : null,
    input.projectName ? `Project: ${input.projectName}` : null,
    `Status: ${input.status}`,
    `Handoff: ${input.handoffStageLabel}`,
    input.handoffNote ? `Note: ${input.handoffNote}` : null,
    `Path: ${input.storagePath}`,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function buildArtifactExportPacket(input: {
  artifactName: string;
  artifactKind: string;
  artifactStatus: string;
  artifactFormat: string;
  missionName?: string | null;
  projectName?: string | null;
  datasetName?: string | null;
  storagePath: string;
  deliveryNote: string;
  handoff: ArtifactHandoffSummary;
}) {
  return [
    `Artifact: ${input.artifactName}`,
    `Kind: ${input.artifactKind}`,
    `Status: ${input.artifactStatus}`,
    `Format: ${input.artifactFormat}`,
    `Mission: ${input.missionName ?? "No mission linked"}`,
    `Project: ${input.projectName ?? "No project linked"}`,
    `Dataset: ${input.datasetName ?? "No dataset linked"}`,
    `Storage path: ${input.storagePath}`,
    `Delivery note: ${input.deliveryNote}`,
    `Handoff stage: ${input.handoff.stageLabel}`,
    `Handoff note: ${input.handoff.note ?? "Not recorded"}`,
    `Reviewed at: ${input.handoff.reviewedAt ?? "Not recorded"}`,
    `Shared at: ${input.handoff.sharedAt ?? "Not recorded"}`,
    `Exported at: ${input.handoff.exportedAt ?? "Not recorded"}`,
    `Next action: ${input.handoff.nextAction}`,
  ].join("\n");
}
