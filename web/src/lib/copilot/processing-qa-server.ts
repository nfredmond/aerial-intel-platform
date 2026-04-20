import { getDroneOpsAccess } from "@/lib/auth/drone-ops-access";
import { canPerformDroneOpsAction } from "@/lib/auth/actions";
import { getJobDetail } from "@/lib/missions/detail-data";

import {
  recordCopilotAuditEventSafely,
  type CopilotAuditContext,
} from "./audit";
import { checkCopilotCallGate, getCopilotConfig } from "./config";
import {
  estimateProcessingQaBudgetTenthCents,
  generateProcessingQaNote,
} from "./processing-qa";
import { buildProcessingQaFacts } from "./processing-qa-facts";
import { checkQuotaAndReserve, readOrgCopilotEnabled, recordSpend } from "./quota";

export type ProcessingQaServerResult =
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
        | "job-not-found"
        | "no-facts"
        | "quota-exhausted";
      remainingTenthCents?: number;
      capTenthCents?: number;
      spendTenthCents?: number;
    }
  | { status: "error"; message: string };

export async function runProcessingQaForJob(
  jobId: string,
): Promise<ProcessingQaServerResult> {
  let auditContext: CopilotAuditContext | null = null;
  try {
    const access = await getDroneOpsAccess();
    if (!access.isAuthenticated) return { status: "blocked", reason: "not-authenticated" };
    const orgId = access.org?.id;
    if (!orgId) return { status: "blocked", reason: "not-authorized" };
    auditContext = {
      orgId,
      actorUserId: access.user?.id ?? null,
      skill: "processing-qa",
      targetType: "job",
      targetId: jobId,
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

    const detail = await getJobDetail(access, jobId);
    if (!detail) {
      await recordCopilotAuditEventSafely({
        ...auditContext,
        status: "blocked",
        reason: "job-not-found",
      });
      return { status: "blocked", reason: "job-not-found" };
    }

    const facts = buildProcessingQaFacts(detail);
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
      budgetTenthCents: estimateProcessingQaBudgetTenthCents({ jobId, facts }),
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

    const note = await generateProcessingQaNote({ orgId, jobId, facts });

    await recordSpend({
      quotaRowId: reservation.quotaRowId,
      deltaTenthCents: note.spendTenthCents,
    });

    if (note.status === "refused") {
      await recordCopilotAuditEventSafely({
        ...auditContext,
        status: "refused",
        reason: note.reason,
        modelId: note.modelId,
        spendTenthCents: note.spendTenthCents,
        totalSentences: note.totalSentences,
        keptSentences: note.keptSentences,
        droppedSentences: note.droppedSentences,
        citedFactCount: note.citedFactIds.length,
        inputTokens: note.inputTokens,
        outputTokens: note.outputTokens,
      });
      return {
        status: "refused",
        reason: note.reason,
        droppedSentences: note.droppedSentences,
        totalSentences: note.totalSentences,
        spendTenthCents: note.spendTenthCents,
      };
    }

    await recordCopilotAuditEventSafely({
      ...auditContext,
      status: "ok",
      modelId: note.modelId,
      spendTenthCents: note.spendTenthCents,
      totalSentences: note.totalSentences,
      keptSentences: note.keptSentences,
      droppedSentences: note.droppedSentences,
      citedFactCount: note.citedFactIds.length,
      inputTokens: note.inputTokens,
      outputTokens: note.outputTokens,
    });

    return {
      status: "ok",
      text: note.text,
      citedFactIds: note.citedFactIds,
      totalSentences: note.totalSentences,
      keptSentences: note.keptSentences,
      droppedSentences: note.droppedSentences,
      spendTenthCents: note.spendTenthCents,
      modelId: note.modelId,
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
