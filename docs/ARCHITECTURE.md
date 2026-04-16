# Architecture

## Current direction

The repo is transitioning from an auth-first DroneOps MVP into a broader **Aerial Operations OS**.

The system should be designed with clear plane separation so the app remains credible and operable as processing complexity grows.

## Plane separation

### 1) App plane
- Next.js on Vercel
- SSR auth/session handling
- mission planner UI
- ingest and job dashboards
- output browsers, share flows, and account/admin surfaces
- lightweight BFF endpoints for signed URL coordination, orchestration requests, and secure server-only actions

### 2) Data plane
- Supabase Auth for users, orgs, invites, and entitlements
- Postgres + PostGIS for missions, sites, datasets, jobs, outputs, annotations, and audit history
- Supabase Storage for imagery, mission packages, previews, reports, and derived artifacts
- Realtime for job state changes, comments, presence, and activity updates
- pgvector later for docs search, AI support memory, and template retrieval

### 3) Compute plane
- ODM as default open-source processing engine
- NodeODM contract for upload, commit, status, logs, cancellation, and downloads
- ClusterODM for worker routing and scale-out later
- PyODM-based automation workers for batch orchestration and internal processing control
- Obj2Tiles / Find-GCP / FIELDimageR / alternate engines as optional downstream modules

### 4) Raster delivery plane
- TiTiler or equivalent for COG-backed orthomosaic / DSM / terrain delivery
- derived views such as hillshade, color ramps, contour overlays, and print-friendly map products

### 5) Field companion plane
- browser-first export and install guidance
- optional companion/helper app for mission install, offline sync, controller-aware validation, and fallback workflows where browser-only automation is not credible

## Current implementation reality (2026-04-16)

### Implemented now
- Supabase auth + entitlement gating with action-matrix RBAC (`web/src/lib/auth/actions.ts`)
- protected dashboard and mission workspace routes
- benchmark harness for ODM smoke/evidence runs
- mission-control UI shell with planning, ingest, processing, and output review lanes represented in-product
- shared UI primitives + 5-tone system (`web/src/components/ui/`, `web/src/lib/ui/`)
- MapLibre GL JS planning + coverage maps (`web/src/components/map/`) with OSM fallback style
- GeoJSON validation / bbox / area helpers (`web/src/lib/geo/`)
- managed-processing state machine with truthful transition gates
- `aerial-dispatch-adapter.v1` webhook dispatch contract (operator-routed compute)
- `aerial-dispatch-adapter-callback.v1` webhook callback contract
- NodeODM-direct dispatch adapter (`web/src/lib/dispatch-adapter-nodeodm.ts`) with typed client + three ODM presets
- cron-backed NodeODM status poller (`/api/internal/nodeodm-poll`)
- install-bundle export (`GET /api/missions/[missionId]/install-bundle` — README + manifest + geojson, fflate-zipped)
- structured JSON logging (`web/src/lib/logging.ts`) wired into all webhook + cron + install-bundle routes
- public showcase page at `/`
- truthful ingest-session tracking + benchmark import scripts

### Not yet implemented
- resumable imagery upload service (browser-direct ZIP upload to protected storage is implemented; chunked multi-part is not)
- mission-version diff / promotion UI (the `drone_mission_versions` table is live; the UI surface is deferred)
- TiTiler raster publishing
- real-time collaboration / presence
- signed time-bounded share links for artifacts
- admin / support console
- Playwright end-to-end tests
- Stripe billing, SSO, field companion app, AI QA modules

## Product positioning

The product starts in planning/infrastructure workflows but should be architected for broader use cases:
- transportation and municipal planning
- infrastructure inspection
- AECO/survey support
- utilities
- environmental monitoring
- agriculture modules later

## Legal / licensing posture

- Compose around the ODM ecosystem instead of pretending to replace or secretly fork it wholesale.
- Keep attribution, trademark separation, and source-availability obligations explicit.
- Treat closed controller/device workflows honestly: automate what is credible, provide guided helper flows where direct automation is not.
