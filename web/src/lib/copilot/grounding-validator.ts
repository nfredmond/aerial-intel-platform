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
    reason?: "missing-citation" | "unknown-citation";
  }>;
};

const CITATION_RUN_PATTERN = /\s*\[fact:[a-zA-Z0-9_\-:.]+\]/g;
const SINGLE_CITATION_PATTERN = /\[fact:([a-zA-Z0-9_\-:.]+)\]/g;

/**
 * Sentence boundary: a terminator (`.`, `!`, `?`) optionally followed by
 * trailing citation tokens, then either a capital letter (next sentence) or
 * end of string. The inner `.` of decimals and ISO dates ("4.2", "2026-04-15")
 * doesn't match because it's followed by a digit/hyphen, not a capital.
 */
const SENTENCE_BOUNDARY =
  /([.!?])((?:\s*\[fact:[a-zA-Z0-9_\-:.]+\])*)(?=\s+[A-Z]|\s*$)/g;

type ParsedSentence = {
  prose: string;
  factIds: FactId[];
};

function extractFactIds(segment: string): FactId[] {
  const ids: FactId[] = [];
  for (const m of segment.matchAll(SINGLE_CITATION_PATTERN)) {
    ids.push(m[1]);
  }
  return ids;
}

function stripCitations(segment: string): string {
  return segment.replace(CITATION_RUN_PATTERN, "").trim();
}

function parseSentences(text: string): ParsedSentence[] {
  const sentences: ParsedSentence[] = [];
  const trimmed = text.trim();
  if (trimmed.length === 0) return sentences;

  let cursor = 0;
  for (const match of trimmed.matchAll(SENTENCE_BOUNDARY)) {
    const end = (match.index ?? 0) + match[0].length;
    const raw = trimmed.slice(cursor, end);
    const factIds = extractFactIds(raw);
    const prose = stripCitations(raw);
    if (prose.length > 0 || factIds.length > 0) {
      sentences.push({ prose, factIds });
    }
    cursor = end;
  }
  const tail = trimmed.slice(cursor).trim();
  if (tail.length > 0) {
    sentences.push({
      prose: stripCitations(tail),
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

  for (const { prose, factIds } of parsed) {
    if (factIds.length === 0) {
      sentences.push({ text: prose, factIds: [], kept: false, reason: "missing-citation" });
      continue;
    }
    const allKnown = factIds.every((id) => knownSet.has(id));
    if (!allKnown) {
      sentences.push({ text: prose, factIds, kept: false, reason: "unknown-citation" });
      continue;
    }
    factIds.forEach((id) => citedUnion.add(id));
    sentences.push({ text: prose, factIds, kept: true });
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
