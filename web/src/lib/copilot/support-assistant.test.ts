import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const generateTextMock = vi.hoisted(() => vi.fn());

vi.mock("ai", () => ({ generateText: generateTextMock }));

import {
  generateSupportAnswer,
  selectSupportFacts,
  SUPPORT_ASSISTANT_MAX_OUTPUT_TOKENS,
} from "./support-assistant";

describe("selectSupportFacts", () => {
  it("retrieves TiTiler and raster facts for raster production questions", () => {
    const facts = selectSupportFacts("What still blocks the production raster claim for TiTiler?");

    expect(facts.map((fact) => fact.id)).toContain("support:raster-next");
    expect(facts.map((fact) => fact.id)).toContain("support:titiler-env");
  });

  it("returns no facts for empty questions", () => {
    expect(selectSupportFacts("the and for")).toEqual([]);
  });
});

describe("generateSupportAnswer", () => {
  const facts = selectSupportFacts("What still blocks the production raster claim for TiTiler?");

  beforeEach(() => {
    generateTextMock.mockReset();
  });

  afterEach(() => {
    generateTextMock.mockReset();
  });

  it("returns status=ok with cited support sources", async () => {
    generateTextMock.mockResolvedValueOnce({
      text: [
        "The production raster claim is still blocked by the lack of a controlled Nat Ford TiTiler service. [fact:support:raster-next]",
        "The app already has an AERIAL_TITILER_URL gate, but titiler.xyz is only temporary Preview evidence. [fact:support:titiler-env] [fact:support:raster-next]",
      ].join(" "),
      usage: { inputTokens: 900, outputTokens: 120 },
    });

    const result = await generateSupportAnswer({
      orgId: "org-1",
      question: "What still blocks the production raster claim for TiTiler?",
      facts,
    });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.answer).toContain("[fact:support:raster-next]");
    expect(result.sources.map((source) => source.id)).toContain("support:raster-next");
    expect(result.modelId).toBe("anthropic/claude-haiku-4.5");
    expect(generateTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        maxOutputTokens: SUPPORT_ASSISTANT_MAX_OUTPUT_TOKENS,
        timeout: { totalMs: 45_000 },
      }),
    );
  });

  it("refuses answers with unknown citations", async () => {
    generateTextMock.mockResolvedValueOnce({
      text: [
        "Production is blocked by a made-up CDN vendor. [fact:support:fake-cdn]",
        "The raster path also needs a controlled TiTiler service. [fact:support:raster-next]",
      ].join(" "),
      usage: { inputTokens: 500, outputTokens: 80 },
    });

    const result = await generateSupportAnswer({
      orgId: "org-1",
      question: "What still blocks the production raster claim for TiTiler?",
      facts,
    });

    expect(result.status).toBe("refused");
    if (result.status !== "refused") return;
    expect(result.reason).toBe("too-many-dropped");
  });
});
