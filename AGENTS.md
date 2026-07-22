# AGENTS.md — Aerial Operations OS

Project-specific guidance for agents working in this repo
(`aerial-intel-platform`, default branch `main`). The app lives in `web/`.

## What this project is

**Aerial Operations OS** — a Next.js 16 + Supabase SaaS layer over OpenDroneMap.
Nat Ford Planning product. Ships mission planning, truthful ingest tracking, a
managed-processing state machine, NodeODM-backed compute, a map-first planning
UX (Mapbox satellite), in-app raster (TiTiler) and 3D point-cloud viewing,
install-bundle export, action-matrix RBAC, and an authenticated
processing-worker API that OpenPlan drives over a shared contract.

Primary user: Nathaniel Ford Redmond (Nat Ford Planning). Customers: small
cities, counties, tribes, RTPAs, consultancies, and drone service operators.

Sibling repo: `openplan` (a separate planning app that uses this app as its ODM
processing backend). Stay on your own branches; never disturb in-flight OpenPlan
work.

## Deployment reality

The production target was Vercel, but that account is currently blocked, so the
system runs **self-hosted**: `next start` under a process supervisor, NodeODM +
TiTiler as Docker containers, and cron routes fired by timers that mirror
`vercel.json` cadence (`CRON_SECRET` bearer). Nothing in the app assumes Vercel
at runtime. Keep code portable across both.

## Operating covenant (non-negotiable)

- **Truthful posture.** Never mark a stage complete without attached evidence. No
  placeholder stubs in production data. Managed-processing transitions
  (`drone_processing_jobs.output_summary`) advance only on real signals — ODM
  output uploaded, callback received, dataset coverage computed.
- **Fair exchange + defensible deliverables.** Pricing floors ($3,500 / $8,500 /
  $18,000) reflect the real cost of a client-ready outcome. Do not pretend
  automation replaces qualified review.
- **Protect vulnerable communities.** Planning outputs must not shift burden onto
  disadvantaged or tribal communities for convenience or optics.

## Plane separation

- **App plane** — Next.js 16 App Router (`web/src/app`), React 19, server
  components + server actions.
- **Data plane** — Supabase Postgres with PostGIS, RLS on reads, mutations via
  service-role REST (`web/src/lib/supabase/admin.ts`).
- **Compute plane** — NodeODM (direct client) + a webhook dispatch adapter
  (operator-run). Both feed the same managed-processing state machine.
- **Raster delivery plane** — **shipped.** TiTiler serves COG tiles for
  orthomosaic/DSM/DTM/DEM artifacts (`web/src/lib/titiler/`), rendered on the
  artifact page via MapLibre.
- **3D delivery plane** — **shipped.** Browser-side LAZ decode + three.js
  point-cloud viewer (`web/src/lib/pointcloud/`, `components/point-cloud-viewer.tsx`).
- **Field companion plane** — deferred (offline mobile).

## Code boundaries agents must respect

- All mutation writes go through `web/src/lib/supabase/admin.ts` (service-role
  REST). RLS covers reads only. Never build an ad-hoc admin client for a one-off
  write. The `update*` mutators take an `orgId` and filter on it — they are
  tenant-safe by construction, so keep new mutators in that shape.
- Managed-processing state transitions live in
  `web/src/lib/managed-processing.ts`. To add a stage, extend the state machine
  there, add an event type, and require evidence before the transition.
- Dispatch and processing contracts are versioned and **stable** — add new
  capabilities as new versions, never mutate an existing version's shape:
  - `aerial-dispatch-adapter.v1` / `aerial-dispatch-adapter-callback.v1` (webhook
    dispatch).
  - `natford-aerial-processing.v1` (OpenPlan ↔ this app; see the OpenPlan section).
