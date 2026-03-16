# Roadmap

## Phase 0 — Foundations and architecture spikes
- Auth + entitlement schema scaffold completed
- ODM benchmark harness completed
- Legal/ADR posture established: compose around ODM ecosystem, do not fake a rewrite
- New priority: expand from auth MVP into Aerial Operations OS mission-control shell and durable domain schema

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
- TiTiler-backed COG raster delivery
- orthomosaic/DSM viewing
- share pages and export bundles
- comments, approvals, and activity feed depth
- client-safe packaging and report surfaces

## Phase 4 — AI and domain modules
Goal: add high-leverage assistance, not gimmicks.

### In scope
- mission setup assistant
- preflight / processing QA assistant
- docs search / support assistant
- report summary generation
- change-intelligence and agronomy modules later

## Phase 5 — Enterprise and ecosystem expansion
Goal: scale deployment and governance only after the core loop works.

### In scope
- private compute pools
- private cloud/on-prem topologies
- governance/audit expansion
- SSO/SCIM when real demand exists
- white-labeling and private plugins
