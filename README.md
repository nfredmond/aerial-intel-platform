# Nat Ford Aerial Intelligence Platform (Aerial Operations OS)

Project slug: `aerial-intel-platform`  
default branch: `main`  
Vercel project: `natford/aerial-intel-platform` (linked on 2026-03-16 for direct `main` production shipping; corrected to `web/` root on 2026-03-16)

See the charter and docs folder for current scope and architecture. The repo is now evolving from a narrow DroneOps auth MVP into a broader **Aerial Operations OS** covering mission planning, ingest, processing, delivery, and repeat capture workflows.

## Current Implementation Tracks

- ODM benchmark harness (`scripts/run_odm_benchmark.sh`)
- Truthful local v1 slice orchestrator (`scripts/e2e_v1_slice.sh`)
- Download-first review bundle builder (`scripts/build_v1_review_bundle.mjs`)
- Managed-processing request lifecycle for truthful operator-assisted orchestration (`web/src/lib/managed-processing.ts`)
- Auth delivery readiness plan (`docs/AUTH_DELIVERY_READINESS_2026-03-03.md`)
- Aerial Operations OS execution plan (`docs/AERIAL_OPERATIONS_OS_EXECUTION_PLAN_2026-03-15.md`)
- Supabase auth/entitlement schema scaffold (`supabase/migrations/202603040001_droneops_auth_foundation.sql`)
- Core aerial-ops domain schema scaffold (`supabase/migrations/202603150001_aerial_ops_core_foundation.sql`)
- Mission-control web shell with protected dashboard + `/missions` workspace (`web/`)

## Truthful status snapshot

### Real now
- Local ZIP -> extract -> single-host Docker ODM run -> review bundle -> optional Supabase import
- Imported benchmark-backed jobs/artifacts can render in `/jobs/[jobId]` and `/artifacts/[artifactId]`
- Benchmark imports can now attach real outputs directly onto an existing managed-processing job instead of only creating a standalone benchmark-import record
- Storage-backed imported outputs now surface as signed downloads in mission, job, and artifact views when the files have actually been published into protected storage
- Artifact review/share/export audit surfaces exist in the web app
- Mission detail can now upload a ZIP directly from the browser into protected Supabase Storage and record an honest v1 ingest session with storage evidence, benchmark/run-log placeholders, and review-bundle readiness without pretending extraction or ODM orchestration already ran
- Mission detail can now create a truthful managed-processing request that tracks operator intake review, host dispatch, QA start, and delivery-ready completion without staging fake artifacts before a real run is attached/imported
- Managed job detail can now import real benchmark evidence, optional review bundle/run log, and uploaded output artifacts directly from the browser into protected storage, then attach them onto the managed job without relying on the shell-only import script
- Managed job detail now includes an honest dispatch handoff form: operators can record the assigned processing host, optional worker/slot, external run reference, and dispatch notes before the app advances the request into processing, and the job timeline/UI reflects that real handoff metadata

### Not real yet
- Resumable/browser-recoverable ingest beyond the current signed-upload path
- Real NodeODM/ClusterODM orchestration initiated from the app
- Automatic dispatch creation from the app into a real worker/NodeODM API (the app now records truthful dispatch handoff metadata, but an operator still performs the actual compute-side launch)
- Broad signed-download delivery beyond storage-published imported artifacts, TiTiler-backed raster viewing, and compute-worker automation for app-initiated ODM jobs
- Install bundles derived from real mission-planner/controller exports rather than placeholder handoff records

See `docs/V1_SINGLE_HOST_ODM_SLICE.md` for the current v1 slice definition and acceptance bar.

## Quickstart (single-host v1 slice)

Run the first truthful local slice against a mission ZIP that contains imagery:

```bash
./scripts/e2e_v1_slice.sh <images_zip_file> <project_slug> --mission-name "<mission label>"
```

Example:

```bash
./scripts/e2e_v1_slice.sh ./sample-datasets/gv-downtown.zip gv-downtown \
  --mission-name "Grass Valley downtown curb inventory"
```

This produces:

