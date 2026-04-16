export function formatJobStatus(status: string): string {
  switch (status) {
    case "running":
      return "Running";
    case "queued":
      return "Queued";
    case "needs_review":
      return "Needs review";
    case "completed":
      return "Completed";
    case "failed":
      return "Failed";
    case "cancelled":
      return "Cancelled";
    default:
      return status;
  }
}

export function formatJobStage(stage: string): string {
  switch (stage) {
    case "intake":
      return "Intake";
    case "dispatch_prepared":
      return "Dispatch prepared";
    case "dispatched":
      return "Dispatched";
    case "processing":
      return "Processing";
    case "awaiting_output_import":
      return "Awaiting output import";
    case "awaiting_qa":
      return "Awaiting QA";
    case "qa_complete":
      return "QA complete";
    case "delivered":
      return "Delivered";
    case "failed":
      return "Failed";
    default:
      return stage;
  }
}

export function formatHandoffStage(stage: string): string {
  switch (stage) {
    case "requested":
      return "Requested";
    case "acknowledged":
      return "Acknowledged";
    case "in_progress":
      return "In progress";
    case "needs_review":
      return "Needs review";
    case "completed":
      return "Completed";
    case "rejected":
      return "Rejected";
    default:
      return stage;
  }
}

export function formatOutputArtifactStatus(status: string): string {
  switch (status) {
    case "ready":
      return "Ready";
    case "processing":
      return "Processing";
    case "draft":
      return "Draft";
    case "shared":
      return "Shared";
    default:
      return status;
  }
}

export function formatDatasetStatus(status: string): string {
  switch (status) {
    case "ready":
      return "Ready";
    case "uploading":
      return "Uploading";
    case "flagged":
      return "Flagged";
    default:
      return status;
  }
}

export function formatMissionStatus(status: string): string {
  switch (status) {
    case "planned":
      return "Planned";
    case "active":
      return "Active";
    case "complete":
      return "Complete";
    case "cancelled":
      return "Cancelled";
    default:
      return status;
  }
}

export function formatMissionStage(stage: string): string {
  switch (stage) {
    case "planned":
      return "Planned";
    case "ingest_ready":
      return "Ingest ready";
    case "processing":
      return "Processing";
    case "qa":
      return "QA";
    case "delivered":
      return "Delivered";
    default:
      return stage;
  }
}

export function formatMissionOutputStatus(status: string): string {
  switch (status) {
    case "ready":
      return "Ready";
    case "processing":
      return "Processing";
    case "missing":
      return "Missing";
    default:
      return status;
  }
}

export function formatIngestStatus(status: string): string {
  switch (status) {
    case "draft":
      return "Draft";
    case "recording":
      return "Recording";
    case "captured":
      return "Captured";
    case "verified":
      return "Verified";
    case "blocked":
      return "Blocked";
    default:
      return status;
  }
}

export function formatMissionType(type: string): string {
  switch (type) {
    case "corridor_survey":
      return "Corridor survey";
    case "site_inspection":
      return "Site inspection";
    case "aoi_capture":
      return "AOI capture";
    case "general":
      return "General";
    default:
      return type;
  }
}

export function formatVerificationReadiness(readiness: string): string {
  switch (readiness) {
    case "pending":
      return "Verification pending";
    case "partial":
      return "Partially verified";
    case "ready":
      return "Verification ready";
    case "not_applicable":
      return "Not applicable";
    default:
      return readiness;
  }
}
