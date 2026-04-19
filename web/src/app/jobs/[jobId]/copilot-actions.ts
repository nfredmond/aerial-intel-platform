"use server";

import {
  runProcessingQaForJob,
  type ProcessingQaServerResult,
} from "@/lib/copilot/processing-qa-server";

export type ProcessingQaFormState = ProcessingQaServerResult | { status: "idle" };

export async function generateProcessingQaAction(
  _prev: ProcessingQaFormState,
  formData: FormData,
): Promise<ProcessingQaFormState> {
  const jobId = formData.get("jobId");
  if (typeof jobId !== "string" || !jobId) {
    return { status: "error", message: "Missing jobId" };
  }
  return runProcessingQaForJob(jobId);
}
