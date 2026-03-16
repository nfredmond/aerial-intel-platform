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

## Current implementation reality

### Implemented now
- Supabase auth + entitlement gating
- protected dashboard and mission workspace routes
- benchmark harness for ODM smoke/evidence runs
- mission-control UI shell with planning, ingest, processing, and output review lanes represented in-product

### Not yet implemented
- live mission geometry editing
- resumable upload service
- real NodeODM/ClusterODM orchestration
- TiTiler raster publishing
- real-time collaboration/presence
- install helper automation beyond planning and UX scaffolding

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
