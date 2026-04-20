import { canPerformDroneOpsAction } from "@/lib/auth/actions";
import { getDroneOpsAccess } from "@/lib/auth/drone-ops-access";
import { getDatasetDetail } from "@/lib/missions/detail-data";

import { checkCopilotCallGate, getCopilotConfig } from "./config";
import { generateDataScoutSummary, type DataScoutFlag } from "./data-scout";
import { buildDataScoutInputs } from "./data-scout-facts";
import { estimateSpendTenthCents } from "./pricing";
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

const PRE_CHECK_ESTIMATE_TENTH_CENTS = estimateSpendTenthCents({
  modelId: "anthropic/claude-haiku-4.5",
  inputTokens: 1500,
  outputTokens: 200,
});

export async function runDataScoutForDataset(
  datasetId: string,
): Promise<DataScoutServerResult> {
  try {
    const access = await getDroneOpsAccess();
    if (!access.isAuthenticated) return { status: "blocked", reason: "not-authenticated" };
    if (!canPerformDroneOpsAction(access, "copilot.scout")) {
      return { status: "blocked", reason: "not-authorized" };
    }
    const orgId = access.org?.id;
    if (!orgId) return { status: "blocked", reason: "not-authorized" };

    const config = getCopilotConfig();
    const orgEnabled = await readOrgCopilotEnabled(orgId);
    const gate = checkCopilotCallGate({ orgEnabled }, config);
    if (!gate.allowed) return { status: "blocked", reason: gate.reason };

    const detail = await getDatasetDetail(access, datasetId);
    if (!detail) return { status: "blocked", reason: "dataset-not-found" };

    const { imageCount, flags, facts } = buildDataScoutInputs(detail);
    if (facts.length === 0) return { status: "blocked", reason: "no-facts" };
    if (flags.length === 0) return { status: "blocked", reason: "all-clean" };

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
    return { status: "error", message };
  }
}