- Route auth:
  - User-facing routes/pages authenticate through `getDroneOpsAccess`.
  - Internal cron routes use `checkCronAuth` (`web/src/lib/internal-route-auth.ts`)
    — **`CRON_SECRET` bearer only, fail-closed when unset.** There is no
    `vercel-cron/` user-agent fallback anymore (it was spoofable).
  - The external processing API uses `checkExternalProcessingAuth`
    (`AERIAL_EXTERNAL_PROCESSING_TOKEN`), also fail-closed.
- Shared UI helpers live in `web/src/lib/ui/`. `web/src/components/ui/` exists but
  is currently unused/legacy — don't cite it as the home for primitives; prefer
  `@/lib/ui/*` helpers and page-local components.

## UI system

- 5-tone palette: `neutral | info | success | warning | danger`. Use
  `@/lib/ui/tones` helpers (`statusPillClassName`, `jobStatusTone`,
  `missionStatusTone`, `datasetStatusTone`, etc.).
- Formatters: `@/lib/ui/datetime` (`formatDateTime`, `formatRelativeTime`),
  `@/lib/ui/bytes`, `@/lib/ui/labels`. Never duplicate `formatDateTime` inline —
  import it.
- Styling is hand-authored CSS in `web/src/app/globals.css` (Tailwind is **not**
  installed — do not add Tailwind classes; they render unstyled).
- Map views: `<MapView>` from `@/components/map/map-view`. Use `combineBboxes` +
  `expandBbox` for auto-fit; pass `layers: MapLayer[]` (`{id, label?, tone,
  geojson}`) and stay declarative.

## Map library

- **MapLibre GL JS** renderer with a **Mapbox** satellite basemap:
  - `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN` — enables the Mapbox Static Tiles raster
    basemap (satellite-streets by default). `resolveMapStyle`
    (`web/src/components/map/base-style.ts`) builds the style.
  - `NEXT_PUBLIC_MAPBOX_STYLE_ID` — optional style override.
  - `NEXT_PUBLIC_MAPLIBRE_STYLE_URL` — optional full-style override (takes
    precedence over Mapbox).
  - With none set, falls back to an OSM raster style **labeled dev-only** (OSM tile
    policy prohibits production use).
- `NEXT_PUBLIC_*` env reads must be direct `process.env.X` expressions — aliasing
  breaks Next's build-time inlining and silently drops the token.
- AOI polygons are drawn with terra-draw in `GeometryJsonField` (not a raw GeoJSON
  textarea). Drawn polygons are promoted to `MultiPolygon` before write, because
  `drone_missions.planning_geometry` is `geometry(MultiPolygon,4326)`.

## Raster viewing (TiTiler)

- `web/src/lib/titiler/` builds `/cog/tiles/...` + `/cog/WebMercatorQuad/tilejson.json`
  URLs; the artifact page renders them through `<RasterViewer>` for ready
  orthomosaic/DSM/DTM/DEM outputs.
- `AERIAL_TITILER_URL` — the TiTiler base URL (viewer suppressed when unset).
- `AERIAL_TITILER_STORAGE_URL` — optional. Rewrites the **origin** of the signed
  COG URL handed to TiTiler when TiTiler can't reach the app's storage origin
  (e.g. a containerized TiTiler that can't reach a self-host's `127.0.0.1`
  Supabase). Passthrough when unset. See `docs/ops/titiler-setup.md`.
- Use tilejson (WGS84) for MapLibre bounds, not `/cog/info` (which returns
  source-CRS bounds for projected COGs).

## 3D point-cloud viewing

- `web/src/lib/pointcloud/laz.ts` — browser LAZ decoder on `laz-perf` (WASM).
  Parses the LAS header, streams point records, recenters UTM to a local origin
  (float32 precision), auto-detects 8-bit-vs-16-bit RGB (ODM writes 8-bit values
  into 16-bit fields), elevation-ramp fallback, decimation above a point budget.
- `web/src/components/point-cloud-viewer.tsx` — three.js Points + OrbitControls,
  rendered on the artifact page for ready `point_cloud` outputs.
