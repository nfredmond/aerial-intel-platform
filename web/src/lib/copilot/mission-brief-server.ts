import { getDroneOpsAccess } from "@/lib/auth/drone-ops-access";
import { canPerformDroneOpsAction } from "@/lib/auth/actions";
import { getMissionDetail } from "@/lib/missions/detail-data";

import { checkCopilotCallGate, getCopilotConfig } from "./config";
import {
  recordCopilotAuditEventSafely,
  type CopilotAuditContext,
} from "./audit";
import { estimateMissionBriefBudgetTenthCents, generateMissionBrief } from "./mission-brief";
import { buildMissionBriefFacts } from "./mission-brief-facts";
import { checkQuotaAndReserve, readOrgCopilotEnabled, recordSpend } from "./quota";

export type MissionBriefServerResult =
  | {
      status: "ok";
      text: string;
      citedFactIds: string[];
      totalSentences: number;
      keptSentences: number;
      droppedSentences: number;
      spendTenthCents: number;
      modelId: string;
    }
  | {
      status: "refused";
      reason: "too-many-dropped" | "too-short" | "empty-output";
      droppedSentences: number;
      totalSentences: number;
      spendTenthCents: number;
    }
  | {
      status: "blocked";
      reason:
        | "not-authenticated"
        | "not-authorized"
        | "global-disabled"
        | "missing-api-key"
        | "org-disabled"
        | "mission-not-found"
        | "no-facts"
        | "quota-exhausted";
      remainingTenthCents?: number;
      capTenthCents?: number;
      spendTenthCents?: number;
    }
  | { status: "error"; message: string };

export async function runMissionBriefForMission(
  missionId: string,
): Promise<MissionBriefServerResult> {
  let auditContext: CopilotAuditContext | null = null;
  try {
    const access = await getDroneOpsAccess();
    if (!access.isAuthenticated) return { status: "blocked", reason: "not-authenticated" };
    const orgId = access.org?.id;
    if (!orgId) return { status: "blocked", reason: "not-authorized" };
    auditContext = {
      orgId,
      actorUserId: access.user?.id ?? null,
      skill: "mission-brief",
      targetType: "mission",
      targetId: missionId,
    };
    if (!canPerformDroneOpsAction(access, "copilot.generate")) {
      await recordCopilotAuditEventSafely({
        ...auditContext,
        status: "blocked",
        reason: "not-authorized",
      });
      return { status: "blocked", reason: "not-authorized" };
    }

    const config = getCopilotConfig();
    const orgEnabled = await readOrgCopilotEnabled(orgId);
    const gate = checkCopilotCallGate({ orgEnabled }, config);
    if (!gate.allowed) {
      await recordCopilotAuditEventSafely({
        ...auditContext,
        status: "blocked",
        reason: gate.reason,
      });
      return { status: "blocked", reason: gate.reason };
    }

    const detail = await getMissionDetail(access, missionId);
    if (!detail) {
      await recordCopilotAuditEventSafely({
        ...auditContext,
        status: "blocked",
        reason: "mission-not-found",
      });
      return { status: "blocked", reason: "mission-not-found" };
    }

    const facts = buildMissionBriefFacts(detail);
    if (facts.length === 0) {
      await recordCopilotAuditEventSafely({
        ...auditContext,
        status: "blocked",
        reason: "no-facts",
      });
      return { status: "blocked", reason: "no-facts" };
    }

    const reservation = await checkQuotaAndReserve({
      orgId,
      budgetTenthCents: estimateMissionBriefBudgetTenthCents({
        missionName: detail.mission.name,
        facts,
      }),
    });
    if (!reservation.allowed) {
      await recordCopilotAuditEventSafely({
        ...auditContext,
        status: "blocked",
        reason: "quota-exhausted",
        spendTenthCents: reservation.spendTenthCents,
        capTenthCents: reservation.capTenthCents,
        remainingTenthCents: reservation.remainingTenthCents,
      });
      return {
        status: "blocked",
        reason: "quota-exhausted",
        remainingTenthCents: reservation.remainingTenthCents,
        capTenthCents: reservation.capTenthCents,
        spendTenthCents: reservation.spendTenthCents,
      };
    }

    const brief = await generateMissionBrief({
      orgId,
      missionName: detail.mission.name,
      facts,
    });

    await recordSpend({
      quotaRowId: reservation.quotaRowId,
      deltaTenthCents: brief.spendTenthCents,
    });

    if (brief.status === "refused") {
      await recordCopilotAuditEventSafely({
        ...auditContext,
        status: "refused",
        reason: brief.reason,
        modelId: brief.modelId,
        spendTenthCents: brief.spendTenthCents,
        totalSentences: brief.totalSentences,
        keptSentences: brief.keptSentences,
        droppedSentences: brief.droppedSentences,
        citedFactCount: brief.citedFactIds.length,
        inputTokens: brief.inputTokens,
        outputTokens: brief.outputTokens,
      });
      return {
        status: "refused",
        reason: brief.reason,
        droppedSentences: brief.droppedSentences,
        totalSentences: brief.totalSentences,
        spendTenthCents: brief.spendTenthCents,
      };
    }

    await recordCopilotAuditEventSafely({
      ...auditContext,
      status: "ok",
      modelId: brief.modelId,
      spendTenthCents: brief.spendTenthCents,
      totalSentences: brief.totalSentences,
      keptSentences: brief.keptSentences,
      droppedSentences: brief.droppedSentences,
      citedFactCount: brief.citedFactIds.length,
      inputTokens: brief.inputTokens,
      outputTokens: brief.outputTokens,
    });

    return {
      status: "ok",
      text: brief.text,
      citedFactIds: brief.citedFactIds,
      totalSentences: brief.totalSentences,
      keptSentences: brief.keptSentences,
      droppedSentences: brief.droppedSentences,
      spendTenthCents: brief.spendTenthCents,
      modelId: brief.modelId,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown copilot error";
    if (auditContext) {
      await recordCopilotAuditEventSafely({
        ...auditContext,
        status: "error",
        reason: message,
      });
    }
    return { status: "error", message };
  }
}
