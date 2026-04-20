import { generateText } from "ai";

import { getCopilotConfig } from "./config";
import { validateGrounding } from "./grounding-validator";
import {
  estimateSpendTenthCents,
  estimateSpendUpperBoundTenthCents,
  type CopilotModelId,
} from "./pricing";

export type SupportDocFact = {
  id: string;
  label: string;
  value: string;
  sourcePath: string;
  keywords: string[];
};

export type SupportAnswerInput = {
  orgId: string;
  question: string;
  facts: SupportDocFact[];
  modelId?: CopilotModelId;
  dropThreshold?: number;
  minLength?: number;
};

export type SupportAnswerResult =
  | {
      status: "ok";
      answer: string;
      citedFactIds: string[];
      sources: SupportDocFact[];
      totalSentences: number;
      keptSentences: number;
      droppedSentences: number;
      spendTenthCents: number;
      modelId: CopilotModelId;
      inputTokens: number;
      outputTokens: number;
    }
  | {
      status: "refused";
      reason: "too-many-dropped" | "too-short" | "empty-output";
      rawAnswer: string;
      citedFactIds: string[];
      sources: SupportDocFact[];
      totalSentences: number;
      keptSentences: number;
      droppedSentences: number;
      spendTenthCents: number;
      modelId: CopilotModelId;
      inputTokens: number;
      outputTokens: number;
    };

const DEFAULT_MODEL: CopilotModelId = "anthropic/claude-haiku-4.5";
export const SUPPORT_ASSISTANT_MAX_OUTPUT_TOKENS = 500;

const STOPWORDS = new Set([
  "about",
  "after",
  "again",
  "against",
  "also",
  "and",
  "are",
  "can",
  "for",
  "from",
  "has",
  "how",
  "into",
  "our",
  "should",
  "the",
  "this",
  "what",
  "when",
  "where",
  "which",
  "with",
]);

