import { describe, expect, it } from "vitest";

import { extractHardClaims, validateGrounding } from "./grounding-validator";

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
    expect(result.text).toBe(
      "The mission covers 4.2 km². [fact:mission:abc] Capture date was 2026-04-15. [fact:dataset:xyz]",
    );
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
    expect(result.text).toBe("Ortho ready at 4cm GSD. [fact:output:ortho-123]");
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

  it("keeps citation tokens in the rendered sentence text for audit", () => {
    const result = validateGrounding({
      text: "Captured at 400 ft AGL. [fact:mission:m1]",
      knownFactIds: ["mission:m1"],
    });
    expect(result.text).toBe("Captured at 400 ft AGL. [fact:mission:m1]");
    expect(result.text.includes("[fact:")).toBe(true);
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

describe("extractHardClaims", () => {
  it("extracts money, percentages, years, and large numbers", () => {
    expect(extractHardClaims("Costs $4,200.50 with 85% overlap since 2024 across 12000 images")).toEqual([
      "4200.50",
      "85",
      "2024",
      "12000",
    ]);
  });

  it("ignores bare small integers and citation tokens", () => {
    expect(extractHardClaims("Flew 2 batteries over 3 passes. [fact:a:12345]")).toEqual([]);
  });
});

describe("numeric faithfulness belt", () => {
  const facts = new Map([
    ["m:area", "Coverage area: 42.5 acres"],
    ["m:alt", "Altitude: 400 ft AGL"],
  ]);

  it("keeps sentences whose numbers appear in their cited facts", () => {
    const result = validateGrounding({
      text: "The mission covered 42.5 acres. [fact:m:area]",
      knownFactIds: facts.keys(),
      factClaimTexts: facts,
    });
    expect(result.keptSentences).toBe(1);
    expect(result.droppedSentences).toBe(0);
  });

  it("drops a sentence asserting a figure absent from its cited facts", () => {
    const result = validateGrounding({
      text: "The mission covered 97.3 acres. [fact:m:area]",
      knownFactIds: facts.keys(),
      factClaimTexts: facts,
    });
    expect(result.keptSentences).toBe(0);
    expect(result.sentences[0].reason).toBe("unfaithful-citation");
    expect(result.sentences[0].unfaithfulClaims).toEqual(["97.3"]);
  });

  it("only checks numbers against the facts the sentence itself cites", () => {
    // 42.5 exists in m:area, but this sentence cites only m:alt.
    const result = validateGrounding({
      text: "The site spans 42.5 acres. [fact:m:alt]",
      knownFactIds: facts.keys(),
      factClaimTexts: facts,
    });
    expect(result.keptSentences).toBe(0);
    expect(result.sentences[0].reason).toBe("unfaithful-citation");
  });

  it("does not run the belt when factClaimTexts is omitted (back-compat)", () => {
    const result = validateGrounding({
      text: "The mission covered 97.3 acres. [fact:m:area]",
      knownFactIds: facts.keys(),
    });
    expect(result.keptSentences).toBe(1);
  });

  it("small integers do not trip the belt", () => {
    const result = validateGrounding({
      text: "The crew flew 2 batteries at 400 ft. [fact:m:alt]",
      knownFactIds: facts.keys(),
      factClaimTexts: facts,
    });
    expect(result.keptSentences).toBe(1);
  });
});
