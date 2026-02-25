# Project Charter — Nat Ford Aerial Intelligence Platform (ODM+)

## Project Identity
- **Slug:** `aerial-intel-platform`
- **Working title:** Nat Ford Aerial Intelligence Platform (ODM+)
- **Project type:** Product R&D + public demo showcase
- **Primary launch surface:** `natfordplanning.com`

## Problem Statement
OpenDroneMap/WebODM are powerful, but many practitioners still struggle with setup complexity, inconsistent quality controls, and weak client-ready storytelling outputs. Nat Ford can build a better user-facing experience by combining open photogrammetry pipelines with planning-specific workflows, QA guardrails, and report-grade outputs that are easy to understand and useful for municipalities.

## Intended Users / Stakeholders
- Internal Nat Ford team (rapid aerial processing)
- Local agencies / planners / field practitioners
- Public viewers consuming educational/demo outputs
- Potential paying pilot customers after validation

## Success Metrics (Phase 1 showcase)
1. Public demo on natfordplanning.com with at least one complete sample pipeline.
2. End-to-end run from image upload to orthomosaic/point cloud visualization with reproducible settings.
3. Processing status transparency (task progress, logs, output quality checks).
4. Clear differentiation from stock ODM/WebODM UX documented in a comparison table.
5. Initial lead capture and pilot-interest CTA from showcase page.

## Time Horizon
- **M0 Foundations:** architecture, legal/licensing boundaries, prototype skeleton
- **M1 MVP:** upload -> process -> visualize -> export
- **M2 Pilot:** selected real datasets, performance hardening, operational runbooks

## Revenue / Business Model
- Public showcase available free
- Paid tiers/services later (managed processing, client deliverables, custom analysis workflows)

## Risk Level
- **Overall:** Medium-High
- Drivers: compute cost, GPU/worker reliability, large file handling, legal/licensing obligations, data rights/privacy

## MVP Scope
- Dataset ingestion + job queue
- Processing orchestration using ODM-compatible backends
- Output artifact management (orthomosaic/DEM/3D assets)
- Browser visualization and download/export package
- Basic quality checks + run metadata

## Out of Scope (initially)
- Rebuilding every ODM algorithm from scratch
- Enterprise multi-tenant billing in first milestone
- Full desktop parity with all WebODM plugins

## Ethics / Quality / Confidentiality Gate
- **Assumptions disclosed:** public demo uses non-sensitive datasets with explicit rights
- **Fairness impact:** no deceptive claims about accuracy; limitations visible
- **AI disclosure:** if AI-generated insights/summaries are shown, label clearly
- **Citation plan:** cite ODM and upstream stack accurately
- **Confidentiality:** separate public demo data from client-confidential datasets

## Licensing & Legal Boundary (critical)
- ODM is AGPLv3; derivative/network-served modifications require source availability.
- Strategy: either (a) comply fully with AGPL for covered components, or (b) maintain clean architecture boundaries around non-derivative orchestration layers.
- Legal review checkpoint required before public launch claims.

## Initial Technical Direction (draft)
- Frontend: Next.js (existing natford stack)
- Control API: FastAPI/Node service for job orchestration
- Processing: ODM/NodeODM/ClusterODM workers
- Storage: object storage for large artifacts
- Metadata: Postgres/Supabase
- Visualization: MapLibre + point-cloud/mesh viewer integration

## Immediate Next Actions
1. Create architecture ADR for fork-vs-compose strategy.
2. Decide public repo posture (open-source vs private core + compliant modules).
3. Build one reproducible sample dataset pipeline.
4. Draft showcase page narrative + comparison matrix.