export const SUPPORT_DOC_FACTS: readonly SupportDocFact[] = [
  {
    id: "support:truthful-posture",
    label: "Truthful posture",
    value:
      "Managed-processing stages must not be marked complete without attached evidence such as uploaded ODM output, callback receipt, or computed dataset coverage.",
    sourcePath: "AGENTS.md",
    keywords: ["truthful", "evidence", "managed", "processing", "stage", "complete"],
  },
  {
    id: "support:planes",
    label: "Plane separation",
    value:
      "The product separates app, data, compute, raster delivery, and field companion planes; mutations stay in the app/data boundary while raster delivery is a separate TiTiler plane.",
    sourcePath: "docs/ARCHITECTURE.md",
    keywords: ["architecture", "planes", "app", "data", "compute", "raster", "field"],
  },
  {
    id: "support:writes-through-admin",
    label: "Service-role writes",
    value:
      "All mutation writes go through web/src/lib/supabase/admin.ts; one-off service-role clients are outside the project boundary.",
    sourcePath: "AGENTS.md",
    keywords: ["service", "role", "write", "admin", "mutation", "supabase"],
  },
  {
    id: "support:rls-active",
    label: "Active membership RLS",
    value:
      "Member-read RLS policies require the current user's membership status to be active before tenant rows are readable through the anon client.",
    sourcePath: "supabase/migrations/20260420000003_require_active_membership_read_policies.sql",
    keywords: ["rls", "active", "membership", "suspended", "read", "anon"],
  },
  {
    id: "support:titiler-env",
    label: "TiTiler environment",
    value:
      "The app reads AERIAL_TITILER_URL for COG raster previews and suppresses the viewer when the variable is unset.",
    sourcePath: "docs/ops/titiler-setup.md",
    keywords: ["titiler", "cog", "raster", "viewer", "environment", "aerial_titiler_url"],
  },
  {
    id: "support:titiler-tilejson",
    label: "TiTiler bounds",
    value:
      "MapLibre bounds must come from TiTiler /cog/WebMercatorQuad/tilejson.json because /cog/info can return source-CRS bounds for projected COGs.",
    sourcePath: "docs/ops/titiler-setup.md",
    keywords: ["titiler", "tilejson", "bounds", "maplibre", "source", "crs"],
  },
  {
    id: "support:nodeodm-manual",
    label: "NodeODM verification",
    value:
      "End-to-end NodeODM verification is manual against a local opendronemap/nodeodm container; unit tests mock fetch and must not be described as a real NodeODM round trip.",
    sourcePath: "AGENTS.md",
    keywords: ["nodeodm", "manual", "container", "unit", "mock", "round", "trip"],
  },
  {
    id: "support:dispatch-contracts",
    label: "Dispatch contracts",
    value:
      "aerial-dispatch-adapter.v1 and aerial-dispatch-adapter-callback.v1 are stable contracts; new fields require a new contract version rather than mutating v1.",
    sourcePath: "AGENTS.md",
    keywords: ["dispatch", "adapter", "callback", "contract", "version", "v1"],
  },
  {
    id: "support:share-links",
    label: "Signed share links",
    value:
      "Artifact share-link page views do not count against use_count; only downloads increment use_count and issue a short-lived signed URL.",
    sourcePath: "AGENTS.md",
    keywords: ["share", "link", "download", "signed", "use_count", "artifact"],
  },
  {
    id: "support:admin-console",
    label: "Admin console",
    value:
      "The admin/support console is gated by admin.support for owners and admins and exposes org support context, memberships, entitlements, recent jobs, and recent events.",
    sourcePath: "AGENTS.md",
    keywords: ["admin", "support", "console", "membership", "entitlement", "owner"],
  },
  {
    id: "support:copilot-grounding",
    label: "Copilot grounding",
    value:
      "Aerial Copilot skills are default-off per org, quota-gated, and must render only citation-gated output where every sentence cites supplied facts.",
    sourcePath: "docs/ROADMAP.md",
    keywords: ["copilot", "grounding", "citation", "quota", "org", "ai"],
  },
  {
    id: "support:e2e-posture",
    label: "E2E posture",
    value:
      "Public-showcase Playwright smoke is safe by default; authenticated operational smoke is opt-in and requires explicit Supabase fixture environment variables.",
    sourcePath: "web/tests/e2e/README.md",
    keywords: ["playwright", "e2e", "authenticated", "smoke", "supabase", "fixture"],
  },
  {
    id: "support:raster-next",
    label: "Raster next step",
    value:
      "The current raster delivery blocker is a controlled Nat Ford TiTiler service; titiler.xyz is temporary Preview evidence, not a production raster plane.",
    sourcePath: "docs/ops/2026-04-20-review-hardening-preview-smoke.md",
    keywords: ["next", "raster", "titiler", "production", "preview", "controlled"],
  },
  {
    id: "support:enterprise-deferred",
    label: "Enterprise scope",
    value:
      "Phase 5 enterprise work such as private compute pools, SSO/SCIM, white-labeling, and private plugins is not started and should wait for real demand.",
    sourcePath: "docs/ROADMAP.md",
    keywords: ["enterprise", "sso", "scim", "private", "compute", "phase"],
  },
] as const;

const SYSTEM_PROMPT = `You answer internal operator-support questions for Nat Ford Planning's Aerial Operations OS.

Grounding contract:
- Every sentence MUST end with one or more [fact:<id>] citations.
- Only cite ids from the FACTS list.
- If the facts do not answer the question, say what is known and what must be checked manually.
- Do not invent routes, commands, infrastructure, dates, or product status.

Style: 2-5 concise sentences. Plain operational language. No marketing voice.`;

function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9_]+/g) ?? [])
    .map((token) => (token.endsWith("s") && token.length > 4 ? token.slice(0, -1) : token))
    .filter((token) => token.length > 1 && !STOPWORDS.has(token));
}

