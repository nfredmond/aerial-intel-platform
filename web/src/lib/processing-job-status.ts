/**
 * Single source of truth for the drone_processing_jobs.status vocabulary.
 *
 * These values MUST match the check constraint in
 * supabase/migrations/202603150001_aerial_ops_core_foundation.sql; a unit test
 * parses that migration and fails if the two drift. Route code must never
 * invent statuses outside this set — PostgREST rejects them at write time,
 * which the mocked route tests cannot see.
 */
export const PROCESSING_JOB_STATUSES = [
  "queued",
  "running",
  "succeeded",
  "failed",
  "canceled",
  "needs_review",
] as const;

export type ProcessingJobStatus = (typeof PROCESSING_JOB_STATUSES)[number];

/** Statuses a job can hold while work is still expected to progress. */
export const ACTIVE_PROCESSING_JOB_STATUSES = ["queued", "running"] as const satisfies readonly ProcessingJobStatus[];

export function isProcessingJobStatus(value: unknown): value is ProcessingJobStatus {
  return (
    typeof value === "string" && (PROCESSING_JOB_STATUSES as readonly string[]).includes(value)
  );
}

/** PostgREST `in.(...)` filter fragment for jobs that are still in flight. */
export const ACTIVE_PROCESSING_JOB_STATUS_FILTER = `in.(${ACTIVE_PROCESSING_JOB_STATUSES.join(",")})`;
