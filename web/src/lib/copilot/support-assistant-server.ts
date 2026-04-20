import { canPerformDroneOpsAction } from "@/lib/auth/actions";
import { getDroneOpsAccess } from "@/lib/auth/drone-ops-access";

import { checkCopilotCallGate, getCopilotConfig } from "./config";
import {
  estimateSupportAssistantBudgetTenthCents,
  generateSupportAnswer,
  selectSupportFacts,
  type SupportDocFact,
} from "./support-assistant";
import { checkQuotaAndReserve, readOrgCopilotEnabled, recordSpend } from "./quota";

export type SupportAssistantServerResult =
  | {
      status: "ok";
      answer: string;
      sources: SupportDocFact[];
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
      sources: SupportDocFact[];
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
        | "empty-question"
        | "no-matching-docs"
        | "quota-exhausted";
      remainingTenthCents?: number;
      capTenthCents?: number;
      spendTenthCents?: number;
    }
  | { status: "error"; message: string };

export async function runSupportAssistantForQuestion(
  question: string,
): Promise<SupportAssistantServerResult> {
  try {
    const trimmedQuestion = question.trim();
    if (trimmedQuestion.length < 8) {
      return { status: "blocked", reason: "empty-question" };
    }

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

    const facts = selectSupportFacts(trimmedQuestion);
    if (facts.length === 0) return { status: "blocked", reason: "no-matching-docs" };

    const reservation = await checkQuotaAndReserve({
      orgId,
      budgetTenthCents: estimateSupportAssistantBudgetTenthCents({
        question: trimmedQuestion,
        facts,
      }),
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

    const result = await generateSupportAnswer({
      orgId,
      question: trimmedQuestion,
      facts,
    });

    await recordSpend({
      quotaRowId: reservation.quotaRowId,
      deltaTenthCents: result.spendTenthCents,
    });

    if (result.status === "refused") {
      return {
        status: "refused",
        reason: result.reason,
        sources: result.sources,
        droppedSentences: result.droppedSentences,
        totalSentences: result.totalSentences,
        spendTenthCents: result.spendTenthCents,
      };
    }

    return {
      status: "ok",
      answer: result.answer,
      sources: result.sources,
      citedFactIds: result.citedFactIds,
      totalSentences: result.totalSentences,
      keptSentences: result.keptSentences,
      droppedSentences: result.droppedSentences,
      spendTenthCents: result.spendTenthCents,
      modelId: result.modelId,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown copilot error";
    return { status: "error", message };
  }
}
