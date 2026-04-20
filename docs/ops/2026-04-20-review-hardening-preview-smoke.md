# Review hardening rollout and Preview smoke - 2026-04-20

This note records the evidence for the review-hardening fixes that followed the 2026-04-20 review pass. It is intentionally narrow: it covers the migration/application smoke and the signed-in Preview checks that prove the fixed surfaces behave correctly.

## Code gates

Run from `web/` after the hardening patches:

- `npm run lint` - pass.
- `npm run test` - pass, 60 files / 393 tests.
- `npm run build` - pass.
- `AERIAL_E2E_BASE_URL=https://aerial-intel-platform-ffxaf5jq8-natford.vercel.app AERIAL_E2E_SKIP_SERVER=1 npm run test:e2e` - pass, 2 public showcase tests and 1 skipped authenticated smoke.
- `AERIAL_E2E_AUTH_SMOKE=1 ... AERIAL_E2E_EXPECT_RASTER=1 npm run test:e2e -- authenticated-ops.spec.ts` against `https://aerial-intel-platform-ffxaf5jq8-natford.vercel.app` - pass.

## Supabase migration

Applied to linked project `bvrmnesiamadpnysqiqd`:

```bash
supabase db query --linked --workdir supabase --agent=no --file migrations/20260420000003_require_active_membership_read_policies.sql
```

Verified the member-read policies on `drone_artifact_approvals`, `drone_artifact_comments`, `drone_artifact_share_links`, `drone_datasets`, `drone_entitlements`, `drone_ingest_sessions`, `drone_invitations`, `drone_memberships`, `drone_mission_versions`, `drone_missions`, `drone_org_ai_quota`, `drone_org_events`, `drone_org_settings`, `drone_orgs`, `drone_processing_job_events`, `drone_processing_jobs`, `drone_processing_outputs`, `drone_projects`, and `drone_sites`. Each policy predicate now includes the active-membership guard.

Because the SQL was applied directly, the remote migration ledger was repaired for this new version:

```bash
supabase migration repair 20260420000003 --status applied --linked --workdir . --agent=no --yes
```

The older `20260420000002` drift already existed as remote migration `20260420035111` with the same membership-recursion fix body; this note does not change that pre-existing ledger mismatch.

RLS smoke used a transaction-scoped temporary auth user and membership. With `status = 'active'`, the test user could read tenant rows; after updating the same membership to `status = 'suspended'`, reads returned zero rows. The transaction was rolled back and a post-check confirmed zero temp smoke users and memberships.

## Preview deployment

Preview URL:

```text
https://aerial-intel-platform-ffxaf5jq8-natford.vercel.app
```

Vercel deployment:

```text
dpl_467vV1Jsb8d5rdv18NQNHwzrAHvs
```

`vercel inspect` reported the deployment as `Ready`.

## Signed-in Preview smoke

Signed in via admin-generated Supabase magic link token, direct `/auth/v1/verify`, and the app's `@supabase/ssr` cookie format. No account password was exposed or changed.

Checks:

- Active owner direct REST read: `drone_missions` returned 2 rows and `drone_processing_outputs` returned 2 rows through the anon client with the owner JWT.
- Suspended temporary user direct REST read: `drone_missions` returned 0 rows and `drone_processing_outputs` returned 0 rows through the anon client with the suspended user's JWT.
- Suspended temporary user Preview dashboard: `/dashboard` rendered the blocked-membership state rather than tenant data.
- Artifact comment resolution scoping: created two temporary comments on two different artifacts. A tampered form on artifact A using artifact B's comment id did not resolve artifact B's comment. Resolving artifact A's own comment succeeded. Temporary comments were deleted afterward.
- Copilot processing-QA citations: `/jobs/11111111-1111-4111-8111-111111111111` returned visible per-sentence citations with `[fact:*]` tokens and a kept-sentence count. The skill now defaults to `anthropic/claude-haiku-4.5` for faster, lower-cost internal diagnostics, while mission briefs keep the higher-quality default model.
- Raster delivery: artifact `6c413396-7475-4010-a1fe-b90cbc22977a` rendered the raster viewer and loaded at least one `200` TiTiler tile.
- Browser console during owner smoke: no unfiltered app warnings/errors captured. The E2E filter ignores expected MapLibre/WebGL driver noise and TiTiler out-of-footprint tile 404s.

Cleanup checks after the browser smoke:

- `auth.users where email like 'codex-suspended-%@natfordplanning.test'` - 0 rows.
- `drone_artifact_comments where body like 'codex smoke %'` - 0 rows.

## Raster bounds status

The COG bounds path is now verified on Preview deployment:

```text
https://aerial-intel-platform-ffxaf5jq8-natford.vercel.app
```

For this Preview branch, `AERIAL_TITILER_URL=https://titiler.xyz` is saved as a Vercel Preview environment variable scoped to `codex/review-hardening-preview-smoke`. The Toledo COG artifact page for `6c413396-7475-4010-a1fe-b90cbc22977a` rendered the raster viewer, loaded at least one `200` TiTiler tile, and did not render the "Viewer not configured" fallback.

The follow-up Preview also adds a 45-second AI SDK timeout to copilot generations so server actions return controlled error states before a platform timeout can crash the client. The authenticated smoke initially exposed this gap when a slow processing-QA call exceeded the browser test timeout.

The first Preview attempt exposed a real correctness bug: `/cog/info` returned native EPSG:32617 meter bounds for the Toledo COG, and MapLibre expects WGS84 longitude/latitude bounds. The app now fetches `.../cog/WebMercatorQuad/tilejson.json` and passes its WGS84 `bounds` to `RasterViewer`.

Notes:

- `https://titiler.xyz` is acceptable for Preview smoke evidence, but it is a public demo endpoint. Do not treat it as the production raster plane.
- TiTiler may return some 404s for tile requests outside the small COG footprint while still returning valid in-footprint tiles. The authenticated E2E smoke asserts at least one `200` TiTiler tile instead of treating every out-of-footprint 404 as failure.

## Next steps

1. Stand up a Nat Ford controlled TiTiler service outside localhost, for example Fly.io, Cloud Run, ECS, or the chosen production topology.
2. Promote the authenticated smoke from a live-dev fixture to a dedicated test Supabase project.
3. Keep `https://titiler.xyz` only as temporary Preview evidence until the controlled raster plane exists.
