# AGENTS.md — Aerial Operations OS

Scoped guidance for agents working inside `/home/narford/.openclaw/workspace/aerial-intel-platform`.
This file carries project-specific rules. Broader home-level guidance lives at `/home/narford/AGENTS.md`.

## What this project is

**Aerial Operations OS** — a Next.js 16 + Supabase SaaS layer over OpenDroneMap. Nat Ford Planning product.
Ships mission planning, truthful ingest tracking, managed-processing state machine, map-first planning UX,
NodeODM-direct and webhook dispatch, install-bundle export for field tools, and action-matrix RBAC.

Primary user: Nathaniel Ford Redmond (Nat Ford Planning). Customers: small cities, counties, tribes, RTPAs,
consultancies, and drone service operators.

## Operating covenant (non-negotiable)

- **Truthful posture.** Never mark a stage complete without attached evidence. No placeholder stubs in
  production data. Managed-processing transitions (`drone_processing_jobs.output_summary`) advance only on
  real signals — ODM output uploaded, callback received, dataset coverage computed.
- **Fair exchange + defensible deliverables.** Pricing floors ($3,500 / $8,500 / $18,000) reflect real cost
  of a client-ready outcome. Do not pretend automation replaces qualified review.
- **Protect vulnerable communities.** Planning outputs must not shift burden onto disadvantaged or tribal
  communities for convenience or optics.

## Plane separation

- **App plane** — Next.js 16 App Router (`web/src/app`), React 19, server components + server actions.
- **Data plane** — Supabase Postgres with PostGIS, RLS on reads, mutations via service-role REST.
- **Compute plane** — webhook dispatch adapter (operator-run) + optional NodeODM-direct adapter.
- **Raster delivery plane** — deferred (TiTiler).
- **Field companion plane** — deferred (offline mobile).

## Code boundaries agents must respect

- All mutation writes go through `web/src/lib/supabase/admin.ts` (service-role REST). RLS covers reads.
  Never build an ad-hoc admin client for a one-off write.
- Managed-processing state transitions live in `web/src/lib/managed-processing.ts`. To add a stage, extend
  the state machine there, add an event type, and ensure evidence is required before transition.
- Dispatch contracts are `aerial-dispatch-adapter.v1` and `aerial-dispatch-adapter-callback.v1`. Both are
  stable — add new capabilities as new contract versions, never mutate v1.
- New API routes must authenticate through `getDroneOpsAccess` (for user requests) or the cron pattern
  (`CRON_SECRET` Bearer OR `vercel-cron/` user-agent) for internal routes.
- UI primitives belong in `web/src/components/ui/`; map primitives in `web/src/components/map/`.
  Page-specific split components belong in `_components/` subfolders next to the page.

## UI system

- 5-tone palette: `neutral | info | success | warning | danger`. Use `@/lib/ui/tones` helpers
  (`statusPillClassName`, `jobStatusTone`, `missionStatusTone`, `datasetStatusTone`, etc.).
- Formatters: `@/lib/ui/datetime` (`formatDateTime`, `formatRelativeTime`), `@/lib/ui/bytes`,
  `@/lib/ui/labels`. Never duplicate `formatDateTime` inline in a page — import from `lib/ui/datetime`.
- Map views: `<MapView>` from `@/components/map/map-view`. Requires a MapLibre-compatible style URL or
  falls back to OSM. Use `combineBboxes` + `expandBbox` for auto-fit.
- When adding a new map view, stay declarative: pass `layers: MapLayer[]` with `{id, label?, tone, geojson}`.

## Map library

- **MapLibre GL JS** (not Mapbox). Optional satellite/terrain via env:
  - `NEXT_PUBLIC_MAPLIBRE_STYLE_URL` — base style URL (defaults to OSM fallback).
  - `NEXT_PUBLIC_MAPLIBRE_SATELLITE_URL` — optional satellite style.
- Rationale: covenant-aligned (no per-request revenue extraction), no secret needed for local dev.

## NodeODM direct dispatch

NodeODM integration is **additive** to the webhook adapter. To enable it locally:

```bash
docker run -p 3000:3000 opendronemap/nodeodm
```

Then set:

```bash
AERIAL_NODEODM_URL=http://localhost:3000
AERIAL_NODEODM_TOKEN=       # optional
```

Key files:

- `web/src/lib/nodeodm/` — typed client, contracts, presets (fast-ortho / balanced / high-quality-3d).
- `web/src/lib/dispatch-adapter-nodeodm.ts` — exposes `launchNodeOdmTask`, `pollNodeOdmTask`.
- `web/src/app/api/internal/nodeodm-poll/route.ts` — cron-scheduled poll advancing `output_summary.nodeodm`.

