export type CopilotModelId = "claude-opus-4-7" | "claude-haiku-4-5-20251001";

export type ModelPricing = {
  /** Cost per million input tokens, in tenths of a cent. */
  inputPerMillionTenthCents: number;
  /** Cost per million output tokens, in tenths of a cent. */
  outputPerMillionTenthCents: number;
};

/**
 * Per-model token pricing in tenth-of-cent units. Integer math avoids the
 * float drift that shows up when you accumulate hundreds of tiny per-call
 * deltas against a capped budget.
 *
 * Numbers here mirror the Anthropic public pricing as of 2026-04-18. Keep
 * this table in sync when Anthropic updates the model card.
 */
export const MODEL_PRICING: Record<CopilotModelId, ModelPricing> = {
  // Opus 4.7: $15/MTok input, $75/MTok output → 15 000 / 75 000 tenth-cents
  "claude-opus-4-7": {
    inputPerMillionTenthCents: 15_000,
    outputPerMillionTenthCents: 75_000,
  },
  // Haiku 4.5: $1/MTok input, $5/MTok output → 1 000 / 5 000 tenth-cents
  "claude-haiku-4-5-20251001": {
    inputPerMillionTenthCents: 1_000,
    outputPerMillionTenthCents: 5_000,
  },
};

export type TokenUsageInput = {
  modelId: CopilotModelId;
  inputTokens: number;
  outputTokens: number;
};

/**
 * Deterministic cost estimator. Rounds each dimension independently to the
 * nearest tenth-of-cent so the written spend never silently underbills.
 */
export function estimateSpendTenthCents(input: TokenUsageInput): number {
  const pricing = MODEL_PRICING[input.modelId];
  if (!pricing) {
    throw new Error(`Unknown copilot model id: ${input.modelId}`);
  }
  const inputCost =
    (input.inputTokens * pricing.inputPerMillionTenthCents) / 1_000_000;
  const outputCost =
    (input.outputTokens * pricing.outputPerMillionTenthCents) / 1_000_000;
  return Math.ceil(inputCost) + Math.ceil(outputCost);
}

export function formatTenthCentsUsd(tenthCents: number): string {
  const dollars = tenthCents / 1000;
  return `$${dollars.toFixed(3)}`;
}
