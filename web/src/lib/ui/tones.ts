export type Tone = "neutral" | "info" | "success" | "warning" | "danger";

export function statusPillClassName(tone: Tone): string {
  return `status-pill status-pill--${tone}`;
}

export function calloutClassName(tone: Tone): string {
  const suffix = tone === "danger" ? "error" : tone;
  return `callout callout-${suffix}`;
}

export function jobStatusTone(status: string): Tone {
  switch (status) {
    case "queued":
      return "neutral";
    case "running":
      return "info";
    case "needs_review":
      return "warning";
    case "completed":
      return "success";
    case "failed":
    case "cancelled":
      return "danger";
    default:
      return "neutral";
  }
}

export function jobStageTone(stage: string): Tone {
  switch (stage) {
    case "intake":
      return "neutral";
    case "dispatch_prepared":
    case "dispatched":
      return "info";
    case "processing":
      return "info";
    case "awaiting_qa":
    case "awaiting_output_import":
      return "warning";
    case "qa_complete":
    case "delivered":
      return "success";
    case "failed":
      return "danger";
    default:
      return "neutral";
  }
}

export function handoffStageTone(stage: string): Tone {
  switch (stage) {
    case "requested":
      return "neutral";
    case "acknowledged":
    case "in_progress":
      return "info";
    case "needs_review":
      return "warning";
    case "completed":
      return "success";
    case "rejected":
      return "danger";
    default:
      return "neutral";
  }
}

export function artifactStatusTone(status: string): Tone {
  switch (status) {
    case "draft":
      return "neutral";
    case "processing":
      return "info";
    case "ready":
      return "success";
    case "shared":
      return "success";
    default:
      return "neutral";
  }
}

export function outputArtifactStatusTone(status: string): Tone {
  return artifactStatusTone(status);
}

export function missionStatusTone(status: string): Tone {
  switch (status) {
    case "planned":
      return "neutral";
    case "active":
      return "info";
    case "complete":
      return "success";
    case "cancelled":
      return "warning";
    default:
      return "neutral";
  }
}

export function missionStageTone(stage: string): Tone {
  switch (stage) {
    case "planned":
      return "neutral";
    case "ingest_ready":
      return "info";
    case "processing":
      return "info";
    case "qa":
      return "warning";
    case "delivered":
      return "success";
    default:
      return "neutral";
  }
}

export function missionOutputStatusTone(status: string): Tone {
  switch (status) {
    case "missing":
      return "warning";
    case "processing":
      return "info";
    case "ready":
      return "success";
    default:
      return "neutral";
  }
}

export function datasetStatusTone(status: string): Tone {
  switch (status) {
    case "uploading":
      return "info";
    case "ready":
      return "success";
    case "flagged":
      return "warning";
    default:
      return "neutral";
  }
}

export function ingestStatusTone(status: string): Tone {
  switch (status) {
    case "draft":
      return "neutral";
    case "recording":
      return "info";
    case "captured":
      return "info";
    case "verified":
      return "success";
    case "blocked":
      return "danger";
    default:
      return "neutral";
  }
}

export function verificationReadinessTone(readiness: string): Tone {
  switch (readiness) {
    case "pending":
      return "warning";
    case "partial":
      return "info";
    case "ready":
      return "success";
    case "not_applicable":
      return "neutral";
    default:
      return "neutral";
  }
}
