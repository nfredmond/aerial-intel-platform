# ODM+ Comparison Matrix

This matrix compares current open-source ODM options with the proposed Nat Ford ODM+ product direction. It is written for client-facing planning and avoids unreleased claims.

| Capability | ODM CLI | WebODM | NodeODM | Nat Ford ODM+ Differentiator | MVP Phase |
| --- | --- | --- | --- | --- | --- |
| Primary interface | Command line on local/remote host | Browser UI for job/project management | HTTP API wrapper around processing node | Opinionated workflow that combines reproducible automation with decision-ready deliverables | Phase 1 |
| User onboarding | Technical setup; docs-driven | Easier for non-CLI users; still self-host heavy | API-first; developer-centric | Fast-start templates and guided benchmark path for internal/demo use | Phase 1 |
| Processing orchestration | Manual commands/scripts | Queueing via WebODM server | Programmatic submission to node | Repeatable run protocol with consistent metadata capture and artifacts | Phase 1 |
| Benchmark reproducibility | Possible but custom to each team | Limited by operator consistency | Possible with disciplined API tooling | Standard benchmark script + protocol docs to compare runs across datasets and hardware | Phase 1 |
| Output packaging for stakeholders | Raw ODM outputs | Visual project/job views | API access to output files/status | Curated, client-safe output bundles (maps, summaries, QA notes, run metadata) | Phase 2 |
| Quality assurance workflow | Manual review | Manual review in UI | Must be built in consuming app | Defined QA checklist and acceptance thresholds tied to benchmark outputs | Phase 1 |
| Commercial readiness posture | Open-source tooling only | Open-source tooling only | Open-source tooling only | Service-oriented delivery model, scoped SLAs/process controls, and client communication templates | Phase 2 |
| Domain-specific reporting | Not included by default | Not included by default | Not included by default | Verticalized report formats for planning/inspection use cases with clear assumptions/disclaimers | Phase 3 |
| Deployment flexibility | High, infra-managed by operator | Moderate to high, infra-managed by operator | High for developers | Reference deployment patterns that reduce variance between test, demo, and production | Phase 2 |
| Governance and traceability | Depends on local practices | Basic job history | Depends on consuming system | Standardized run logs, summary manifests, and versioned protocol documentation | Phase 1 |

## MVP Phase Definitions

- Phase 1: Foundation artifacts for reproducible benchmarks, comparison narrative, and initial demo credibility.
- Phase 2: Packaging and operational hardening for client pilots.
- Phase 3: Domain-tailored analytics/reporting extensions.

## Shipped now (Wave 1 + Wave 2, as of 2026-04-19)

The matrix above describes the ODM+ direction. This section lists what is actually merged and running in the Aerial Intel Platform today, so client-facing copy on natfordplanning.com can claim these without caveat. The Toledo-20 orthomosaic was end-to-end verified through TiTiler /cog/info, /cog/tilejson, and /cog/preview on 2026-04-19; browser-side MapLibre rendering of the same artifact is authored but awaits a signed-in hands-on check.

| Capability | Status | How it lands |
| --- | --- | --- |
| Browser raster viewer for ODM orthomosaics | Shipped | `RasterViewer` (MapLibre + PMTiles) on `/artifacts/[id]` backed by TiTiler COG tiling. Verified against the 7.8 MB Toledo-20 orthomosaic (5107×5905 RGB, EPSG:32617, overviews 2/4/8/16). |
| Client-portal comments + per-artifact approvals | Shipped | `drone_artifact_comments` + `drone_artifact_approvals`, wired into the artifact page as server actions with RLS-scoped reads. |
| Time-boxed, usage-capped share links | Shipped | `drone_share_links` with `expires_in_hours` + `max_uses`; public consumer route `/s/[token]`. |
| Handoff workflow (reviewed → shared → exported) | Shipped | `getArtifactHandoff` + `updateArtifactHandoffMetadata`; stage pills on the artifact page; export packet builder. |
| Benchmark evidence in artifact metadata | Shipped | Each published artifact carries `benchmark.sourcePath`, `sha256`, `derivative` command, NodeODM task UUID, and `storagePublication` timestamp. |
| AI-assisted mission brief (Aerial Copilot W2-C1) | Shipped | Grounded brief generator over mission + site context, routed through Vercel AI Gateway (Opus 4.7), per-org enable toggle + tenth-cent spend cap. |
| AI-assisted processing-failure diagnostic (W2-C2) | Shipped | QA assistant that explains why a NodeODM run failed, grounded on job events; same quota + disclosure posture as W2-C1. |
| AI-assisted dataset quality scout (W2-C3) | Shipped | Pre-dispatch per-image EXIF/GPS/blur classifier with a Haiku-generated human-readable summary, advisory only. |
| Operator spend + refusal dashboard | Shipped | `/admin/copilot` per-org month-to-date spend, refusal rate, drop ratio, read-only. |
| Org admin invitations + seat suspend/reactivate | Shipped | `/admin/people` with token-based invitation URLs, ADR-003 boundary (only owners may mint admins). |

Items still explicitly deferred: live-feedback pass against the Aerial Copilot skills (blocked on the operator running the W2-C1/C2 verification loops), multi-org copilot rollout (waiting on the spend dashboard being exercised against a second org), and any volume/NDVI work (Wave 3, deliberately not started until at least one copilot skill has fired against a live org).
