import { canPerformDroneOpsAction } from "@/lib/auth/actions";
import { getDroneOpsAccess } from "@/lib/auth/drone-ops-access";

import {
  recordCopilotAuditEventSafely,
  type CopilotAuditContext,
} from "./audit";
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
  let auditContext: CopilotAuditContext | null = null;
  try {
    const trimmedQuestion = question.trim();
    const access = await getDroneOpsAccess();
    if (!access.isAuthenticated) return { status: "blocked", reason: "not-authenticated" };
    const orgId = access.org?.id;
    if (!orgId) return { status: "blocked", reason: "not-authorized" };
    auditContext = {
      orgId,
      actorUserId: access.user?.id ?? null,
      skill: "support-assistant",
      targetType: "support",
    };
    if (!canPerformDroneOpsAction(access, "copilot.generate")) {
      await recordCopilotAuditEventSafely({
        ...auditContext,
        status: "blocked",
        reason: "not-authorized",
      });
      return { status: "blocked", reason: "not-authorized" };
    }

    if (trimmedQuestion.length < 8) {
      await recordCopilotAuditEventSafely({
        ...auditContext,
        status: "blocked",
        reason: "empty-question",
      });
      return { status: "blocked", reason: "empty-question" };
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

    const facts = selectSupportFacts(trimmedQuestion);
    if (facts.length === 0) {
      await recordCopilotAuditEventSafely({
        ...auditContext,
        status: "blocked",
        reason: "no-matching-docs",
      });
      return { status: "blocked", reason: "no-matching-docs" };
    }

    const reservation = await checkQuotaAndReserve({
      orgId,
      budgetTenthCents: estimateSupportAssistantBudgetTenthCents({
        question: trimmedQuestion,
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
      await recordCopilotAuditEventSafely({
        ...auditContext,
        status: "refused",
        reason: result.reason,
        modelId: result.modelId,
        spendTenthCents: result.spendTenthCents,
        totalSentences: result.totalSentences,
        keptSentences: result.keptSentences,
        droppedSentences: result.droppedSentences,
        citedFactCount: result.citedFactIds.length,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
      });
      return {
        status: "refused",
        reason: result.reason,
        sources: result.sources,
        droppedSentences: result.droppedSentences,
        totalSentences: result.totalSentences,
        spendTenthCents: result.spendTenthCents,
      };
    }

    await recordCopilotAuditEventSafely({
      ...auditContext,
      status: "ok",
      modelId: result.modelId,
      spendTenthCents: result.spendTenthCents,
      totalSentences: result.totalSentences,
      keptSentences: result.keptSentences,
      droppedSentences: result.droppedSentences,
      citedFactCount: result.citedFactIds.length,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
    });

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
