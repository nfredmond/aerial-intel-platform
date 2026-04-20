import { generateText } from "ai";

import { getCopilotConfig } from "./config";
import { validateGrounding } from "./grounding-validator";
import {
  estimateSpendTenthCents,
  estimateSpendUpperBoundTenthCents,
  type CopilotModelId,
} from "./pricing";
import type { ReportSummaryFact } from "./report-summary-facts";

export type ReportSummaryInput = {
  orgId: string;
  artifactName: string;
  facts: ReportSummaryFact[];
  modelId?: CopilotModelId;
  dropThreshold?: number;
  minLength?: number;
};

export type ReportSummaryResult =
  | {
      status: "ok";
      summary: string;
      citedFactIds: string[];
      totalSentences: number;
      keptSentences: number;
      droppedSentences: number;
      spendTenthCents: number;
      modelId: CopilotModelId;
      inputTokens: number;
      outputTokens: number;
    }
  | {
      status: "refused";
      reason: "too-many-dropped" | "too-short" | "empty-output";
      rawSummary: string;
      citedFactIds: string[];
      totalSentences: number;
      keptSentences: number;
      droppedSentences: number;
      spendTenthCents: number;
      modelId: CopilotModelId;
      inputTokens: number;
      outputTokens: number;
    };

const DEFAULT_MODEL: CopilotModelId = "anthropic/claude-haiku-4.5";
export const REPORT_SUMMARY_MAX_OUTPUT_TOKENS = 650;

const SYSTEM_PROMPT = `You draft client-safe artifact report summaries for Nat Ford Planning's Aerial Operations OS.

Grounding contract:
- Every sentence MUST end with one or more [fact:<id>] citations.
- Only cite ids from the FACTS list.
- If a status, approval, storage path, QA result, or next action is not in the facts, do not invent it.
- Do not call an artifact exported, approved, or final unless the facts explicitly say so.
- Do not imply automation replaces qualified review.

Structure: 4-6 concise sentences in plain language. Cover what the artifact is, what real evidence exists, current QA/review posture, client-safe caveats, and the next action.`;

function renderFactsBlock(facts: ReportSummaryFact[]): string {
  if (facts.length === 0) return "FACTS: (none)";
  return `FACTS:\n${facts.map((fact) => `- [fact:${fact.id}] ${fact.label}: ${fact.value}`).join("\n")}`;
}

export function buildReportSummaryPrompt(input: {
  artifactName: string;
  facts: ReportSummaryFact[];
}): string {
  return [
    `Artifact: ${input.artifactName}`,
    renderFactsBlock(input.facts),
    "",
    "Draft the report summary now. Every sentence must end with a [fact:<id>] citation drawn from the FACTS list above.",
  ].join("\n");
}

export function estimateReportSummaryBudgetTenthCents(input: {
  artifactName: string;
  facts: ReportSummaryFact[];
  modelId?: CopilotModelId;
}) {
  const modelId = input.modelId ?? DEFAULT_MODEL;
  return estimateSpendUpperBoundTenthCents({
    modelId,
    textParts: [SYSTEM_PROMPT, buildReportSummaryPrompt(input)],
    maxOutputTokens: REPORT_SUMMARY_MAX_OUTPUT_TOKENS,
  });
}

export async function generateReportSummary(
  input: ReportSummaryInput,
): Promise<ReportSummaryResult> {
  const modelId = input.modelId ?? DEFAULT_MODEL;
  const dropThreshold = input.dropThreshold ?? 0.3;
  const minLength = input.minLength ?? 120;
  const prompt = buildReportSummaryPrompt(input);
  const generationTimeoutMs = getCopilotConfig().generationTimeoutMs;

  const { text: rawSummary, usage } = await generateText({
    model: modelId,
    system: SYSTEM_PROMPT,
    prompt,
    maxOutputTokens: REPORT_SUMMARY_MAX_OUTPUT_TOKENS,
    timeout: { totalMs: generationTimeoutMs },
  });

  const inputTokens = usage?.inputTokens ?? 0;
  const outputTokens = usage?.outputTokens ?? 0;
  const spendTenthCents = estimateSpendTenthCents({ modelId, inputTokens, outputTokens });
  const knownFactIds = input.facts.map((fact) => fact.id);
  const grounded = validateGrounding({ text: rawSummary, knownFactIds, dropThreshold });

  const base = {
    rawSummary,
    citedFactIds: grounded.citedFactIds,
    totalSentences: grounded.totalSentences,
    keptSentences: grounded.keptSentences,
    droppedSentences: grounded.droppedSentences,
    spendTenthCents,
    modelId,
    inputTokens,
    outputTokens,
  };

  if (grounded.totalSentences === 0 || grounded.text.length === 0) {
    return { status: "refused", reason: "empty-output", ...base };
  }
  if (grounded.exceededThreshold) {
    return { status: "refused", reason: "too-many-dropped", ...base };
  }
  if (grounded.text.length < minLength) {
    return { status: "refused", reason: "too-short", ...base };
  }

  return {
    status: "ok",
    summary: grounded.text,
    citedFactIds: grounded.citedFactIds,
    totalSentences: grounded.totalSentences,
    keptSentences: grounded.keptSentences,
    droppedSentences: grounded.droppedSentences,
    spendTenthCents,
    modelId,
    inputTokens,
    outputTokens,
  };
}
