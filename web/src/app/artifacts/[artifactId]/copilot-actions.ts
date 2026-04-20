"use server";

import {
  runReportSummaryForArtifact,
  type ReportSummaryServerResult,
} from "@/lib/copilot/report-summary-server";

export type ReportSummaryFormState =
  | ReportSummaryServerResult
  | { status: "idle" };

export async function generateReportSummaryAction(
  _prev: ReportSummaryFormState,
  formData: FormData,
): Promise<ReportSummaryFormState> {
  const artifactId = formData.get("artifactId");
  if (typeof artifactId !== "string" || !artifactId) {
    return { status: "error", message: "Missing artifactId" };
  }
  return runReportSummaryForArtifact(artifactId);
}
