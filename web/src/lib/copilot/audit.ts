import { insertOrgEvent } from "@/lib/supabase/admin";

export type CopilotAuditStatus = "ok" | "refused" | "blocked" | "error";

export type CopilotAuditInput = {
  orgId: string;
  actorUserId?: string | null;
  skill:
    | "mission-brief"
    | "processing-qa"
    | "data-scout"
    | "support-assistant"
    | "report-summary";
  status: CopilotAuditStatus;
  targetType: "mission" | "job" | "dataset" | "artifact" | "support";
  targetId?: string | null;
  reason?: string | null;
  modelId?: string | null;
  spendTenthCents?: number | null;
  totalSentences?: number | null;
  keptSentences?: number | null;
  droppedSentences?: number | null;
  citedFactCount?: number | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  capTenthCents?: number | null;
  remainingTenthCents?: number | null;
};

export type CopilotAuditContext = Pick<
  CopilotAuditInput,
  "orgId" | "actorUserId" | "skill" | "targetType" | "targetId"
>;

function eventTypeForStatus(status: CopilotAuditStatus) {
  switch (status) {
    case "ok":
      return "copilot.call.succeeded";
    case "refused":
      return "copilot.call.refused";
    case "blocked":
      return "copilot.call.blocked";
    case "error":
      return "copilot.call.failed";
  }
}

export async function recordCopilotAuditEvent(input: CopilotAuditInput) {
  await insertOrgEvent({
    org_id: input.orgId,
    actor_user_id: input.actorUserId ?? null,
    event_type: eventTypeForStatus(input.status),
    payload: {
      skill: input.skill,
      status: input.status,
      targetType: input.targetType,
      targetId: input.targetId ?? null,
      reason: input.reason ?? null,
      modelId: input.modelId ?? null,
      spendTenthCents: input.spendTenthCents ?? null,
      totalSentences: input.totalSentences ?? null,
      keptSentences: input.keptSentences ?? null,
      droppedSentences: input.droppedSentences ?? null,
      citedFactCount: input.citedFactCount ?? null,
      inputTokens: input.inputTokens ?? null,
      outputTokens: input.outputTokens ?? null,
      capTenthCents: input.capTenthCents ?? null,
      remainingTenthCents: input.remainingTenthCents ?? null,
    },
  });
}

export function recordCopilotAuditEventSafely(input: CopilotAuditInput) {
  return recordCopilotAuditEvent(input).catch(() => undefined);
}
