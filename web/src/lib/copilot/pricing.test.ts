import { describe, expect, it } from "vitest";

import {
  estimateInputTokenUpperBound,
  estimateSpendTenthCents,
  estimateSpendUpperBoundTenthCents,
  formatTenthCentsUsd,
  MODEL_PRICING,
} from "./pricing";

describe("estimateSpendTenthCents", () => {
  it("scales opus pricing by token count", () => {
    // 1 000 input + 500 output tokens at Opus 4.7 pricing:
    //   input:  1 000 * 15 000 / 1 000 000 = 15 tenth-cents
    //   output: 500 * 75 000 / 1 000 000 = 37.5 → ceiled to 38 tenth-cents
    //   total = 53 tenth-cents (= $0.053)
    const cost = estimateSpendTenthCents({
      modelId: "anthropic/claude-opus-4.7",
      inputTokens: 1_000,
      outputTokens: 500,
    });
    expect(cost).toBe(53);
  });

  it("haiku is ~15x cheaper than opus for the same shape", () => {
    const opus = estimateSpendTenthCents({
      modelId: "anthropic/claude-opus-4.7",
      inputTokens: 10_000,
      outputTokens: 2_000,
    });
    const haiku = estimateSpendTenthCents({
      modelId: "anthropic/claude-haiku-4.5",
      inputTokens: 10_000,
      outputTokens: 2_000,
    });
    expect(haiku).toBeLessThan(opus);
    // Opus at 10k/2k = 150 + 150 = 300; Haiku = 10 + 10 = 20 → ~15x
    expect(opus / haiku).toBeGreaterThan(10);
    expect(opus / haiku).toBeLessThan(20);
  });

  it("zero-token call returns zero", () => {
    expect(
      estimateSpendTenthCents({
        modelId: "anthropic/claude-haiku-4.5",
        inputTokens: 0,
        outputTokens: 0,
      }),
    ).toBe(0);
  });

  it("throws on unknown model id", () => {
    expect(() =>
      estimateSpendTenthCents({
        modelId: "claude-pretend-9000" as never,
        inputTokens: 1,
        outputTokens: 1,
      }),
    ).toThrow(/Unknown copilot model id/);
  });

  it("rounds partial tenth-cents UP so spend never silently underbills", () => {
    // 1 input token at Haiku:  1 * 1 000 / 1 000 000 = 0.001 → ceiled to 1
    // 1 output token at Haiku: 1 * 5 000 / 1 000 000 = 0.005 → ceiled to 1
    // total = 2 tenth-cents
    const cost = estimateSpendTenthCents({
      modelId: "anthropic/claude-haiku-4.5",
      inputTokens: 1,
      outputTokens: 1,
    });
    expect(cost).toBe(2);
  });
});

describe("estimateInputTokenUpperBound", () => {
  it("uses UTF-8 bytes plus overhead so the estimate is conservative", () => {
    expect(estimateInputTokenUpperBound(["abc", "Δ"], 10)).toBe(16);
  });
});

describe("estimateSpendUpperBoundTenthCents", () => {
  it("prices the conservative prompt bytes plus bounded output tokens", () => {
    const cost = estimateSpendUpperBoundTenthCents({
      modelId: "anthropic/claude-haiku-4.5",
      textParts: ["abc"],
      maxOutputTokens: 200,
      overheadTokens: 0,
    });

    expect(cost).toBe(
      estimateSpendTenthCents({
        modelId: "anthropic/claude-haiku-4.5",
        inputTokens: 3,
        outputTokens: 200,
      }),
    );
  });
});

describe("formatTenthCentsUsd", () => {
  it("formats as USD with three decimals", () => {
    expect(formatTenthCentsUsd(53)).toBe("$0.053");
    expect(formatTenthCentsUsd(50_000)).toBe("$50.000");
    expect(formatTenthCentsUsd(0)).toBe("$0.000");
  });
});

describe("MODEL_PRICING", () => {
  it("opus output is strictly more expensive than input", () => {
    const opus = MODEL_PRICING["anthropic/claude-opus-4.7"];
    expect(opus.outputPerMillionTenthCents).toBeGreaterThan(opus.inputPerMillionTenthCents);
  });
});
