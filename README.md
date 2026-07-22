# Nat Ford Aerial Intelligence Platform (Aerial Operations OS)

Project slug: `aerial-intel-platform` · Default branch: `main` · App in `web/`

**Aerial Operations OS** — a Next.js 16 + Supabase SaaS layer over OpenDroneMap.
Mission planning → imagery ingest → NodeODM/ODM processing → orthomosaic / DSM /
point-cloud delivery, with in-app raster and 3D viewers, action-matrix RBAC, and
an authenticated processing-worker API that the sibling **OpenPlan** app drives
over a shared contract. Built for small cities, counties, tribes, RTPAs,
consultancies, and drone service operators.

See `AGENTS.md` for contributor/agent guidance and code boundaries.

> **Deployment note:** the production target was Vercel, but that account is
> currently blocked, so the system runs **self-hosted** (`next start` under a
> process supervisor; NodeODM + TiTiler as Docker containers; cron routes fired
> by timers that mirror `vercel.json`). Nothing in the app assumes Vercel at
> runtime.

## Status-at-a-glance

**Shipped**
- Mission / dataset / job / artifact spine with PostGIS geometry (Supabase).
- Evidence-gated managed-processing state machine (`web/src/lib/managed-processing.ts`).
- Map-first planning UX on MapLibre GL with a **Mapbox satellite** basemap and
  terra-draw AOI polygon drawing.
- NodeODM-direct dispatch + a webhook dispatch adapter (`aerial-dispatch-adapter.v1`).
- Cron-backed NodeODM upload/poll pipeline (streamed, not in-memory).
- **In-app raster viewer** — TiTiler COG tiles for orthomosaic/DSM/DTM/DEM on the
  artifact page.
- **In-app 3D point-cloud viewer** — browser LAZ decode (laz-perf WASM) + three.js.
- **OpenPlan integration** — inbound `POST /api/v1/processing-requests` +
  callback outbox over `natford-aerial-processing.v1` (proven end-to-end).
- Mission-version snapshot + **side-by-side diff** + promote-to-current
  (`/missions/[missionId]/versions`).
- Signed-share artifact links with **hashed-at-rest tokens**, revoke, and usage
  caps (`/s/[token]`).
- Admin / people console with **write actions** (invite / suspend / reactivate),
  gated by the action matrix (`/admin`).
- Aerial Copilot — narrow, grounded AI assist (per-org opt-in + spend cap).
- Install-bundle export (`GET /api/missions/[missionId]/install-bundle`).
- Structured JSON logging across API + cron routes.
- Public showcase at `/`; Playwright E2E scaffold (`web/tests/e2e/`).

**Deferred (explicit non-goals for now)**
- Field companion (offline mobile), Stripe billing, SSO.
- Mesh (`.obj`/`.ply`) viewing and geo-referenced point-cloud map overlay.
- Auth-gated E2E in PR CI (needs a dedicated test Supabase project).

## Quickstart

```bash
cd web
npm install
cp .env.example .env.local          # fill in Supabase + optional Mapbox/NodeODM/TiTiler
npm run dev                          # http://localhost:3000
npm run lint && npm run test && npm run build
npx tsc --noEmit                     # known pre-existing errors: report-summary.test.ts, tests/e2e/*
```

**Optional NodeODM (local compute):**

```bash
docker run -p 3001:3000 opendronemap/nodeodm
export AERIAL_NODEODM_URL=http://localhost:3001
```

**Supabase:** apply the migration chain in `supabase/migrations/` to the target
database. Deploy/update scripts rebuild the app, not the schema — apply schema
changes explicitly.

## Environment variables

The full annotated list is in `web/.env.example`. Highlights:

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase client (required). |
| `SUPABASE_SERVICE_ROLE_KEY` | Service-role writes / signed storage URLs (server-only). |
| `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN` | Enables the Mapbox satellite basemap (else dev-only OSM fallback). |
| `NEXT_PUBLIC_MAPBOX_STYLE_ID`, `NEXT_PUBLIC_MAPLIBRE_STYLE_URL` | Optional basemap overrides. |
| `AERIAL_NODEODM_URL`, `AERIAL_NODEODM_TOKEN`, `AERIAL_NODEODM_MODE` | NodeODM compute. |
| `AERIAL_DISPATCH_ADAPTER_URL` / `_LABEL` / `_TOKEN`, `AERIAL_DISPATCH_CALLBACK_TOKEN` | Webhook dispatch adapter + inbound callback auth. |
| `AERIAL_TITILER_URL` | TiTiler base URL for the raster viewer (viewer suppressed when unset). |
| `AERIAL_TITILER_STORAGE_URL` | Optional: origin TiTiler should use to fetch the COG when it can't reach the app's storage origin. |
| `CRON_SECRET` | Bearer secret for internal cron routes (fail-closed when unset). |
| `AERIAL_EXTERNAL_PROCESSING_TOKEN`, `AERIAL_EXTERNAL_PROCESSING_ORG_SLUG`, `AERIAL_PROCESSING_CALLBACK_TOKEN` | OpenPlan processing-worker API + callback auth. |
| `AERIAL_COPILOT_ENABLED`, `AI_GATEWAY_API_KEY`, `AERIAL_COPILOT_DEFAULT_CAP_TENTH_CENTS` | Aerial Copilot. |
| `AERIAL_LOG_LEVEL` | `debug \| info \| warn \| error`. |