End-to-end NodeODM verification is **manual** against a local container. Do not claim NodeODM round-trip
is tested by the unit suite — the unit suite mocks `fetch`.

## Install-bundle export

- Lib: `web/src/lib/install-bundle.ts` (uses `fflate` zipSync).
- Route: `GET /api/missions/[missionId]/install-bundle` — returns a mission-linked ZIP with README,
  manifest, planning.geojson, site.geojson.
- Schema version: `aerial-intel.install-bundle.v1`. Bump when changing layout.

## Logging

- Use `createLogger(namespace, baseFields)` from `@/lib/logging`. Emits JSON lines with `namespace`,
  `level`, `timestamp`, `message`, and merged fields.
- All API routes should thread `extractRequestId(request)` into the logger's base fields.
- Log events use dotted names: `bundle.built`, `job.advanced`, `callback.applied`. Keep them specific.
- Control min level via `AERIAL_LOG_LEVEL=debug|info|warn|error`.

## Action-matrix RBAC

- Actions defined in `web/src/lib/auth/actions.ts`. Roles: `owner`, `admin`, `analyst`, `viewer`.
- `getDroneOpsAccess` returns `actions: DroneOpsAction[]`. Branch off that rather than re-checking role
  strings inline.
- Page-level gating is still per-route (proxy only refreshes Supabase session cookies). Proxy matcher
  excludes `/api/dispatch/adapter/callback` and `/api/internal/*` — never funnel webhook/cron auth through
  proxy.

## Dispatch contracts — extension rules

- `aerial-dispatch-adapter.v1` (outbound managed handoff): if you need new fields, emit them as a new
  version (`v2`) contract alongside v1; never mutate v1 payload shape.
- `aerial-dispatch-adapter-callback.v1` (inbound webhook): same rule. Webhook auth is a shared secret
  in `AERIAL_DISPATCH_CALLBACK_SECRET`.
- The NodeODM direct adapter is a **separate** implementation. It doesn't replace v1 — operators can still
  run the webhook path for custom compute.

## What NOT to do

- **Do not re-introduce the 30+ copy-variant blocked-access ribbon.** Consolidated to a 4-tab
  `SupportDiagnosticsPanel`. New variants should go inside that panel, not as top-level buttons.
- **Do not re-fork pages into mega-files.** If a page grows past ~600 lines, extract server actions into
  `_actions.ts` and split render chunks into `_components/`.
- **Do not claim Phase 5 features.** TiTiler / raster delivery, Stripe billing, SSO, public engagement,
  field companion, AI QA — all deferred. Don't wire UI placeholders that pretend they exist.
- **Do not mutate v1 dispatch contracts.**
- **Do not add mocked-database integration tests.** Unit tests use mocked `fetch`; the managed state
  machine tests run against real fixtures, not an in-memory DB stub.
- **Do not bypass `web/src/lib/supabase/admin.ts`** for writes. All service-role calls go through it.

## Quickstart

```bash
cd web
npm install
cp ../.env.example .env.local    # fill in Supabase + optional NodeODM
npm run dev                       # http://localhost:3000
npm run lint
npm run test
npm run build
```

Supabase:

```bash
cd supabase
supabase db push                  # apply migrations to linked project
```

Benchmark + seed scripts:

- `scripts/run_odm_benchmark.sh` — reproducible ODM benchmark run.
- `scripts/e2e_v1_slice.sh` — end-to-end slice: seed → ingest → dispatch handoff → callback → promote.
- `scripts/seed_aerial_ops_workspace.mjs` — deterministic seed (used by Playwright + dev).

## Docs index

- `docs/ROADMAP.md` — phased plan, live status.
- `docs/ARCHITECTURE.md` — plane-separated architecture + what's real vs. deferred.
- `docs/OPERATIONS.md` — runbook (NodeODM local, cron auth, supabase migrations).
- `docs/ODM_PLUS_COMPARISON_MATRIX.md` — baseline OSS vs. Aerial Operations OS.
- `docs/SHOWCASE_PAGE_SPEC.md` — public showcase source of truth.
- `docs/SAMPLE_DATASET_BENCHMARK_PROTOCOL.md` — benchmark protocol.
- `docs/CHANGELOG.md` — changelog.
- `docs/COMPONENT_INVENTORY.md` — UI + map primitives catalog.

## When in doubt

Re-read the truthful-posture rule. If you're about to advance a stage, ship a status badge, or claim a
capability — ask yourself: *what evidence attached to the data proves this?* If none, don't ship it.
