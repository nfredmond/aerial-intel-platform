import { getDroneOpsAccess } from "@/lib/auth/drone-ops-access";
import { canPerformDroneOpsAction } from "@/lib/auth/actions";
import { getJobDetail } from "@/lib/missions/detail-data";

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

    const detail = await getJobDetail(access, jobId);
    if (!detail) return { status: "blocked", reason: "job-not-found" };

    const facts = buildProcessingQaFacts(detail);
    if (facts.length === 0) return { status: "blocked", reason: "no-facts" };

    const reservation = await checkQuotaAndReserve({
      orgId,
      budgetTenthCents: estimateProcessingQaBudgetTenthCents({ jobId, facts }),
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

    const note = await generateProcessingQaNote({ orgId, jobId, facts });

    await recordSpend({
      quotaRowId: reservation.quotaRowId,
      deltaTenthCents: note.spendTenthCents,
    });

    if (note.status === "refused") {
      return {
        status: "refused",
        reason: note.reason,
        droppedSentences: note.droppedSentences,
        totalSentences: note.totalSentences,
        spendTenthCents: note.spendTenthCents,
      };
    }

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
    return { status: "error", message };
  }
}