- `.data/v1_slice_<project_slug>_<timestamp>/dataset/images/*`
- `benchmark/<timestamp>_<project_slug>/run.log`
- `benchmark/<timestamp>_<project_slug>/summary.json`
- `.data/v1_slice_<project_slug>_<timestamp>/export_bundle/REVIEW.md`
- `.data/v1_slice_<project_slug>_<timestamp>/export_bundle/EXPORT_MANIFEST.json`
- `.data/v1_slice_<project_slug>_<timestamp>/export_bundle_<project_slug>.zip`

The script exits non-zero if the ODM run fails to clear the truthful v1 bar, but it still preserves the review bundle so the run can be inspected honestly.

### Optional: import the same run into Supabase

```bash
SUPABASE_URL=https://<project-ref>.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=<service-role-key> \
./scripts/e2e_v1_slice.sh ./sample-datasets/gv-downtown.zip gv-downtown \
  --mission-name "Grass Valley downtown curb inventory" \
  --import-to-db \
  --org-slug acme-drone-co \
  --mission-id <mission-uuid>
```

### Optional: attach a real run onto an existing managed-processing job and publish protected downloads

```bash
SUPABASE_URL=https://<project-ref>.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=<service-role-key> \
node scripts/import_odm_benchmark_run.mjs \
  --org-slug acme-drone-co \
  --mission-id <mission-uuid> \
  --job-id <managed-job-uuid> \
  --summary benchmark/20260406T001500Z_gv/summary.json \
  --review-bundle .data/v1_slice_gv_20260406/export_bundle_gv.zip \
  --publish-to-storage
```

## Quickstart (benchmark script only)

Run ODM against a dataset folder that contains an `images/` directory:

```bash
./scripts/run_odm_benchmark.sh <dataset_root> <project_name>
```

Example:

```bash
./scripts/run_odm_benchmark.sh ./sample-datasets/site-a site-a-baseline
```

Artifacts are written to:

- `benchmark/<timestamp>/run.log`
- `benchmark/<timestamp>/summary.json`

You can override the run folder for orchestration scripts by setting `BENCHMARK_RUN_DIR`.

`summary.json` now includes output presence checks in `outputs` for:

- `orthophoto` (`odm_orthophoto/odm_orthophoto.tif`)
- `dem` (prefers `odm_dem/dsm.tif`, falls back to `odm_dem/dtm.tif`)
- `point_cloud` (prefers `odm_georeferencing/odm_georeferenced_model.laz`, falls back to `.ply`)
- `mesh` (`odm_texturing/odm_textured_model.obj`)

Each output entry includes:

- `path`
- `exists`
- `non_zero_size`
- `size_bytes`

`summary.json` also includes a `qa_gate` section with:

- `required_outputs_present` (orthophoto + dem + point cloud)
- `minimum_pass` (run status is `success` and required outputs are present)
- `missing_required_outputs` (array)

Optional overrides:

- `ODM_IMAGE` (default: `opendronemap/odm:latest`)
- `ODM_ARGS` (default: `--project-path /datasets <project_name>`)

Example override:

```bash
ODM_IMAGE=opendronemap/odm:3.5.5 ODM_ARGS="--project-path /datasets site-a-baseline --orthophoto-resolution 2" ./scripts/run_odm_benchmark.sh ./sample-datasets/site-a site-a-baseline
```

## Web app (current mission-control shell)

Current Next.js app features:

