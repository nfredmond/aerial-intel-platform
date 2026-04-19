import { describe, expect, it } from "vitest";

import { validateGrounding } from "./grounding-validator";

describe("validateGrounding", () => {
  it("keeps sentences whose citations are all in the known set", () => {
    const result = validateGrounding({
      text: "The mission covers 4.2 km². [fact:mission:abc] Capture date was 2026-04-15. [fact:dataset:xyz]",
      knownFactIds: ["mission:abc", "dataset:xyz"],
    });
    expect(result.keptSentences).toBe(2);
    expect(result.droppedSentences).toBe(0);
    expect(result.dropFraction).toBe(0);
    expect(result.exceededThreshold).toBe(false);
    expect(result.text).toBe("The mission covers 4.2 km². Capture date was 2026-04-15.");
    expect(result.citedFactIds.sort()).toEqual(["dataset:xyz", "mission:abc"]);
  });

  it("drops sentences with no citation", () => {
    const result = validateGrounding({
      text: "The site is beautiful. [fact:mission:abc] The weather was nice.",
      knownFactIds: ["mission:abc"],
    });
    expect(result.keptSentences).toBe(1);
    expect(result.droppedSentences).toBe(1);
    expect(result.sentences[1].reason).toBe("missing-citation");
  });

  it("drops sentences citing an unknown fact id", () => {
    const result = validateGrounding({
      text: "Ortho ready at 4cm GSD. [fact:output:ortho-123] Mission tagged by external auditor. [fact:external:nope]",
      knownFactIds: ["output:ortho-123"],
    });
    expect(result.keptSentences).toBe(1);
    expect(result.droppedSentences).toBe(1);
    expect(result.sentences[1].reason).toBe("unknown-citation");
    expect(result.text).toBe("Ortho ready at 4cm GSD.");
  });

  it("requires every cited id in a sentence to be known (conjunction)", () => {
    const result = validateGrounding({
      text: "Linked to mission [fact:mission:abc] and dataset [fact:dataset:fake] capture.",
      knownFactIds: ["mission:abc"],
    });
    expect(result.keptSentences).toBe(0);
    expect(result.droppedSentences).toBe(1);
    expect(result.sentences[0].factIds).toEqual(["mission:abc", "dataset:fake"]);
  });

  it("flags exceededThreshold when more than 30 percent of sentences drop", () => {
    const result = validateGrounding({
      text: [
        "Grounded a. [fact:a:1]",
        "Grounded b. [fact:a:2]",
        "Ungrounded c.",
        "Ungrounded d.",
      ].join(" "),
      knownFactIds: ["a:1", "a:2"],
    });
    expect(result.totalSentences).toBe(4);
    expect(result.dropFraction).toBeCloseTo(0.5);
    expect(result.exceededThreshold).toBe(true);
  });

  it("honors a custom dropThreshold", () => {
    const result = validateGrounding({
      text: "Grounded. [fact:a:1] Ungrounded extra fluff.",
      knownFactIds: ["a:1"],
      dropThreshold: 0.6,
    });
    expect(result.dropFraction).toBeCloseTo(0.5);
    expect(result.exceededThreshold).toBe(false);
  });

  it("handles empty input without dividing by zero", () => {
    const result = validateGrounding({ text: "", knownFactIds: [] });
    expect(result.totalSentences).toBe(0);
    expect(result.dropFraction).toBe(0);
    expect(result.exceededThreshold).toBe(false);
    expect(result.text).toBe("");
  });

  it("strips citation tokens from the rendered sentence text", () => {
    const result = validateGrounding({
      text: "Captured at 400 ft AGL. [fact:mission:m1]",
      knownFactIds: ["mission:m1"],
    });
    expect(result.text).toBe("Captured at 400 ft AGL.");
    expect(result.text.includes("[fact:")).toBe(false);
  });

  it("splits sentences on . ! ? followed by capitalized start", () => {
    const result = validateGrounding({
      text: "First. [fact:a:1] Second! [fact:a:2] Third? [fact:a:3]",
      knownFactIds: ["a:1", "a:2", "a:3"],
    });
    expect(result.totalSentences).toBe(3);
    expect(result.keptSentences).toBe(3);
  });
});
