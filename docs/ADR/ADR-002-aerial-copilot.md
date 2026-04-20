# ADR-002 — Aerial Copilot architecture

**Status:** Accepted · 2026-04-18 · Revised 2026-04-19 (Decision 3 reversed)
**Supersedes:** none
**Related:** `docs/ROADMAP.md` Phase 4, 2026-04-18 three-wave plan (`.claude/plans/cheeky-questing-tome.md`), `docs/AI_DISCLOSURE.md`

## Context

Wave 2 of the 2026-04-18 strategic plan introduces a grounded, narrow AI-assist surface into the Aerial Intel Platform — three discrete skills (mission brief generator, processing QA assistant, data cleaning scout) rather than a general chat interface. Before building, the plan flagged five open architectural decisions that the user locked in on 2026-04-18.

## Decisions

### 1. Product name: "Aerial Copilot"

**Decision.** The user-facing name for the feature is **"Aerial Copilot"**.

**Why.** Plain-English, no mystique, industry-recognized framing ("Copilot" signals _works alongside the planner, not autonomously_, which is the whole point). Matches the Nat Ford Planning covenant voice of "plain-English, rigorous, client-ready, practical, and low-fluff." Rejected: "agent team", "OpenClaw inside Aerial", "Mission Assistant" (acceptable backup but less recognized).

### 2. Enablement: default off per org

**Decision.** The copilot is **off by default** for every org. Admins opt in via an `org_settings.copilot_enabled` flag (new column) before any skill is callable. The top-level `AERIAL_COPILOT_ENABLED` env var is a kill-switch that takes precedence.

**Why.** Matches the covenant's responsible-AI-use line. Prevents cloud-cost surprises on a per-org basis — first abuse case in a multi-tenant product is always unexpected spend. Also gives the user (or Nathaniel as operator) an explicit moment to explain the feature + disclosure language to the org admin before it goes live.

### 3. Provider integration: Vercel AI Gateway (revised 2026-04-19)

**Decision (current, 2026-04-19).** Route the AI SDK v6 through **Vercel AI Gateway**. Skill modules pass string model ids (`anthropic/claude-opus-4.7`, `anthropic/claude-haiku-4.5`) to `generateText`; the gateway is the SDK's default global provider, so no provider import is needed. Authentication is OIDC on Vercel (auto-injected `VERCEL_OIDC_TOKEN`) and `AI_GATEWAY_API_KEY` for local dev / non-Vercel deployments.

**Why (revised).** Even with one provider shipped (Anthropic), operating through the gateway is a small cost today that buys real option value: provider swap via env only, unified observability + spend attribution, and an obvious upgrade path to OpenAI/Gemini fallbacks without another refactor. The earlier argument ("one provider → gateway is overkill") underweighted the cost of a future code-change migration; doing it once up front is cheaper than doing it later under pressure.

**Models.** `anthropic/claude-opus-4.7` for narrative tasks (mission brief, QA diagnostic note). `anthropic/claude-haiku-4.5` for classification passes (data-scout EXIF/plausibility scoring — W2-C3, not yet shipped). Model ids are fetched from `curl -s https://ai-gateway.vercel.sh/v1/models` at code-write time, not pulled from memory. Both selected for 2026-Q2 capability; revisit on model-family updates.

**Superseded decision (2026-04-18).** Original Decision 3 picked direct `@ai-sdk/anthropic` over AI Gateway on the grounds that one provider at MVP didn't justify the gateway indirection. Reversed one day later after reviewing how cheap the migration was: the only code change was model-id format (hyphens → dots) + dropping the provider import + swapping the env check from `ANTHROPIC_API_KEY` to `AI_GATEWAY_API_KEY`. 31/31 tests remained green. The historical record is preserved here to make the reversal traceable — if the gateway path fails in staging verification, we know what to revert to.

### 4. Thermal / M4T support: deferred

**Decision.** Thermal (DJI M4T and friends) support is **deferred** until a real customer surfaces and pulls for it. No code paths, no UI, no data-model changes for thermal in Waves 2 or 3.

**Why.** Nat Ford Planning's active pipeline is tribal, rural, and small-agency work. Those engagements run on RGB + (later) LiDAR. Building thermal for hypothetical customers fails the "don't design for hypothetical future requirements" principle.

### 5. TiTiler production topology: separate service from NodeODM

**Decision.** In production, TiTiler runs on **its own service** (fly.io / ECS / Cloud Run), independent from the NodeODM processing cluster, and behind a CDN that caches tiles on `(url-hash, z, x, y)`. In dev, the `opengeo-titiler` container at `localhost:8000` is co-located for loop-tightness.

**Why.** NodeODM is CPU/RAM-heavy during batch processing (scales on compute + memory). TiTiler is latency-sensitive during user sessions (scales on request concurrency + cache hit-rate). Co-locating them means one pillar's load pattern starves the other. Different scaling profiles → different services.

## Consequences

- New Supabase migration will add `org_settings.copilot_enabled boolean default false` and a new `org_ai_quota` table (org_id, month_start, spend_cents, cap_cents).
- Credentials: `AI_GATEWAY_API_KEY` (or Vercel-injected `VERCEL_OIDC_TOKEN`) goes to server-side env only. Never exposed to the browser. Added to `.env.example` as a documented optional.
- New module shape: `web/src/lib/copilot/` with one file per skill + a shared `grounding-validator.ts` (ported-pattern from clawmodeler, not code — regex + set-membership over known `fact_id` values derived from live DB rows).
- Every skill result carries an `ai_disclosure` block (model name, grounding-validator version, fact-id coverage percentage) rendered on the page where the output appears. Matches the covenant's "responsible AI use" + "accountability and auditability" gates.
- No AI write actions in year one. Skills emit text + suggestions; humans click.

## Non-decisions (kept open)

- Per-org default spend cap in cents: TBD before first prod enable. Not load-bearing for the first skill.
- Exact grounding-drop threshold (plan suggests "refuse if >30% dropped"): tune after exercising the first skill against a real fixture.
- Whether to expose `ai_disclosure` to clients on share-page deliverables: defer until a real artifact carries an AI-generated section.