- `web/public/laz-perf.wasm` is bundled locally (no CDN) and loaded via the
  `wasmBinary` override — keep it CSP-safe. The browser fetches the point-cloud
  signed URL directly (no TiTiler / origin rewrite involved).

## OpenPlan integration (this app is OpenPlan's ODM worker)

- Shared contract `natford-aerial-processing.v1`, committed identically in both
  repos at `schemas/aerial_processing_contract.schema.json`.
- Inbound: `POST /api/v1/processing-requests` (bearer `AERIAL_EXTERNAL_PROCESSING_TOKEN`,
  org from `AERIAL_EXTERNAL_PROCESSING_ORG_SLUG`) claims the request in a ledger,
  creates the job/entities, returns `202`/`200-replay`. The `external-ingest`
  cron pulls the imagery ZIP, launches NodeODM, and hands off to the
  upload/poll crons.
- Outbound: the callback outbox (`web/src/lib/external-processing-callbacks.ts`)
  POSTs running/succeeded/failed/canceled callbacks with 24h signed artifact URLs
  (bearer `AERIAL_PROCESSING_CALLBACK_TOKEN`).
- Preset mapping and helpers: `web/src/lib/external-processing.ts`. Full env +
  token pairing: `docs/OPENPLAN_PROCESSING_INTEGRATION.md`.

## Install-bundle export

- Lib `web/src/lib/install-bundle.ts` (`fflate` zipSync); route
  `GET /api/missions/[missionId]/install-bundle` returns a mission-linked ZIP
  (README, manifest, planning.geojson, site.geojson). Schema
  `aerial-intel.install-bundle.v1` — bump when changing layout.

## Mission versioning

- Table `drone_mission_versions`; UI `/missions/[missionId]/versions` snapshots
  current planning geometry + summary, shows an inline payload viewer, and
  supports a **side-by-side diff** (`buildVersionDiff`, `@/lib/missions/version-diff`)
  plus promote-to-current for non-installed versions.
- Promote writes `plan_payload` back into mission `summary` + `planning_geometry`
  and marks the version `installed`. **Do NOT** insert into
  `drone_processing_job_events` — `mission_id` is not a valid `job_id` FK; the
  audit trail is the version row's own `status` + `updated_at`.

## Signed-share artifact links

- Table `drone_artifact_share_links` with tenant-safe composite FK
  `(org_id, artifact_id)`. Tokens are **hashed at rest** — the table stores only
  `token_hash` (SHA-256); there is no plaintext token column.
- Lib `web/src/lib/sharing.ts` — `hashShareToken` (pinned test vector),
  `validateShareLink` (precedence `revoked > expired > exhausted`). Redemption
  goes through the `redeem_drone_share_link` RPC (hashes input, fail-closed).
- Public routes `/s/[token]` (landing) + `/s/[token]/download` (5-minute signed
  URL, increments `use_count`, 302). Page views don't count — only downloads.
- Plaintext exists only transiently at creation: the artifact page reveals the
  one-time URL via `ShareLinkForm` (useState + useTransition — **not**
  `useActionState`, which fell back to native submit and never revealed).

## Admin / people console

- Route `/admin` (gated by `admin.support`); `/admin/people` supports **write
  actions**: `inviteMemberAction`, `suspendMemberAction`, `reactivateMemberAction`,
  `revokeInvitationAction` (`web/src/app/admin/people/actions.ts`), each gated by
  a specific matrix action. Owners manage admin status; you cannot suspend the
  owner. Invitations are accepted by an explicit POST action, never a GET side
  effect.

## Aerial Copilot

- Narrow, grounded AI assist under `web/src/lib/copilot/`. Global kill-switch
  `AERIAL_COPILOT_ENABLED`, plus per-org opt-in (`drone_org_settings.copilot_enabled`)
  and a spend cap. Every consequential figure in generated copy must appear in
  the cited facts (numeric faithfulness belt in `grounding-validator.ts`).

## Logging

