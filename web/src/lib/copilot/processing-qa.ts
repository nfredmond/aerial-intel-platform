import { generateText } from "ai";

import { getCopilotConfig } from "./config";
import { validateGrounding } from "./grounding-validator";
import {
  estimateSpendTenthCents,
  estimateSpendUpperBoundTenthCents,
  type CopilotModelId,
} from "./pricing";

export type ProcessingQaFact = {
  id: string;
  label: string;
  value: string;
};

export type ProcessingQaInput = {
  orgId: string;
  jobId: string;
  facts: ProcessingQaFact[];
  modelId?: CopilotModelId;
  dropThreshold?: number;
  minLength?: number;
};

export type ProcessingQaResult =
  | {
      status: "ok";
      text: string;
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
      rawText: string;
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
export const PROCESSING_QA_MAX_OUTPUT_TOKENS = 450;

const SYSTEM_PROMPT = `You are a processing-QA troubleshooting assistant for Nat Ford Planning's aerial operations platform. When a NodeODM job fails, struggles, or produces a thin output set, you help a planner figure out what likely went wrong and what to try next.

Grounding contract — load-bearing:
- Every sentence MUST end with one or more [fact:<id>] citations.
- Only cite ids that appear in the FACTS list you are given.
- If a diagnostic claim cannot be supported by a fact, omit it.
- Never invent log lines, stage names, or error codes that are not in the facts.

Structure — aim for 4-6 short sentences, no more, in this order:
1. One sentence naming the most likely root cause of the failure or thin output.
2. One sentence with a concrete next action the planner can take (specific preset change, capture recommendation, GCP placement, etc.).
3. One-to-three sentences of supporting observations drawn from the facts (what stages ran, which outputs are missing, what the exit code was, etc.).
4. Optionally one sentence flagging a less-likely alternative cause the planner should rule out if the primary fix doesn't help.

Common ODM failure patterns to consider when interpreting the facts:
- Insufficient overlap between images causes sparse feature matches → retry with higher overlap capture.
- Missing GCPs on large AOIs causes drift in the reconstructed model → add 3-5 GCPs around the perimeter.
- Feature-extraction weakness on uniform terrain (water, snow, open asphalt) produces holes → retry with feature-quality=high and higher matcher-neighbors.
- Low light / motion blur breaks SfM → retry with better capture conditions, not with settings.
- Exit code 0 but missing outputs usually means a post-processing stage skipped due to memory pressure.

Tone: operator-to-operator. Plain. No hedging words. No marketing voice.`;

function renderFactsBlock(facts: ProcessingQaFact[]): string {
  if (facts.length === 0) return "FACTS: (none)";
  return `FACTS:\n${facts.map((f) => `- [fact:${f.id}] ${f.label}: ${f.value}`).join("\n")}`;
}

export function buildProcessingQaPrompt(input: {
  jobId: string;
  facts: ProcessingQaFact[];
}): string {
  return [
    `Job: ${input.jobId}`,
    renderFactsBlock(input.facts),
    "",
    "Diagnose the likely failure cause and propose a concrete next action. Every sentence must end with a [fact:<id>] drawn from the FACTS list above.",
  ].join("\n");
}

export function estimateProcessingQaBudgetTenthCents(input: {
  jobId: string;
  facts: ProcessingQaFact[];
  modelId?: CopilotModelId;
}): number {
  const modelId = input.modelId ?? DEFAULT_MODEL;
  return estimateSpendUpperBoundTenthCents({
    modelId,
    textParts: [SYSTEM_PROMPT, buildProcessingQaPrompt(input)],
    maxOutputTokens: PROCESSING_QA_MAX_OUTPUT_TOKENS,
  });
}

export async function generateProcessingQaNote(
  input: ProcessingQaInput,
): Promise<ProcessingQaResult> {
  const modelId = input.modelId ?? DEFAULT_MODEL;
  const dropThreshold = input.dropThreshold ?? 0.3;
  const minLength = input.minLength ?? 120;

  const prompt = buildProcessingQaPrompt(input);
  const generationTimeoutMs = getCopilotConfig().generationTimeoutMs;

  const { text: rawText, usage } = await generateText({
    model: modelId,
    system: SYSTEM_PROMPT,
    prompt,
    maxOutputTokens: PROCESSING_QA_MAX_OUTPUT_TOKENS,
    timeout: { totalMs: generationTimeoutMs },
  });

  const inputTokens = usage?.inputTokens ?? 0;
  const outputTokens = usage?.outputTokens ?? 0;
  const spendTenthCents = estimateSpendTenthCents({ modelId, inputTokens, outputTokens });

  const knownFactIds = input.facts.map((f) => f.id);
  const grounded = validateGrounding({ text: rawText, knownFactIds, dropThreshold });

  const base = {
    rawText,
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
    text: grounded.text,
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
