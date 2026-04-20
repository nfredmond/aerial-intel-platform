import { canPerformDroneOpsAction } from "@/lib/auth/actions";
import { getDroneOpsAccess } from "@/lib/auth/drone-ops-access";
import { getArtifactDetail, getString } from "@/lib/missions/detail-data";
import {
  selectArtifactApprovalsByArtifact,
  selectArtifactCommentsByArtifact,
} from "@/lib/supabase/admin";

import { checkCopilotCallGate, getCopilotConfig } from "./config";
import { checkQuotaAndReserve, readOrgCopilotEnabled, recordSpend } from "./quota";
import { estimateReportSummaryBudgetTenthCents, generateReportSummary } from "./report-summary";
import { buildReportSummaryFacts } from "./report-summary-facts";

export type ReportSummaryServerResult =
  | {
      status: "ok";
      summary: string;
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
        | "artifact-not-found"
        | "no-facts"
        | "quota-exhausted";
      remainingTenthCents?: number;
      capTenthCents?: number;
      spendTenthCents?: number;
    }
  | { status: "error"; message: string };

export async function runReportSummaryForArtifact(
  artifactId: string,
): Promise<ReportSummaryServerResult> {
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

    const detail = await getArtifactDetail(access, artifactId);
    if (!detail) return { status: "blocked", reason: "artifact-not-found" };

    const [comments, approvals] = await Promise.all([
      selectArtifactCommentsByArtifact(detail.output.id).catch(() => []),
      selectArtifactApprovalsByArtifact(detail.output.id).catch(() => []),
    ]);
    const facts = buildReportSummaryFacts({ detail, comments, approvals });
    if (facts.length === 0) return { status: "blocked", reason: "no-facts" };

    const artifactName = getString(detail.metadata.name, detail.output.kind.replaceAll("_", " "));
    const reservation = await checkQuotaAndReserve({
      orgId,
      budgetTenthCents: estimateReportSummaryBudgetTenthCents({
        artifactName,
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

    const result = await generateReportSummary({
      orgId,
      artifactName,
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
        droppedSentences: result.droppedSentences,
        totalSentences: result.totalSentences,
        spendTenthCents: result.spendTenthCents,
      };
    }

    return {
      status: "ok",
      summary: result.summary,
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
