"use server";

import {
  runSupportAssistantForQuestion,
  type SupportAssistantServerResult,
} from "@/lib/copilot/support-assistant-server";

export type SupportAssistantFormState =
  | SupportAssistantServerResult
  | { status: "idle" };

export async function generateSupportAssistantAction(
  _prev: SupportAssistantFormState,
  formData: FormData,
): Promise<SupportAssistantFormState> {
  const question = formData.get("question");
  if (typeof question !== "string" || question.trim().length < 8) {
    return { status: "blocked", reason: "empty-question" };
  }
  return runSupportAssistantForQuestion(question);
}