## Architecture (planes)

```
+-----------+   +----------+   +-------------+   +------------------+   +-----------+
| App plane |-->| Data     |-->| Compute     |-->| Raster delivery  |   | 3D view   |
| Next.js16 |   | Supabase |   | NodeODM +   |   | TiTiler (COG)    |   | laz-perf  |
| SSR + SA  |   | PostGIS  |   | webhook op  |   | + point cloud    |   | + three.js|
+-----------+   +----------+   +-------------+   +------------------+   +-----------+
```

- **App plane** — Next.js 16 App Router + React 19 (`web/`), server components +
  server actions.
- **Data plane** — Supabase Postgres/PostGIS; RLS on reads, service-role writes
  through `web/src/lib/supabase/admin.ts`.
- **Compute plane** — NodeODM direct client + `aerial-dispatch-adapter.v1`
  webhook (operator-run).
- **Raster + 3D delivery** — TiTiler COG tiles (`web/src/lib/titiler/`) and a
  browser point-cloud viewer (`web/src/lib/pointcloud/`).

See `docs/ARCHITECTURE.md` for the detailed breakdown.

## Key routes

- `/` — public showcase.
- `/sign-in` — Supabase email/password auth.
- `/dashboard` — account + entitlement context (gated).
- `/missions`, `/missions/[missionId]`, `/missions/[missionId]/versions` — planning workspace, mission detail, version history + diff.
- `/datasets/[datasetId]` — dataset preflight review.
- `/jobs/[jobId]` — processing job detail (retry/cancel, log tail).
- `/artifacts/[artifactId]` — artifact review/share/export, raster + 3D viewers.
- `/admin`, `/admin/people` — admin console + membership write actions.
- `/s/[token]`, `/s/[token]/download` — public signed-share landing + download.
- `POST /api/v1/processing-requests` — OpenPlan processing-worker API.
- `GET /api/missions/[missionId]/install-bundle` — mission install bundle ZIP.
- `/api/internal/*` — cron routes (upload, poll, external-ingest, heartbeat).

## Scripts

- `scripts/run_odm_benchmark.sh <dataset_root> <project_name>` — reproducible ODM
  benchmark; writes `benchmark/<timestamp>/{run.log,summary.json}` with
  output-presence + QA-gate checks.
- `scripts/e2e_v1_slice.sh <images_zip> <project_slug>` — truthful local slice:
  ingest → single-host ODM → review bundle → optional Supabase import.
- `scripts/import_odm_benchmark_run.mjs` — attach a real run's outputs onto a
  managed job and publish protected downloads.
- `scripts/provision_droneops_buyer.mjs` — create/find buyer user + org +
  active entitlement.
- `scripts/seed_aerial_ops_workspace.mjs` — seed one org with a real
  project/site/mission/dataset/job/output/event set.

## Docs index

- `AGENTS.md` — contributor/agent guidance, code boundaries, don't-do list.
- `docs/ROADMAP.md` — phased plan with live status.
- `docs/ARCHITECTURE.md` — plane separation + implemented-vs-deferred.
- `docs/OPERATIONS.md` — runbook (NodeODM, cron auth, migrations).
- `docs/ops/titiler-setup.md` — raster viewer setup + storage reachability.
- `docs/OPENPLAN_PROCESSING_INTEGRATION.md` — OpenPlan ↔ Aerial contract + tokens.
- `docs/DISPATCH_ADAPTER_CONTRACT.md` — webhook dispatch launch + callback contract.
- `docs/ODM_PLUS_COMPARISON_MATRIX.md` — baseline OSS vs. Aerial Operations OS.
- `docs/CHANGELOG.md` — changelog.
