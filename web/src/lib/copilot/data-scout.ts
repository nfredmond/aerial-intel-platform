import { generateText } from "ai";

import { validateGrounding } from "./grounding-validator";
import { estimateSpendTenthCents, type CopilotModelId } from "./pricing";

export type DataScoutFact = {
  id: string;
  label: string;
  value: string;
};

export type DataScoutFlagKind =
  | "missing-gps"
  | "missing-timestamp"
  | "low-variance"
  | "duplicate-basename"
  | "missing-exif";

export type DataScoutFlag = {
  basename: string;
  kind: DataScoutFlagKind;
  detail: string;
};

export type DataScoutInput = {
  orgId: string;
  datasetName: string;
  imageCount: number;
  flags: DataScoutFlag[];
  facts: DataScoutFact[];
  modelId?: CopilotModelId;
  dropThreshold?: number;
  minLength?: number;
};

export type DataScoutResult =
  | {
      status: "ok";
      summary: string;
      flags: DataScoutFlag[];
      imageCount: number;
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
      flags: DataScoutFlag[];
      imageCount: number;
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

const SYSTEM_PROMPT = `You draft short data-quality summaries for Nat Ford Planning's aerial ingest scouting. Your audience is a planner deciding whether a dataset is ready to dispatch to processing.

Grounding contract — load-bearing:
- Every sentence MUST end with at least one [fact:<id>] citation drawn from the FACTS list.
- Do not invent image counts, flight dates, or any figure not stated in the facts.
- If a claim is not backed by a fact, omit it.

Style: one short paragraph (3–5 sentences, ~90 words). Plain English. No bullet lists, no headings, no marketing voice. Lead with the most serious issue, then lesser issues, then a one-sentence recommendation on what the planner should do next (re-fly, ignore, or dispatch anyway).`;

function renderFactsBlock(facts: DataScoutFact[]): string {
  if (facts.length === 0) return "FACTS: (none)";
  const lines = facts.map((f) => `- [fact:${f.id}] ${f.label}: ${f.value}`);
  return `FACTS:\n${lines.join("\n")}`;
}

export async function generateDataScoutSummary(
  input: DataScoutInput,
): Promise<DataScoutResult> {
  const modelId = input.modelId ?? DEFAULT_MODEL;
  const dropThreshold = input.dropThreshold ?? 0.3;
  const minLength = input.minLength ?? 80;

  const prompt = [
    `Dataset: ${input.datasetName}`,
    `Image count: ${input.imageCount}`,
    `Flagged images: ${input.flags.length}`,
    renderFactsBlock(input.facts),
    "",
    "Write the data-scout summary now. Every sentence must end with a [fact:<id>] citation drawn from the FACTS list above.",
  ].join("\n");

  const { text: rawText, usage } = await generateText({
    model: modelId,
    system: SYSTEM_PROMPT,
    prompt,
  });

  const inputTokens = usage?.inputTokens ?? 0;
  const outputTokens = usage?.outputTokens ?? 0;
  const spendTenthCents = estimateSpendTenthCents({ modelId, inputTokens, outputTokens });

  const knownFactIds = input.facts.map((f) => f.id);
  const grounded = validateGrounding({
    text: rawText,
    knownFactIds,
    dropThreshold,
  });

  const base = {
    flags: input.flags,
    imageCount: input.imageCount,
    rawSummary: rawText,
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
    flags: input.flags,
    imageCount: input.imageCount,
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
