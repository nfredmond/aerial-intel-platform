import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const generateTextMock = vi.hoisted(() => vi.fn());

vi.mock("ai", () => ({ generateText: generateTextMock }));

import { generateMissionBrief, MISSION_BRIEF_MAX_OUTPUT_TOKENS } from "./mission-brief";

const longBrief = [
  "The Toledo-20 mission mapped an 18.4 hectare parcel for the city's stormwater update. [fact:mission:toledo-20]",
  "Flights ran on 2026-04-15 with 312 images captured at 120 m AGL. [fact:dataset:toledo-20-rgb]",
  "Processing used the NodeODM default-high preset and produced an orthomosaic, DSM, and point cloud. [fact:job:toledo-20-job]",
  "QA gate passed with the minimum checks green. [fact:qa:toledo-20-verdict]",
  "Client reviewer Priya Nanduri flagged one caveat on flight-line coverage along the northern boundary. [fact:review:toledo-20-first-note]",
].join(" ");

const knownFacts = [
  { id: "mission:toledo-20", label: "Mission", value: "Toledo-20 stormwater parcel" },
  { id: "dataset:toledo-20-rgb", label: "Dataset", value: "312 RGB images, 2026-04-15, 120 m AGL" },
  { id: "job:toledo-20-job", label: "Job", value: "NodeODM default-high" },
  { id: "qa:toledo-20-verdict", label: "QA", value: "minimum_pass=true" },
  { id: "review:toledo-20-first-note", label: "Review", value: "coverage caveat on north" },
];

describe("generateMissionBrief", () => {
  beforeEach(() => {
    generateTextMock.mockReset();
  });

  afterEach(() => {
    generateTextMock.mockReset();
  });

  it("returns status=ok when every sentence cites a known fact and length passes", async () => {
    generateTextMock.mockResolvedValueOnce({
      text: longBrief,
      usage: { inputTokens: 600, outputTokens: 220 },
    });

    const result = await generateMissionBrief({
      orgId: "org-1",
      missionName: "Toledo-20 stormwater",
      facts: knownFacts,
    });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.totalSentences).toBe(5);
    expect(result.keptSentences).toBe(5);
    expect(result.droppedSentences).toBe(0);
    expect(result.citedFactIds.sort()).toEqual(
      ["dataset:toledo-20-rgb", "job:toledo-20-job", "mission:toledo-20", "qa:toledo-20-verdict", "review:toledo-20-first-note"].sort(),
    );
    expect(result.text.includes("[fact:")).toBe(true);
    expect(result.modelId).toBe("anthropic/claude-opus-4.7");
    expect(generateTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        maxOutputTokens: MISSION_BRIEF_MAX_OUTPUT_TOKENS,
        timeout: { totalMs: 45_000 },
      }),
    );
  });

  it("refuses when the model hallucinates an unknown citation on >30% of sentences", async () => {
    const hallucinated = [
      "The Toledo-20 mission mapped an 18.4 hectare parcel for the city's stormwater update. [fact:mission:toledo-20]",
      "Flights ran on 2026-04-15 with 312 images captured at 120 m AGL. [fact:dataset:toledo-20-rgb]",
      "The pilot was briefed by Acme Consulting's senior analyst on approach. [fact:pilot:hallucinated-brief]",
      "Thermal imagery revealed three hotspots near the outfall. [fact:thermal:not-captured]",
    ].join(" ");

    generateTextMock.mockResolvedValueOnce({
      text: hallucinated,
      usage: { inputTokens: 500, outputTokens: 180 },
    });

    const result = await generateMissionBrief({
      orgId: "org-1",
      missionName: "Toledo-20 stormwater",
      facts: knownFacts,
    });

    expect(result.status).toBe("refused");
    if (result.status !== "refused") return;
    expect(result.reason).toBe("too-many-dropped");
    expect(result.droppedSentences).toBe(2);
  });

  it("refuses with too-short when the surviving brief is below minLength", async () => {
    generateTextMock.mockResolvedValueOnce({
      text: "The Toledo-20 parcel is 18.4 ha. [fact:mission:toledo-20]",
      usage: { inputTokens: 100, outputTokens: 30 },
    });

    const result = await generateMissionBrief({
      orgId: "org-1",
      missionName: "Toledo-20 stormwater",
      facts: knownFacts,
    });

    expect(result.status).toBe("refused");
    if (result.status !== "refused") return;
    expect(result.reason).toBe("too-short");
  });

  it("refuses with empty-output when the model returns only ungrounded prose", async () => {
    generateTextMock.mockResolvedValueOnce({
      text: "Interesting mission with many details.",
      usage: { inputTokens: 200, outputTokens: 10 },
    });

    const result = await generateMissionBrief({
      orgId: "org-1",
      missionName: "Toledo-20 stormwater",
      facts: knownFacts,
    });

    expect(result.status).toBe("refused");
    if (result.status !== "refused") return;
    expect(result.reason).toBe("empty-output");
  });

  it("estimates spend in tenth-cents from the model usage", async () => {
    generateTextMock.mockResolvedValueOnce({
      text: longBrief,
      usage: { inputTokens: 1000, outputTokens: 500 },
    });

    const result = await generateMissionBrief({
      orgId: "org-1",
      missionName: "Toledo-20 stormwater",
      facts: knownFacts,
    });

    // Opus: 1000 input * 15000 / 1e6 = 15, 500 output * 75000 / 1e6 = 37.5 → 38, total 53.
    expect(result.spendTenthCents).toBe(53);
    expect(result.inputTokens).toBe(1000);
    expect(result.outputTokens).toBe(500);
  });
});
