import { generateText } from "ai";

import { getCopilotConfig } from "./config";
import { validateGrounding } from "./grounding-validator";
import {
  estimateSpendTenthCents,
  estimateSpendUpperBoundTenthCents,
  type CopilotModelId,
} from "./pricing";

/**
 * A single fact the skill is allowed to cite. `id` appears in the model's
 * `[fact:<id>]` citations; `label` is a short key the model sees; `value` is
 * the resolved data (stringified on input). Keep ids stable across calls so
 * cached prompts stay warm.
 */
export type MissionBriefFact = {
  id: string;
  label: string;
  value: string;
};

export type MissionBriefInput = {
  /** Org scope — surfaced to the audit event; not sent to the model. */
  orgId: string;
  /** Mission display name, surfaced verbatim in the prompt header. */
  missionName: string;
  /** Ordered fact list — only these ids may be cited in the output. */
  facts: MissionBriefFact[];
  /** Override the default narrative model. */
  modelId?: CopilotModelId;
  /** Max sentence drop fraction before the brief is refused. Default 0.30. */
  dropThreshold?: number;
  /** Minimum brief length in characters; below this the brief is refused. */
  minLength?: number;
};

export type MissionBriefResult =
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

const DEFAULT_MODEL: CopilotModelId = "anthropic/claude-opus-4.7";
export const MISSION_BRIEF_MAX_OUTPUT_TOKENS = 700;

const SYSTEM_PROMPT = `You draft client-ready mission briefs for Nat Ford Planning's aerial operations platform. Write in plain, low-fluff English suited to a planning agency audience.

Grounding contract — this is load-bearing:
- Every sentence MUST end with one or more [fact:<id>] citations.
- Only cite ids that appear in the FACTS list you are given.
- If a claim cannot be supported by a provided fact, omit the claim entirely. Do not guess dates, area figures, model names, file sizes, or processing settings.
- Do not invent a QA verdict. If the facts list does not include one, say "QA verdict not available for this brief."
- Do not say "according to the facts" or narrate the citation process; cite inline and move on.

Structure — aim for a tight ~250-word brief with these short paragraphs, in this order:
1. Mission objective and scope (what was flown and why).
2. Capture summary (date, area, image count, altitude if provided).
3. Processing settings and deliverables (engine, preset, outputs generated).
4. QA verdict and any caveats a reviewer should see.

Tone: factual and practical. No superlatives. No marketing voice. No bullet lists — prose paragraphs.`;

function renderFactsBlock(facts: MissionBriefFact[]): string {
  if (facts.length === 0) return "FACTS: (none)";
  const lines = facts.map((f) => `- [fact:${f.id}] ${f.label}: ${f.value}`);
  return `FACTS:\n${lines.join("\n")}`;
}

export function buildMissionBriefPrompt(input: {
  missionName: string;
  facts: MissionBriefFact[];
}): string {
  return [
    `Mission: ${input.missionName}`,
    renderFactsBlock(input.facts),
    "",
    "Write the mission brief now. Remember: every sentence must end with a [fact:<id>] citation drawn from the FACTS list above.",
  ].join("\n");
}

export function estimateMissionBriefBudgetTenthCents(input: {
  missionName: string;
  facts: MissionBriefFact[];
  modelId?: CopilotModelId;
}): number {
  const modelId = input.modelId ?? DEFAULT_MODEL;
  return estimateSpendUpperBoundTenthCents({
    modelId,
    textParts: [SYSTEM_PROMPT, buildMissionBriefPrompt(input)],
    maxOutputTokens: MISSION_BRIEF_MAX_OUTPUT_TOKENS,
  });
}

export async function generateMissionBrief(
  input: MissionBriefInput,
): Promise<MissionBriefResult> {
  const modelId = input.modelId ?? DEFAULT_MODEL;
  const dropThreshold = input.dropThreshold ?? 0.3;
  const minLength = input.minLength ?? 200;

  const prompt = buildMissionBriefPrompt(input);
  const generationTimeoutMs = getCopilotConfig().generationTimeoutMs;

  const { text: rawText, usage } = await generateText({
    model: modelId,
    system: SYSTEM_PROMPT,
    prompt,
    maxOutputTokens: MISSION_BRIEF_MAX_OUTPUT_TOKENS,
    timeout: { totalMs: generationTimeoutMs },
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
