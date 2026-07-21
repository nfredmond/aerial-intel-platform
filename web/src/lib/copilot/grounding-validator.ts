/**
 * Grounding validator — citation-gated sentence filter for copilot output.
 *
 * Every copilot narrative that leaves the server must cite real DB records.
 * The contract: the model produces prose punctuated by `.`, `!`, `?`, each
 * sentence decorated with one or more `[fact:<id>]` tokens (inline or
 * trailing). Before rendering we drop any sentence whose cited ids don't
 * resolve to the known fact set the skill built for this call. If too
 * many sentences get dropped the whole output is refused.
 *
 * This isolates the "is this hallucinated?" check from the "is this fluent?"
 * concern — the validator doesn't care about prose quality, only provenance.
 */

export type FactId = string;

export type GroundingValidationInput = {
  /** The raw text the model produced. */
  text: string;
  /** Set of fact ids this skill fed the model — the only citations it may use. */
  knownFactIds: Iterable<FactId>;
  /** Allowed max fraction of sentences that may be dropped. Default 0.30. */
  dropThreshold?: number;
  /**
   * Fact id → the claim text fed to the model for that fact. When supplied,
   * the numeric faithfulness belt runs: a sentence whose consequential
   * figures (currency, percentages, years, large numbers) appear in none of
   * its cited facts is dropped even though its citations resolve.
   */
  factClaimTexts?: ReadonlyMap<FactId, string>;
};

export type GroundingValidationResult = {
  /** Post-filter text with ungrounded sentences removed. */
  text: string;
  /** Total sentences detected in the input. */
  totalSentences: number;
  /** Sentences that survived the filter. */
  keptSentences: number;
  /** Sentences dropped for missing/unknown citations. */
  droppedSentences: number;
  /** Fraction dropped (0..1). */
  dropFraction: number;
  /** Fact ids that were cited in kept sentences. */
  citedFactIds: FactId[];
  /** True when the drop fraction exceeds `dropThreshold`; caller should refuse render. */
  exceededThreshold: boolean;
  /** Per-sentence breakdown, in source order. */
  sentences: Array<{
    text: string;
    factIds: FactId[];
    kept: boolean;
    reason?: "missing-citation" | "unknown-citation" | "unfaithful-citation";
    /** Numeric claims the sentence asserts that none of its cited facts contain. */
    unfaithfulClaims?: string[];
  }>;
};

const SINGLE_CITATION_PATTERN = /\[fact:([a-zA-Z0-9_\-:.]+)\]/g;

/*
 * Numeric faithfulness belt — ported from openplan's
 * src/lib/planner-pack/grounding.ts (itself ported from clawmodeler,
 * Apache-2.0, same author). Citation presence alone cannot catch a sentence
 * that cites a real fact while asserting a fabricated figure; these helpers
 * cross-check the consequential numbers a sentence asserts against the claim
 * texts of the facts it cites.
 */

/** Matches a numeric token: optional `$`, digits with optional grouping/decimals, optional `%`. */
const NUMERIC_TOKEN_PATTERN = /\$?\d[\d,]*(?:\.\d+)?%?/g;

/** Digits-and-decimal core of a numeric token (`$4,200.50%` -> `4200.50`). */
function numericCore(token: string): string {
  return token.replace(/[$,%\s]/g, "");
}

/**
 * A numeric token is "consequential" — worth cross-checking against the cited
 * fact — when it is money, a percentage, a 4-digit year, or a large / decimal /
 * comma-grouped figure. Bare small integers ("2 batteries", "3 passes") are
 * ignored so the belt stays low-false-positive.
 */
function isConsequentialNumber(token: string): boolean {
  if (token.includes("$") || token.includes("%")) return true;
  if (token.includes(".") || token.includes(",")) return true;
  const core = numericCore(token);
  if (/^\d{4}$/.test(core)) {
    const year = Number(core);
    if (year >= 1900 && year <= 2099) return true;
  }
  return core.replace(".", "").length >= 4;
}

/**
 * Extract the normalized numeric cores of the consequential figures a sentence
 * asserts. Citation tokens are stripped first so a numeric fact id can't be
 * mistaken for a claim.
 */