export function selectSupportFacts(question: string, maxFacts = 6): SupportDocFact[] {
  const queryTokens = new Set(tokenize(question));
  if (queryTokens.size === 0) return [];

  return SUPPORT_DOC_FACTS.map((fact) => {
    const factTokens = new Set(
      tokenize(`${fact.id} ${fact.label} ${fact.value} ${fact.sourcePath} ${fact.keywords.join(" ")}`),
    );
    let score = 0;
    for (const token of queryTokens) {
      if (factTokens.has(token)) score += 2;
      if (fact.keywords.some((keyword) => keyword.includes(token))) score += 1;
    }
    return { fact, score };
  })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.fact.id.localeCompare(b.fact.id))
    .slice(0, maxFacts)
    .map((item) => item.fact);
}

function renderFactsBlock(facts: readonly SupportDocFact[]): string {
  if (facts.length === 0) return "FACTS: (none)";
  return `FACTS:\n${facts
    .map((fact) => `- [fact:${fact.id}] ${fact.label} (${fact.sourcePath}): ${fact.value}`)
    .join("\n")}`;
}

export function buildSupportAssistantPrompt(input: {
  question: string;
  facts: readonly SupportDocFact[];
}): string {
  return [
    `Question: ${input.question}`,
    renderFactsBlock(input.facts),
    "",
    "Answer the question using only those facts. Every sentence must end with a [fact:<id>] citation.",
  ].join("\n");
}

export function estimateSupportAssistantBudgetTenthCents(input: {
  question: string;
  facts: readonly SupportDocFact[];
  modelId?: CopilotModelId;
}): number {
  const modelId = input.modelId ?? DEFAULT_MODEL;
  return estimateSpendUpperBoundTenthCents({
    modelId,
    textParts: [SYSTEM_PROMPT, buildSupportAssistantPrompt(input)],
    maxOutputTokens: SUPPORT_ASSISTANT_MAX_OUTPUT_TOKENS,
  });
}

export async function generateSupportAnswer(
  input: SupportAnswerInput,
): Promise<SupportAnswerResult> {
  const modelId = input.modelId ?? DEFAULT_MODEL;
  const dropThreshold = input.dropThreshold ?? 0.3;
  const minLength = input.minLength ?? 80;
  const prompt = buildSupportAssistantPrompt(input);
  const generationTimeoutMs = getCopilotConfig().generationTimeoutMs;

  const { text: rawAnswer, usage } = await generateText({
    model: modelId,
    system: SYSTEM_PROMPT,
    prompt,
    maxOutputTokens: SUPPORT_ASSISTANT_MAX_OUTPUT_TOKENS,
    timeout: { totalMs: generationTimeoutMs },
  });

  const inputTokens = usage?.inputTokens ?? 0;
  const outputTokens = usage?.outputTokens ?? 0;
  const spendTenthCents = estimateSpendTenthCents({ modelId, inputTokens, outputTokens });
  const knownFactIds = input.facts.map((fact) => fact.id);
  const grounded = validateGrounding({ text: rawAnswer, knownFactIds, dropThreshold });
  const citedSet = new Set(grounded.citedFactIds);
  const citedSources = input.facts.filter((fact) => citedSet.has(fact.id));

  const base = {
    rawAnswer,
    citedFactIds: grounded.citedFactIds,
    sources: citedSources,
    totalSentences: grounded.totalSentences,
    keptSentences: grounded.keptSentences,
    droppedSentences: grounded.droppedSentences,
    spendTenthCents,
    modelId,
    inputTokens,
    outputTokens,
  };

  if (grounded.totalSentences === 0 || grounded.text.length === 0) {
    return { status: "refused", reason: "empty-output", ...base };
  }
  if (grounded.exceededThreshold) {
    return { status: "refused", reason: "too-many-dropped", ...base };
  }
  if (grounded.text.length < minLength) {
    return { status: "refused", reason: "too-short", ...base };
  }

  return {
    status: "ok",
    answer: grounded.text,
    citedFactIds: grounded.citedFactIds,
    sources: citedSources,
    totalSentences: grounded.totalSentences,
    keptSentences: grounded.keptSentences,
    droppedSentences: grounded.droppedSentences,
    spendTenthCents,
    modelId,
    inputTokens,
    outputTokens,
  };
}
