import { getArtifactHandoff } from "@/lib/artifact-handoff";
import {
  getBenchmarkOutputForArtifact,
  getBenchmarkSummaryView,
} from "@/lib/benchmark-summary";
import type { ArtifactDetail } from "@/lib/missions/detail-data";
import { getString } from "@/lib/missions/detail-data";
import type {
  ArtifactApprovalRow,
  ArtifactCommentRow,
} from "@/lib/supabase/admin";

export type ReportSummaryFact = {
  id: string;
  label: string;
  value: string;
};

function pushFact(
  facts: ReportSummaryFact[],
  id: string,
  label: string,
  value: string | null | undefined,
) {
  const trimmed = value?.trim();
  if (!trimmed) return;
  facts.push({ id, label, value: trimmed });
}

function eventTitle(event: ArtifactDetail["events"][number]) {
  const payload =
    event.payload && typeof event.payload === "object" && !Array.isArray(event.payload)
      ? (event.payload as Record<string, unknown>)
      : {};
  return typeof payload.title === "string" && payload.title.trim()
    ? payload.title
    : event.event_type;
}

export function buildReportSummaryFacts(input: {
  detail: ArtifactDetail;
  comments?: ArtifactCommentRow[];
  approvals?: ArtifactApprovalRow[];
}): ReportSummaryFact[] {
  const { detail } = input;
  const facts: ReportSummaryFact[] = [];
  const artifactId = detail.output.id;
  const artifactName = getString(detail.metadata.name, detail.output.kind.replaceAll("_", " "));
  const handoff = getArtifactHandoff(detail.metadata);
  const benchmarkSummary = getBenchmarkSummaryView(
    detail.outputSummary.benchmarkSummary ?? detail.outputSummary,
  );
  const benchmarkOutput = getBenchmarkOutputForArtifact(benchmarkSummary, detail.output.kind);
  const approvals = input.approvals ?? [];
  const comments = input.comments ?? [];
  const latestApproval = approvals[0] ?? null;
  const unresolvedComments = comments.filter((comment) => !comment.resolved_at).length;

  pushFact(facts, `artifact:${artifactId}:name`, "Artifact", artifactName);
  pushFact(facts, `artifact:${artifactId}:kind`, "Artifact kind", detail.output.kind);
  pushFact(facts, `artifact:${artifactId}:status`, "Artifact status", detail.output.status);
  pushFact(
    facts,
    `artifact:${artifactId}:format`,
    "Artifact format",
    getString(detail.metadata.format, "Derived artifact"),
  );
  pushFact(
    facts,
    `artifact:${artifactId}:delivery`,
    "Delivery note",
    getString(detail.metadata.delivery, "Delivery note pending"),
  );
  pushFact(
    facts,
    `artifact:${artifactId}:storage`,
    "Storage evidence",
    detail.output.storage_bucket && detail.output.storage_path
      ? `${detail.output.storage_bucket}/${detail.output.storage_path}`
      : "No protected storage path is attached yet.",
  );

  pushFact(facts, `artifact:${artifactId}:handoff`, "Handoff stage", handoff.stageLabel);
  pushFact(facts, `artifact:${artifactId}:next_action`, "Next action", handoff.nextAction);
  pushFact(facts, `artifact:${artifactId}:handoff_note`, "Handoff note", handoff.note);

  pushFact(facts, `mission:${detail.mission?.id ?? artifactId}:name`, "Mission", detail.mission?.name);
  pushFact(
    facts,
    `mission:${detail.mission?.id ?? artifactId}:objective`,
    "Mission objective",
    detail.mission?.objective,
  );
  pushFact(facts, `project:${detail.project?.id ?? artifactId}:name`, "Project", detail.project?.name);
  pushFact(facts, `site:${detail.site?.id ?? artifactId}:name`, "Site", detail.site?.name);
  pushFact(facts, `dataset:${detail.dataset?.id ?? artifactId}:name`, "Dataset", detail.dataset?.name);
  pushFact(facts, `dataset:${detail.dataset?.id ?? artifactId}:status`, "Dataset status", detail.dataset?.status);

  if (detail.job) {
    pushFact(facts, `job:${detail.job.id}:engine`, "Processing engine", detail.job.engine);
    pushFact(facts, `job:${detail.job.id}:preset`, "Processing preset", detail.job.preset_id);
    pushFact(facts, `job:${detail.job.id}:status`, "Job status", detail.job.status);
    pushFact(facts, `job:${detail.job.id}:stage`, "Job stage", detail.job.stage);
    pushFact(facts, `job:${detail.job.id}:progress`, "Job progress", `${detail.job.progress}%`);
  }

  pushFact(
    facts,
    `job:${detail.job?.id ?? artifactId}:checkpoint`,
    "Latest checkpoint",
    getString(detail.outputSummary.latestCheckpoint, "No checkpoint recorded yet."),
  );

  if (benchmarkSummary) {
    pushFact(
      facts,
      `benchmark:${artifactId}:run`,
      "Benchmark run",
      `${benchmarkSummary.status}; ${benchmarkSummary.imageCount} images; ${benchmarkSummary.durationSeconds} seconds; exit code ${benchmarkSummary.runExitCode}.`,
    );
    pushFact(
      facts,
      `benchmark:${artifactId}:qa`,
      "Benchmark QA",
      benchmarkSummary.minimumPass
        ? "Minimum QA gate passed."
        : `Minimum QA gate did not pass; missing required outputs: ${
            benchmarkSummary.missingRequiredOutputs.join(", ") || "not listed"
          }.`,
    );
    if (benchmarkOutput) {
      pushFact(
        facts,
        `benchmark:${artifactId}:output`,
        "Artifact benchmark output",
        `${benchmarkOutput.key} exists=${benchmarkOutput.exists}; non_zero_size=${benchmarkOutput.nonZeroSize}; size_bytes=${benchmarkOutput.sizeBytes}; path=${benchmarkOutput.path}.`,
      );
    }
  }

  pushFact(
    facts,
    `review:${artifactId}:approvals`,
    "Approval posture",
    latestApproval
      ? `Latest decision is ${latestApproval.decision}${latestApproval.note ? ` with note: ${latestApproval.note}` : ""}.`
      : "No reviewer approval decision is recorded.",
  );
  pushFact(
    facts,
    `review:${artifactId}:comments`,
    "Comment posture",
    `${comments.length} comments recorded; ${unresolvedComments} unresolved.`,
  );

  detail.events.slice(0, 3).forEach((event, index) => {
    pushFact(
      facts,
      `event:${event.id ?? `${artifactId}:${index}`}`,
      "Recent event",
      `${eventTitle(event)} at ${event.created_at}.`,
    );
  });

  return facts;
}
