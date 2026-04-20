import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const generateTextMock = vi.hoisted(() => vi.fn());

vi.mock("ai", () => ({ generateText: generateTextMock }));

import { generateDataScoutSummary } from "./data-scout";

const knownFacts = [
  { id: "dataset:toledo-20:name", label: "Dataset", value: "Toledo-20 RGB" },
  { id: "scout:toledo-20:image_count", label: "Images inspected", value: "20" },
  { id: "scout:toledo-20:missing_gps", label: "Images missing GPS", value: "3" },
  { id: "scout:toledo-20:low_variance", label: "Images below blur threshold", value: "2" },
  { id: "scout:toledo-20:duplicate_basenames", label: "Duplicate basenames", value: "1" },
];

const flags = [
  { basename: "DJI_0003.JPG", kind: "missing-gps" as const, detail: "No GPS coordinates recorded." },
  { basename: "DJI_0017.JPG", kind: "low-variance" as const, detail: "Laplacian variance 42.0 is below the 80 blur threshold." },
];

const groundedSummary = [
  "The Toledo-20 RGB dataset has 20 images inspected by the deterministic scan. [fact:dataset:toledo-20:name]",
  "Three images are missing GPS coordinates, which will block accurate georeferencing downstream. [fact:scout:toledo-20:missing_gps]",
  "Two images fell below the Laplacian blur threshold and should be re-flown if possible. [fact:scout:toledo-20:low_variance]",
  "One duplicate basename was detected, which risks a silent overwrite during ingest. [fact:scout:toledo-20:duplicate_basenames]",
  "Recommend the planner pull the flagged images for review before dispatching to processing. [fact:scout:toledo-20:image_count]",
].join(" ");

describe("generateDataScoutSummary", () => {
  beforeEach(() => {
    generateTextMock.mockReset();
  });

  afterEach(() => {
    generateTextMock.mockReset();
  });

  it("returns status=ok with Haiku model id and cites only known facts", async () => {
    generateTextMock.mockResolvedValueOnce({
      text: groundedSummary,
      usage: { inputTokens: 800, outputTokens: 180 },
    });

    const result = await generateDataScoutSummary({
      orgId: "org-1",
      datasetName: "Toledo-20 RGB",
      imageCount: 20,
      flags,
      facts: knownFacts,
    });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.modelId).toBe("anthropic/claude-haiku-4.5");
    expect(result.totalSentences).toBe(5);
    expect(result.keptSentences).toBe(5);
    expect(result.droppedSentences).toBe(0);
    expect(result.summary.includes("[fact:")).toBe(false);
    expect(result.citedFactIds).toContain("scout:toledo-20:missing_gps");
    expect(result.flags).toEqual(flags);
    expect(result.imageCount).toBe(20);
  });

  it("refuses when more than 30% of sentences cite unknown facts", async () => {
    const hallucinated = [
      "The Toledo-20 RGB dataset has 20 images inspected by the deterministic scan. [fact:dataset:toledo-20:name]",
      "Thermal imagery revealed a hotspot on the north boundary. [fact:thermal:not-collected]",
      "The pilot declared a second overflight the following morning. [fact:flight:second-sortie]",
    ].join(" ");

    generateTextMock.mockResolvedValueOnce({
      text: hallucinated,
      usage: { inputTokens: 400, outputTokens: 80 },
    });

    const result = await generateDataScoutSummary({
      orgId: "org-1",
      datasetName: "Toledo-20 RGB",
      imageCount: 20,
      flags,
      facts: knownFacts,
    });

    expect(result.status).toBe("refused");
    if (result.status !== "refused") return;
    expect(result.reason).toBe("too-many-dropped");
    expect(result.droppedSentences).toBe(2);
  });

  it("refuses with empty-output when the model returns only ungrounded prose", async () => {
    generateTextMock.mockResolvedValueOnce({
      text: "This dataset looks fine overall but check the blurry ones.",
      usage: { inputTokens: 200, outputTokens: 20 },
    });

    const result = await generateDataScoutSummary({
      orgId: "org-1",
      datasetName: "Toledo-20 RGB",
      imageCount: 20,
      flags,
      facts: knownFacts,
    });

    expect(result.status).toBe("refused");
    if (result.status !== "refused") return;
    expect(result.reason).toBe("empty-output");
  });

  it("refuses with too-short when the grounded output is below minLength", async () => {
    generateTextMock.mockResolvedValueOnce({
      text: "Twenty images scanned. [fact:scout:toledo-20:image_count]",
      usage: { inputTokens: 120, outputTokens: 20 },
    });

    const result = await generateDataScoutSummary({
      orgId: "org-1",
      datasetName: "Toledo-20 RGB",
      imageCount: 20,
      flags,
      facts: knownFacts,
    });

    expect(result.status).toBe("refused");
    if (result.status !== "refused") return;
    expect(result.reason).toBe("too-short");
  });

  it("prices Haiku usage at 1/5 tenth-cents per MTok input/output", async () => {
    generateTextMock.mockResolvedValueOnce({
      text: groundedSummary,
      usage: { inputTokens: 1000, outputTokens: 500 },
    });

    const result = await generateDataScoutSummary({
      orgId: "org-1",
      datasetName: "Toledo-20 RGB",
      imageCount: 20,
      flags,
      facts: knownFacts,
    });

    // Haiku: 1000 * 1000 / 1e6 = 1, 500 * 5000 / 1e6 = 2.5 → 3. Total 4.
    expect(result.spendTenthCents).toBe(4);
    expect(result.inputTokens).toBe(1000);
    expect(result.outputTokens).toBe(500);
  });
});