- `createLogger(namespace, baseFields)` from `@/lib/logging` — JSON lines with
  `namespace`, `level`, `timestamp`, `message`, merged fields. Thread
  `extractRequestId(request)` into API-route loggers. Dotted event names
  (`bundle.built`, `job.advanced`, `callback.applied`). Min level via
  `AERIAL_LOG_LEVEL`.

## Action-matrix RBAC

- Actions in `web/src/lib/auth/actions.ts`. Roles: `owner`, `admin`, `analyst`,
  `viewer`. `getDroneOpsAccess` returns `actions: DroneOpsAction[]` — branch off
  `canPerformDroneOpsAction(...)` with a specific action, never re-check role
  strings inline.
- Page-level gating is per-route (the proxy/middleware only refreshes Supabase
  session cookies). The matcher excludes `/api/dispatch/adapter/callback` and
  `/api/internal/*` — never funnel webhook/cron auth through the proxy.
- An invalid/expired/foreign session cookie must degrade to signed-out
  (`isInvalidSessionError`), not crash the page to the error boundary.

## What NOT to do

- **Do not re-introduce the 30+ copy-variant blocked-access ribbon.** It's
  consolidated into a 4-tab `SupportDiagnosticsPanel`.
- **Do not re-fork pages into mega-files.** If a page grows past ~600 lines,
  extract server actions into an `actions.ts` and derivation into a
  `view-model.ts` (the pattern used for `missions/[missionId]`).
- **Do not mutate a shipped contract version** (`aerial-dispatch-adapter.v1`,
  `-callback.v1`, `natford-aerial-processing.v1`). Add `v2`.
- **Do not add mocked-database integration tests.** Unit tests mock `fetch`; state
  machine tests run against real fixtures, not an in-memory DB stub. Browser-verify
  user-facing changes against a real deployment — mocked tests have repeatedly
  hidden RLS/PostGIS/Server-Action bugs.
- **Do not bypass `web/src/lib/supabase/admin.ts`** for writes.
- **Do not add Tailwind classes** (Tailwind is not installed).

## Quickstart

```bash
cd web
npm install
cp .env.example .env.local        # fill in Supabase + optional NodeODM/Mapbox/TiTiler
npm run dev                        # http://localhost:3000
npm run lint
npm run test                       # vitest
npm run build
npx tsc --noEmit                   # (known pre-existing errors in report-summary.test.ts + tests/e2e/*)
```

Supabase migrations: apply the chain in `supabase/migrations/` to the target
database (the update scripts rebuild the app, not the schema — apply schema
changes explicitly).

Benchmark + seed scripts:

- `scripts/run_odm_benchmark.sh` — reproducible ODM benchmark run.
- `scripts/e2e_v1_slice.sh` — end-to-end slice: seed → ingest → dispatch → callback → promote.
- `scripts/seed_aerial_ops_workspace.mjs` — deterministic seed (Playwright + dev).
- `scripts/provision_droneops_buyer.mjs` — create buyer user + org + entitlement.

## Docs index

- `README.md` — overview, status, quickstart, architecture.
- `docs/ROADMAP.md` — phased plan, live status.
- `docs/ARCHITECTURE.md` — plane-separated architecture.
- `docs/OPERATIONS.md` — runbook (NodeODM local, cron auth, migrations).
- `docs/ops/titiler-setup.md` — TiTiler raster viewer setup + storage reachability.
- `docs/OPENPLAN_PROCESSING_INTEGRATION.md` — OpenPlan ↔ Aerial processing contract + tokens.
- `docs/DISPATCH_ADAPTER_CONTRACT.md` — webhook dispatch launch + callback contract.
- `docs/ODM_PLUS_COMPARISON_MATRIX.md` — baseline OSS vs. Aerial Operations OS.
- `docs/CHANGELOG.md` — changelog.

## When in doubt

Re-read the truthful-posture rule. If you're about to advance a stage, ship a
status badge, or claim a capability — ask: *what evidence attached to the data
proves this?* If none, don't ship it.
