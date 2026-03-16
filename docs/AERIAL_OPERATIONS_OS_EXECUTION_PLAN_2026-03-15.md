# Aerial Operations OS — Execution Plan

_Date: 2026-03-15_

This document adapts `final_odm_aerial_ops_master_prompt.md` into the current repo state. It intentionally keeps prior good work (auth, entitlement gating, benchmark harness, legal posture) and upgrades the project from a narrow DroneOps auth MVP into a broader **Aerial Operations OS**.

## 1) Product thesis

We are not building just a sign-in gate for drone processing. We are building a full lifecycle operational system:

**plan mission -> validate mission -> install mission -> upload data -> process imagery -> review outputs -> annotate -> share -> export -> repeat**

The free tier must already beat the value of a basic mission-planning utility, while the paid product differentiates on collaboration, orchestration, delivery quality, governance, and private deployment.

## 2) Current repo strengths to preserve

- Supabase auth + org/membership/entitlement foundation
- Blocked-access diagnostics and support workflows
- ODM benchmark harness and benchmark protocol docs
- Strong initial legal architecture direction (compose around ODM ecosystem, do not fake a rewrite)
- Modern Next.js app shell already connected to Supabase SSR auth

## 3) Immediate repo direction

### What we are upgrading now
1. **App shell** -> move from dashboard-only UX to mission-control IA
2. **Domain schema** -> add core project/site/mission/dataset/job/output tables
3. **Roadmap** -> shift from auth-only MVP framing to phased aerial ops platform framing
4. **Architecture** -> explicitly separate app, data, compute, raster delivery, and field companion planes

### What we are not pretending is done yet
- live ODM/NodeODM/ClusterODM orchestration
- resumable ingest pipeline
- TiTiler-backed raster publishing
- real KMZ/WPML round-trip mission editing
- full field installer automation
- production collaboration/realtime/presence

## 4) First shipping sequence

### Slice A — Mission-control shell
Ship a workspace that visibly matches the new product direction:
- top command bar
- left operations rail
- center mission lanes
- right contextual inspector
- bottom job/activity console
- richer demo data representing planning, ingest, processing, and delivery

### Slice B — Durable domain schema foundation
Add Postgres/PostGIS foundation for:
- `drone_projects`
- `drone_sites`
- `drone_missions`
- `drone_mission_versions`
- `drone_datasets`
- `drone_processing_jobs`
- `drone_processing_outputs`

### Slice C — Real pipeline vertical slice
Implement one real end-to-end path:
- dataset record
- job submission record
- job stage/event updates
- artifact record surface in UI
- benchmark artifact ingestion

### Slice D — Planner + install path
After the data model is stable:
- mission editor canvas
- terrain preview and validation
- mission versioning
- export bundle generation
- installer helper v1

## 5) Architectural posture

### App plane
- Next.js on Vercel
- SSR auth/session surface
- planner, dashboards, output browsers, admin/product UI

### Data plane
- Supabase Auth
- Postgres + PostGIS
- Storage
- Realtime
- audit/event persistence
- pgvector later for docs/AI support

### Compute plane
- ODM default engine
- NodeODM contract for jobs/uploads/status/logs
- ClusterODM for horizontal scaling
- PyODM automation workers
- Obj2Tiles / Find-GCP / FIELDimageR as later modules

### Raster delivery plane
- TiTiler or equivalent for COG visualization and terrain/raster endpoints

### Field companion plane
- browser-first handoff plus companion flows where direct mission install is not credible in-browser

## 6) Data model priorities

The first durable schema expansion should focus on:
- org-owned project/site hierarchy
- mission records + versioned mission payloads
- ingest datasets + footprints
- processing jobs + events
- processing outputs + storage references

This is the minimum viable backbone needed to replace demo-only mission/workspace state.

## 7) Acceptance bar for the next real v1 milestone

The next meaningful milestone is not "more auth polish." It is:

1. create/select mission
2. attach dataset
3. submit processing job
4. watch job status and logs
5. see output artifact readiness
6. review/share/export at least one real deliverable

## 8) Risks to actively manage

- scope drift into enterprise auth before the core product loop exists
- UI polish outrunning data model reality
- AGPL/trademark confusion in product messaging
- fake field-installer claims in partially closed DJI ecosystems
- a placeholder CI pipeline that does not test the real app

## 9) Next implementation recommendation

Keep shipping in this order:
1. mission-control UX shell
2. schema foundation
3. real job/event/artifact pipeline
4. benchmark-backed viewer/output slice
5. planner/import/export depth
