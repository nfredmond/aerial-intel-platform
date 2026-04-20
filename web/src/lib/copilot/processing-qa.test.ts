import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const generateTextMock = vi.hoisted(() => vi.fn());

vi.mock("ai", () => ({ generateText: generateTextMock }));

import { generateProcessingQaNote, PROCESSING_QA_MAX_OUTPUT_TOKENS } from "./processing-qa";

const knownFacts = [
  { id: "job:j1:engine", label: "Engine", value: "nodeodm" },
  { id: "job:j1:status", label: "Status", value: "failed" },
  { id: "benchmark:j1:exit_code", label: "ODM exit code", value: "1" },
  { id: "benchmark:j1:image_count", label: "Image count", value: "42" },
  { id: "benchmark:j1:missing_outputs", label: "Missing outputs", value: "orthophoto,point_cloud" },
  { id: "stage:j1:align", label: "Stage align", value: "failed" },
];

const groundedNote = [
  "The job failed with a low image count of 42 which is below the typical overlap threshold. [fact:benchmark:j1:image_count]",
  "Retry the flight with 70% frontal overlap and 60% side overlap to double the match density. [fact:stage:j1:align]",
  "The ODM exit code is 1 and the align stage did not complete. [fact:benchmark:j1:exit_code]",
  "If a retry still fails, rule out motion blur from low-light capture. [fact:job:j1:status]",
].join(" ");

describe("generateProcessingQaNote", () => {
  beforeEach(() => generateTextMock.mockReset());
  afterEach(() => generateTextMock.mockReset());

  it("returns status=ok when every sentence cites a known fact", async () => {
    generateTextMock.mockResolvedValueOnce({
      text: groundedNote,
      usage: { inputTokens: 400, outputTokens: 120 },
    });

    const result = await generateProcessingQaNote({
      orgId: "org-1",
      jobId: "j1",
      facts: knownFacts,
    });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.totalSentences).toBe(4);
    expect(result.keptSentences).toBe(4);
    expect(result.text.includes("[fact:")).toBe(true);
    expect(generateTextMock).toHaveBeenCalledWith(
      expect.objectContaining({ maxOutputTokens: PROCESSING_QA_MAX_OUTPUT_TOKENS }),
    );
  });

  it("refuses when the model hallucinates unknown fact ids on >30% of sentences", async () => {
    const hallucinated = [
      "The job failed because the GPS drift exceeded 5 metres. [fact:gps:drift-not-real]",
      "Retry with a smaller AOI. [fact:aoi:fake]",
      "The align stage did not complete. [fact:stage:j1:align]",
    ].join(" ");

    generateTextMock.mockResolvedValueOnce({
      text: hallucinated,
      usage: { inputTokens: 300, outputTokens: 90 },
    });

    const result = await generateProcessingQaNote({
      orgId: "org-1",
      jobId: "j1",
      facts: knownFacts,
    });

    expect(result.status).toBe("refused");
    if (result.status !== "refused") return;
    expect(result.reason).toBe("too-many-dropped");
  });

  it("refuses too-short when grounded output is under minLength", async () => {
    generateTextMock.mockResolvedValueOnce({
      text: "Too sparse. [fact:job:j1:status]",
      usage: { inputTokens: 100, outputTokens: 20 },
    });

    const result = await generateProcessingQaNote({
      orgId: "org-1",
      jobId: "j1",
      facts: knownFacts,
    });

    expect(result.status).toBe("refused");
    if (result.status !== "refused") return;
    expect(result.reason).toBe("too-short");
  });

  it("estimates spend from usage in tenth-cents", async () => {
    generateTextMock.mockResolvedValueOnce({
      text: groundedNote,
      usage: { inputTokens: 1000, outputTokens: 500 },
    });

    const result = await generateProcessingQaNote({
      orgId: "org-1",
      jobId: "j1",
      facts: knownFacts,
    });

    // Opus: 15 + 38 = 53 tenth-cents
    expect(result.spendTenthCents).toBe(53);
  });
});