export function extractHardClaims(text: string): string[] {
  const cores: string[] = [];
  for (const match of text.replace(SINGLE_CITATION_PATTERN, "").matchAll(NUMERIC_TOKEN_PATTERN)) {
    if (isConsequentialNumber(match[0])) cores.push(numericCore(match[0]));
  }
  return cores;
}

/** All numeric cores present anywhere in the given fact claim texts. */
function factNumericCores(texts: Iterable<string>): Set<string> {
  const cores = new Set<string>();
  for (const text of texts) {
    for (const match of text.matchAll(NUMERIC_TOKEN_PATTERN)) {
      cores.add(numericCore(match[0]));
    }
  }
  return cores;
}

/**
 * Sentence boundary: a terminator (`.`, `!`, `?`) optionally followed by
 * trailing citation tokens, then either a capital letter (next sentence) or
 * end of string. The inner `.` of decimals and ISO dates ("4.2", "2026-04-15")
 * doesn't match because it's followed by a digit/hyphen, not a capital.
 */
const SENTENCE_BOUNDARY =
  /([.!?])((?:\s*\[fact:[a-zA-Z0-9_\-:.]+\])*)(?=\s+[A-Z]|\s*$)/g;

type ParsedSentence = {
  text: string;
  factIds: FactId[];
};

function extractFactIds(segment: string): FactId[] {
  const ids: FactId[] = [];
  for (const m of segment.matchAll(SINGLE_CITATION_PATTERN)) {
    ids.push(m[1]);
  }
  return ids;
}

function parseSentences(text: string): ParsedSentence[] {
  const sentences: ParsedSentence[] = [];
  const trimmed = text.trim();
  if (trimmed.length === 0) return sentences;

  let cursor = 0;
  for (const match of trimmed.matchAll(SENTENCE_BOUNDARY)) {
    const end = (match.index ?? 0) + match[0].length;
    const raw = trimmed.slice(cursor, end);
    const sentenceText = raw.trim();
    const factIds = extractFactIds(raw);
    if (sentenceText.length > 0 || factIds.length > 0) {
      sentences.push({ text: sentenceText, factIds });
    }
    cursor = end;
  }
  const tail = trimmed.slice(cursor).trim();
  if (tail.length > 0) {
    sentences.push({
      text: tail,
      factIds: extractFactIds(tail),
    });
  }
  return sentences;
}

export function validateGrounding(
  input: GroundingValidationInput,
): GroundingValidationResult {
  const threshold = input.dropThreshold ?? 0.3;
  const knownSet = new Set(input.knownFactIds);
  const parsed = parseSentences(input.text);

  const citedUnion = new Set<FactId>();
  const sentences: GroundingValidationResult["sentences"] = [];

  for (const { text, factIds } of parsed) {
    if (factIds.length === 0) {
      sentences.push({ text, factIds: [], kept: false, reason: "missing-citation" });
      continue;
    }
    const allKnown = factIds.every((id) => knownSet.has(id));
    if (!allKnown) {
      sentences.push({ text, factIds, kept: false, reason: "unknown-citation" });
      continue;
    }
    if (input.factClaimTexts) {
      const cores = factNumericCores(
        factIds.map((id) => input.factClaimTexts?.get(id) ?? ""),
      );
      const unfaithful = extractHardClaims(text).filter((claim) => !cores.has(claim));
      if (unfaithful.length > 0) {
        sentences.push({
          text,
          factIds,
          kept: false,
          reason: "unfaithful-citation",
          unfaithfulClaims: unfaithful,
        });
        continue;
      }
    }
    factIds.forEach((id) => citedUnion.add(id));
    sentences.push({ text, factIds, kept: true });
  }

  const total = sentences.length;
  const kept = sentences.filter((s) => s.kept).length;
  const dropped = total - kept;
  const dropFraction = total === 0 ? 0 : dropped / total;

  const filteredText = sentences
    .filter((s) => s.kept)
    .map((s) => s.text)
    .join(" ")
    .trim();

  return {
    text: filteredText,
    totalSentences: total,
    keptSentences: kept,
    droppedSentences: dropped,
    dropFraction,
    citedFactIds: Array.from(citedUnion),
    exceededThreshold: dropFraction > threshold,
    sentences,
  };
}