- `/sign-in` email/password auth via Supabase
- `/dashboard` protected route for account and entitlement context
- `/missions` protected Aerial Operations OS workspace shell with visual mission readiness strips, a GIS triage board, and a client-side mission board supporting search, stage/risk filtering, and sorting
- `/missions/[missionId]` mission detail with live actions for dataset attachment, AOI geometry attachment, queued processing, install-bundle generation, approval/install/delivery state updates, explainable GIS spatial-intelligence scoring, copyable GIS copilot briefs, geometry/terrain posture cards, planned-vs-captured coverage comparison, GIS overlay/constraint planning, in-app geometry preview, interactive preview layer toggles, multi-dataset comparison targeting, mission-wide dataset coverage roster, overlay-review tracking, a mission readiness checklist, sample GeoJSON helpers, live draft-geometry preview/validation, a visual mission dashboard, and richer map-style zoom/pan/focus controls
- `/datasets/[datasetId]` dataset preflight review surface for capture findings, readiness approval, footprint geometry attachment, GIS spatial-intelligence scoring, copyable GIS copilot briefs, coverage-footprint posture cards, planned-vs-captured coverage comparison, in-app geometry preview, sample GeoJSON helpers, and live draft-geometry preview/validation
- `/jobs/[jobId]` processing job detail with artifact linkage, retry/cancel controls, and imported log-tail visibility
- `/artifacts/[artifactId]` artifact review/share/export surface with copy-ready delivery packets
- role + entitlement gate (`drone_memberships` + active `drone_entitlements` where `product_id='drone-ops'`)
- query-backed mission workspace loading from Supabase aerial-ops tables when present, with automatic fallback to the built-in demo workspace when the new migration is empty or not applied yet
- mission-control layout with a command bar, workspace rail, mission lanes, contextual inspector, and job/activity console
- authenticated write paths for draft mission creation, dataset attachment, queued processing jobs, and placeholder output staging
- blocked state with support contact + prefilled support diagnostics (user ID, organization ID/slug/name, role, membership, entitlement), a generated support reference + UTC snapshot timestamp, support email subjects prefilled with that reference, an "Open in Gmail" quick action, one-click copy actions for the signed-in user ID, signed-in account email, organization ID, organization slug, organization name, support email address, support email link, support Gmail compose link, support reference, support snapshot timestamp, support triage summary, support follow-up line, support escalation line, support call brief, support reference + snapshot line, support diagnostics CSV block, support diagnostics TSV block, support diagnostics key-value block, support diagnostics markdown block, support diagnostics markdown table, support diagnostics JSON line, support log search query, blocked-access reason, operator handoff checklist, operator escalation packet, support ticket title, support ticket header line, support ticket body, support email subject, support email body, support context, support context JSON, and full support email draft text, and ready-to-copy manual fallback text boxes when clipboard access is unavailable

### Local setup

1) Ensure the auth schema migration has been applied:

```bash
supabase db push
```

2) Install and run the web app:

```bash
cd web
npm install
npm run dev
```

3) Build check:

```bash
cd web
npm run build
```

### Required web environment variables

Copy `web/.env.example` to `web/.env.local` and set:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
```

## Import a real ODM benchmark run

After you have a `benchmark/<timestamp>/summary.json`, you can import it into the aerial-ops data model and surface it in the app:

```bash
SUPABASE_URL=https://<project-ref>.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=<service-role-key> \
node scripts/import_odm_benchmark_run.mjs \
  --org-slug acme-drone-co \
  --mission-id <mission-uuid> \
  --summary benchmark/<timestamp>/summary.json
```

This creates a completed benchmark-backed processing job, links/creates a dataset when needed, inserts output records for detected deliverables, and records benchmark QA events so `/jobs/[jobId]` and `/artifacts/[artifactId]` can show evidence-backed readiness.

## Buyer provisioning script

Use this script to create/find a buyer auth user, create/find org, and upsert membership + active entitlement:

```bash
SUPABASE_URL=https://<project-ref>.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=<service-role-key> \
node scripts/provision_droneops_buyer.mjs \
  --email buyer@example.com \
  --password 'TempStrongPass!123' \
  --org-name 'Acme Drone Co' \
  --org-slug acme-drone-co \
  --role owner \
  --tier pro
```

Notes:

- `--role` defaults to `owner`
- `--tier` defaults to `starter`
- If the user already exists, the script reuses that account and leaves password unchanged

## Seed a query-backed workspace

After applying migrations and provisioning an org, you can seed one org with a real project/site/mission/dataset/job/output/event set:

```bash
SUPABASE_URL=https://<project-ref>.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=<service-role-key> \
node scripts/seed_aerial_ops_workspace.mjs --org-slug acme-drone-co
```

This creates a starter project/site/mission/dataset/job/output/event set so the `/missions` route can render from real Supabase data instead of the fallback demo snapshot.
