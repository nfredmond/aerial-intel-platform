import { getDroneOpsAccess } from "@/lib/auth/drone-ops-access";
import { canPerformDroneOpsAction } from "@/lib/auth/actions";
import { getMissionDetail } from "@/lib/missions/detail-data";

import { checkCopilotCallGate, getCopilotConfig } from "./config";
import { generateMissionBrief } from "./mission-brief";
import { buildMissionBriefFacts } from "./mission-brief-facts";
import { estimateSpendTenthCents } from "./pricing";
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

const PRE_CHECK_ESTIMATE_TENTH_CENTS = estimateSpendTenthCents({
  modelId: "anthropic/claude-opus-4.7",
  inputTokens: 2000,
  outputTokens: 500,
});

export async function runMissionBriefForMission(
  missionId: string,
): Promise<MissionBriefServerResult> {
  try {
    const access = await getDroneOpsAccess();
    if (!access.isAuthenticated) return { status: "blocked", reason: "not-authenticated" };
    if (!canPerformDroneOpsAction(access, "copilot.generate")) {
      return { status: "blocked", reason: "not-authorized" };
    }
    const orgId = access.org?.id;
    if (!orgId) return { status: "blocked", reason: "not-authorized" };

    const config = getCopilotConfig();
    const orgEnabled = await readOrgCopilotEnabled(orgId);
    const gate = checkCopilotCallGate({ orgEnabled }, config);
    if (!gate.allowed) return { status: "blocked", reason: gate.reason };

    const detail = await getMissionDetail(access, missionId);
    if (!detail) return { status: "blocked", reason: "mission-not-found" };

    const facts = buildMissionBriefFacts(detail);
    if (facts.length === 0) return { status: "blocked", reason: "no-facts" };

    const reservation = await checkQuotaAndReserve({
      orgId,
      estimateTenthCents: PRE_CHECK_ESTIMATE_TENTH_CENTS,
    });
    if (!reservation.allowed) {
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
      return {
        status: "refused",
        reason: brief.reason,
        droppedSentences: brief.droppedSentences,
        totalSentences: brief.totalSentences,
        spendTenthCents: brief.spendTenthCents,
      };
    }

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
    return { status: "error", message };
  }
}
