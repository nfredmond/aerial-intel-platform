# Roadmap

**Status as of 2026-04-16 (modernization pass):**

- Phase 0 foundations — **complete**.
- Phase 1 mission-control shell — **complete**, now decomposed around shared UI primitives.
- Phase 2 ingest / preflight / processing — **largely complete**; NodeODM-direct dispatch added this pass alongside the existing webhook adapter.
- Phase 3 viewing / delivery / collaboration — **near-complete (delivery pillar honest)**: MapLibre-backed planning + coverage maps shipped; install-bundle export shipped; mission-version snapshot + promote shipped; side-by-side version diff shipped; signed-share artifact links shipped (`/s/[token]`); read-only admin console shipped (`/admin`); Playwright public-showcase smoke shipped; authenticated ops smoke is now opt-in; copy-to-storage for real NodeODM outputs shipped (W1-A); artifact comments + approvals shipped (W1-C); TiTiler-backed raster viewer shipped and Preview-smoked via a temporary public TiTiler endpoint. A controlled Nat Ford TiTiler service is still pending before production claim.
- Phase 4 AI / domain modules — **in progress (Wave 2 copilot landing)**: Aerial Copilot framework + mission-brief (W2-C1) + processing-QA (W2-C2) + data-cleaning scout (W2-C3) + admin support assistant + artifact report-summary generator shipped, default-off per org, grounded via citation-gated output; org-scoped copilot audit events now record attempts, refusals, failures, spend, and sentence-drop counts in the admin dashboard with CSV export for review packets. Processing-QA has live Preview verification through Vercel AI Gateway and uses a bounded Haiku call for the internal diagnostic path.
- Phase 5 enterprise / ecosystem — **not started**.

## Phase 0 — Foundations and architecture spikes
- Auth + entitlement schema scaffold completed
- ODM benchmark harness completed
- Legal/ADR posture established: compose around ODM ecosystem, do not fake a rewrite
- Mission-control shell, map-first planning UX, NodeODM direct dispatch, install-bundle export all landed in the 2026-04-16 modernization pass

## Phase 1 — Mission editor and operations shell MVP
Goal: ship a planner-first workspace that already feels stronger than a static map + settings panel.

### In scope
- mission-control app shell (top bar, left rail, center map/planning lanes, right inspector, bottom console)
- project/site/mission/dataset/job/output domain schema foundation
- mission versioning model
- terrain-following preview + validation architecture notes
- install helper planning and compatibility surfaces
- multi-format export roadmap (DJI KMZ/WPML, CSV/GeoJSON/PDF brief)

### Deferred
- full collaborative realtime presence
- enterprise auth/SSO
- advanced billing/governance

## Phase 2 — Ingest, preflight, and processing
Goal: turn the shell into a real operational pipeline.

### In scope
- resumable uploads
- EXIF extraction and capture map reconstruction
- preflight warnings / ingest findings
- NodeODM/ClusterODM-backed job orchestration
- job events, logs, retries, and status surfaces
- output artifact records and storage conventions
- benchmark-backed sample projects and seeded demo data

## Phase 3 — Viewing, delivery, and collaboration
Goal: provide WebODM-grade output review with stronger delivery UX.

### In scope
- TiTiler-backed COG raster delivery (shipped — W1-B — wired behind `AERIAL_TITILER_URL`; Preview-smoked via `https://titiler.xyz`; controlled Nat Ford TiTiler service pending)
- orthomosaic/DSM viewing (shipped — `/artifacts/[artifactId]` renders a MapLibre raster overlay for ready COGs)
- share pages and export bundles (share pages shipped at `/s/[token]`; export bundles shipped via install-bundle route)
- comments, approvals, and activity feed depth (activity feed shipped; comments/approvals shipped — W1-C)
- client-safe packaging and report surfaces (install-bundle shipped)
- read-only admin / support console (shipped at `/admin`)
- mission-version snapshot + promote UI (shipped at `/missions/[missionId]/versions`; side-by-side diff shipped — W1-D)
- copy-to-storage for real NodeODM outputs (shipped — W1-A — `drone-ops/${orgSlug}/jobs/${jobId}/outputs/${kind}/`)
- Playwright E2E scaffold (shipped with public-showcase smoke; opt-in auth-gated ops smoke covers RLS suspension, comments, copilot citations, and raster tiles)

## Phase 4 — AI and domain modules
Goal: add high-leverage assistance, not gimmicks. Narrow grounded skills, citation-gated output, no autonomous write actions (see `docs/ADR/ADR-002-aerial-copilot-architecture.md` and `docs/AI_DISCLOSURE.md`).

### In scope
- mission-brief generator (shipped — W2-C1 — on `/missions/[missionId]`)
- preflight / processing QA assistant (shipped — W2-C2 — on `/jobs/[jobId]` when the job is actually diagnosable)
- data-cleaning scout for dataset extraction (shipped — W2-C3 — deterministic EXIF/blur classification with LLM used only for human-readable explanation)
- docs search / support assistant (shipped as an admin Copilot panel backed by a curated ops-doc fact corpus)
- report summary generation (shipped as an artifact-level Copilot panel backed by storage, benchmark, review, and handoff facts)
- copilot audit events (shipped as `drone_org_events` rows surfaced on `/admin/copilot`, with spend, grounding, model, failure context, and owner/admin CSV export)
- change-intelligence and agronomy modules later

## Phase 5 — Enterprise and ecosystem expansion
Goal: scale deployment and governance only after the core loop works.

### In scope
- private compute pools
- private cloud/on-prem topologies
- governance/audit expansion
- SSO/SCIM when real demand exists
- white-labeling and private plugins
