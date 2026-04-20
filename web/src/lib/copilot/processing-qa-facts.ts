import type { JobDetail } from "@/lib/missions/detail-data";
import type { Json } from "@/lib/supabase/types";

import type { ProcessingQaFact } from "./processing-qa";

function pushFact(out: ProcessingQaFact[], id: string, label: string, value: unknown): void {
  if (value === undefined || value === null) return;
  const s = typeof value === "string" ? value : String(value);
  if (!s.trim()) return;
  out.push({ id, label, value: s });
}

function readRecord(value: Json | null | undefined): Record<string, Json> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, Json>;
}

function readString(v: Json | undefined): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v : null;
}

function readNumber(v: Json | undefined): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function readBoolean(v: Json | undefined): boolean | null {
  return typeof v === "boolean" ? v : null;
}

/**
 * Pulls a citation-safe set of facts off the loaded job detail for the
 * processing-QA skill. Trims the list aggressively — the model only needs
 * enough context to name a likely cause, not to audit the job.
 */
export function buildProcessingQaFacts(detail: JobDetail): ProcessingQaFact[] {
  const facts: ProcessingQaFact[] = [];
  const job = detail.job;
  const shortId = job.id.slice(0, 8);

  pushFact(facts, `job:${job.id}:engine`, "Engine", job.engine);
  pushFact(facts, `job:${job.id}:status`, "Status", job.status);
  pushFact(facts, `job:${job.id}:stage`, "Stage", job.stage ?? "");
  if (typeof job.progress === "number") {
    pushFact(facts, `job:${job.id}:progress`, "Progress (%)", String(job.progress));
  }
  if (job.preset_id) pushFact(facts, `job:${job.id}:preset`, "Preset", job.preset_id);
  if (job.completed_at) {
    pushFact(facts, `job:${job.id}:completed_at`, "Completed at", job.completed_at);
  }

  const outputSummary = readRecord(job.output_summary ?? null);
  const benchmark = outputSummary ? readRecord(outputSummary.benchmarkSummary) ?? outputSummary : null;

  if (benchmark) {
    const exitCode = readNumber(benchmark.run_exit_code);
    if (exitCode !== null) {
      pushFact(facts, `benchmark:${job.id}:exit_code`, "ODM exit code", String(exitCode));
    }
    const imageCount = readNumber(benchmark.image_count);
    if (imageCount !== null) {
      pushFact(facts, `benchmark:${job.id}:image_count`, "Image count", String(imageCount));
    }
    const durationSeconds = readNumber(benchmark.duration_seconds);
    if (durationSeconds !== null) {
      pushFact(
        facts,
        `benchmark:${job.id}:duration_s`,
        "Duration (s)",
        String(Math.round(durationSeconds)),
      );
    }
    const odmArgs = readString(benchmark.odm_args);
    if (odmArgs) {
      pushFact(
        facts,
        `benchmark:${job.id}:odm_args`,
        "ODM args",
        odmArgs.length > 200 ? `${odmArgs.slice(0, 200)}…` : odmArgs,
      );
    }
    const minimumPass = readBoolean(benchmark.minimum_pass);
    if (minimumPass !== null) {
      pushFact(
        facts,
        `benchmark:${job.id}:minimum_pass`,
        "Minimum-pass QA",
        String(minimumPass),
      );
    }
    const requiredOutputsPresent = readBoolean(benchmark.required_outputs_present);
    if (requiredOutputsPresent !== null) {
      pushFact(
        facts,
        `benchmark:${job.id}:required_outputs_present`,
        "Required outputs present",
        String(requiredOutputsPresent),
      );
    }
    const missing = Array.isArray(benchmark.missing_required_outputs)
      ? (benchmark.missing_required_outputs as Json[])
          .filter((v): v is string => typeof v === "string")
      : [];
    if (missing.length > 0) {
      pushFact(
        facts,
        `benchmark:${job.id}:missing_outputs`,
        "Missing required outputs",
        missing.join(","),
      );
    }
    const outputs = readRecord(benchmark.outputs);
    if (outputs) {
      for (const [kind, node] of Object.entries(outputs)) {
        const rec = readRecord(node);
        if (!rec) continue;
        const exists = readBoolean(rec.exists);
        const nonZero = readBoolean(rec.non_zero_size);
        if (exists !== null) {
          pushFact(
            facts,
            `output:${job.id}:${kind}:exists`,
            `Output ${kind} exists`,
            String(exists),
          );
        }
        if (nonZero !== null && exists) {
          pushFact(
            facts,
            `output:${job.id}:${kind}:non_zero`,
            `Output ${kind} non-zero`,
            String(nonZero),
          );
        }
      }
    }
  }

  const stageChecklist = outputSummary && Array.isArray(outputSummary.stageChecklist)
    ? (outputSummary.stageChecklist as Json[])
    : [];
  for (const item of stageChecklist.slice(0, 8)) {
    const rec = readRecord(item);
    if (!rec) continue;
    const label = readString(rec.label) ?? readString(rec.name);
    const status = readString(rec.status);
    if (label && status) {
      const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
      pushFact(
        facts,
        `stage:${job.id}:${slug}`,
        `Stage ${label}`,
        status,
      );
    }
  }

  const nodeodm = outputSummary ? readRecord(outputSummary.nodeodm) : null;
  if (nodeodm) {
    const taskUuid = readString(nodeodm.taskUuid);
    if (taskUuid) {
      pushFact(facts, `nodeodm:${job.id}:task_uuid`, "NodeODM task", taskUuid);
    }
    const taskStatus = readString(nodeodm.taskStatus);
    if (taskStatus) {
      pushFact(facts, `nodeodm:${job.id}:task_status`, "NodeODM task status", taskStatus);
    }
  }

  if (detail.dataset) {
    const meta = readRecord(detail.dataset.metadata ?? null);
    const imageCount = meta ? readNumber(meta.image_count) : null;
    if (imageCount !== null) {
      pushFact(
        facts,
        `dataset:${detail.dataset.id}:image_count`,
        "Dataset image count",
        String(imageCount),
      );
    }
  }

  if (detail.outputs.length > 0) {
    pushFact(
      facts,
      `job:${job.id}:output_count`,
      `Artifacts recorded for ${shortId}`,
      String(detail.outputs.length),
    );
  }

  return facts;
}
