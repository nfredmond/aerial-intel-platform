import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  ACTIVE_PROCESSING_JOB_STATUSES,
  PROCESSING_JOB_STATUSES,
  isProcessingJobStatus,
} from "./processing-job-status";

const CORE_MIGRATION = path.resolve(
  __dirname,
  "../../../supabase/migrations/202603150001_aerial_ops_core_foundation.sql",
);

function extractJobStatusConstraint(sql: string): string[] {
  const tableStart = sql.indexOf("create table if not exists public.drone_processing_jobs");
  expect(tableStart).toBeGreaterThan(-1);
  const tableBody = sql.slice(tableStart, sql.indexOf(";", tableStart));
  const match = tableBody.match(/status text not null default '\w+' check \(status in \(([^)]+)\)\)/);
  expect(match).not.toBeNull();
  return match![1].split(",").map((entry) => entry.trim().replace(/^'|'$/g, ""));
}

describe("processing job status vocabulary", () => {
  it("matches the drone_processing_jobs check constraint in the core migration", () => {
    const sql = readFileSync(CORE_MIGRATION, "utf8");
    const constraintStatuses = extractJobStatusConstraint(sql);
    expect([...PROCESSING_JOB_STATUSES].sort()).toEqual([...constraintStatuses].sort());
  });

  it("keeps active statuses inside the legal vocabulary", () => {
    for (const status of ACTIVE_PROCESSING_JOB_STATUSES) {
      expect(isProcessingJobStatus(status)).toBe(true);
    }
  });

  it("rejects the statuses the poll cron historically invented", () => {
    expect(isProcessingJobStatus("pending")).toBe(false);
    expect(isProcessingJobStatus("processing")).toBe(false);
    expect(isProcessingJobStatus("awaiting_output_import")).toBe(false);
  });
});
