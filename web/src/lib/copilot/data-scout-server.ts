import { canPerformDroneOpsAction } from "@/lib/auth/actions";
import { getDroneOpsAccess } from "@/lib/auth/drone-ops-access";
import { getDatasetDetail } from "@/lib/missions/detail-data";

import {
  recordCopilotAuditEventSafely,
  type CopilotAuditContext,
} from "./audit";
import { checkCopilotCallGate, getCopilotConfig } from "./config";
import {
  estimateDataScoutBudgetTenthCents,
  generateDataScoutSummary,
  type DataScoutFlag,
} from "./data-scout";
import { buildDataScoutInputs } from "./data-scout-facts";
import { checkQuotaAndReserve, readOrgCopilotEnabled, recordSpend } from "./quota";

export type DataScoutServerResult =
  | {
      status: "ok";
      summary: string;
      flags: DataScoutFlag[];
      imageCount: number;
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
      flags: DataScoutFlag[];
      imageCount: number;
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
        | "dataset-not-found"
        | "no-facts"
        | "all-clean"
        | "quota-exhausted";
      remainingTenthCents?: number;
      capTenthCents?: number;
      spendTenthCents?: number;
    }
  | { status: "error"; message: string };

export async function runDataScoutForDataset(
  datasetId: string,
): Promise<DataScoutServerResult> {
  let auditContext: CopilotAuditContext | null = null;
  try {
    const access = await getDroneOpsAccess();
    if (!access.isAuthenticated) return { status: "blocked", reason: "not-authenticated" };
    const orgId = access.org?.id;
    if (!orgId) return { status: "blocked", reason: "not-authorized" };
    auditContext = {
      orgId,
      actorUserId: access.user?.id ?? null,
      skill: "data-scout",
      targetType: "dataset",
      targetId: datasetId,
    };
    if (!canPerformDroneOpsAction(access, "copilot.scout")) {
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

    const detail = await getDatasetDetail(access, datasetId);
    if (!detail) {
      await recordCopilotAuditEventSafely({
        ...auditContext,
        status: "blocked",
        reason: "dataset-not-found",
      });
      return { status: "blocked", reason: "dataset-not-found" };
    }

    const { imageCount, flags, facts } = buildDataScoutInputs(detail);
    if (facts.length === 0) {
      await recordCopilotAuditEventSafely({
        ...auditContext,
        status: "blocked",
        reason: "no-facts",
      });
      return { status: "blocked", reason: "no-facts" };
    }
    if (flags.length === 0) {
      await recordCopilotAuditEventSafely({
        ...auditContext,
        status: "blocked",
        reason: "all-clean",
      });
      return { status: "blocked", reason: "all-clean" };
    }

    const reservation = await checkQuotaAndReserve({
      orgId,
      budgetTenthCents: estimateDataScoutBudgetTenthCents({
        datasetName: detail.dataset.name,
        imageCount,
        flags,
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

    const result = await generateDataScoutSummary({
      orgId,
      datasetName: detail.dataset.name,
      imageCount,
      flags,
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
        flags: result.flags,
        imageCount: result.imageCount,
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
      summary: result.summary,
      flags: result.flags,
      imageCount: result.imageCount,
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
