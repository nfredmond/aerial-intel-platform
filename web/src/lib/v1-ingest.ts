export type V1IngestSessionEvidence = {
  status: string;
  sourceType: string;
  sourceFilename: string | null;
  sourceZipPath: string | null;
  extractedDatasetPath: string | null;
  benchmarkSummaryPath: string | null;
  runLogPath: string | null;
  reviewBundleZipPath: string | null;
  imageCount: number | null;
  fileSizeBytes: number | null;
  reviewBundleReady: boolean;
  truthfulPass: boolean | null;
};

function hasText(value: string | null | undefined) {
  return typeof value === "string" && value.trim().length > 0;
}

export function formatFileSize(bytes: number | string | null | undefined) {
  const parsed = typeof bytes === "string" ? Number(bytes) : bytes;
  if (!Number.isFinite(parsed) || (parsed ?? 0) <= 0) {
    return "Not recorded";
  }

  const value = parsed as number;
  const units = ["B", "KB", "MB", "GB", "TB"];
  let unitIndex = 0;
  let size = value;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  const digits = size >= 100 || unitIndex === 0 ? 0 : size >= 10 ? 1 : 2;
  return `${size.toFixed(digits)} ${units[unitIndex]}`;
}

export function summarizeV1IngestSession(session: V1IngestSessionEvidence) {
  const blockers = [] as string[];
  const zipEvidenceRecorded = hasText(session.sourceFilename) || hasText(session.sourceZipPath);

  if (!zipEvidenceRecorded) {
    blockers.push("Source ZIP evidence is not recorded yet.");
  }

  if (!hasText(session.extractedDatasetPath)) {
    blockers.push("Extracted dataset workspace path is missing.");
  }

  if (!hasText(session.benchmarkSummaryPath)) {
    blockers.push("Benchmark summary path is missing.");
  }

  if (!hasText(session.runLogPath)) {
    blockers.push("Run log path is missing.");
  }

  if (!hasText(session.reviewBundleZipPath)) {
    blockers.push("Review bundle ZIP path is missing.");
  }

  if (!session.reviewBundleReady) {
    blockers.push("Review bundle is not marked ready for operator download yet.");
  }

  if (session.truthfulPass === false) {
    blockers.push("Latest recorded run did not clear the truthful v1 pass bar.");
  }

  if (session.truthfulPass === null) {
    blockers.push("Truthful v1 pass/fail has not been recorded yet.");
  }

  const contractCleared = blockers.length === 0 && session.truthfulPass === true;

  let stageLabel = "Intake recorded";
  if (contractCleared) {
    stageLabel = "Truthful v1 ready";
  } else if (session.reviewBundleReady) {
    stageLabel = "Bundle ready for review";
  } else if (hasText(session.benchmarkSummaryPath) || hasText(session.runLogPath)) {
    stageLabel = "Benchmark evidence captured";
  } else if (hasText(session.extractedDatasetPath)) {
    stageLabel = "Dataset extracted";
  } else if (zipEvidenceRecorded) {
    stageLabel = "ZIP evidence captured";
  }

  const nextStep = contractCleared
    ? "Open the review bundle and decide whether to import or share the evidence-backed run."
    : blockers[0] ?? "Continue recording evidence for this intake session.";

  return {
    contractCleared,
    stageLabel,
    blockers,
    nextStep,
    zipEvidenceRecorded,
  };
}
