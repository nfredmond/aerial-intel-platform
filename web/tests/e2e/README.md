# Aerial Intel — end-to-end tests

Playwright-backed E2E tests for the web app.

## What's wired now

- `showcase.spec.ts` — hits the public `/` and `/sign-in` routes. No Supabase
  dependency; safe to run on any build.
- `authenticated-ops.spec.ts` — opt-in signed-in smoke for the current
  DroneOps operating slice. It verifies active vs suspended RLS, artifact
  comment scoping, copilot citations, artifact report summaries, admin support docs, and optionally TiTiler raster tiles.
  It creates temporary smoke users/comments and removes them in `finally`.

## What's NOT wired yet

The full smoke flow from `docs/TEST_STRATEGY.md` (sign-in → create mission →
attach geometry → record v1 ingest → create managed job → record dispatch
handoff → import a fixture output → confirm artifact) requires:

1. A dedicated test Supabase project with the current migrations applied.
2. A seeded test user with an active DroneOps entitlement.
3. Env vars pointing Playwright + the Next.js server at that project.

Provision the dedicated-project fixtures with:

```bash
SUPABASE_URL=https://PROJECT_REF.supabase.co \
SUPABASE_ANON_KEY=... \
SUPABASE_SERVICE_ROLE_KEY=... \
  node scripts/provision_e2e_supabase_fixtures.mjs
```

The script prints the exact `AERIAL_E2E_*` values consumed below. Add
`AERIAL_E2E_EXPECT_RASTER=1` and `AERIAL_E2E_RASTER_FIXTURE_PATH=/absolute/path/to/fixture.cog.tif`
when the target deployment should validate TiTiler tile delivery.

The authenticated smoke is present but skipped unless explicitly enabled:

```bash
AERIAL_E2E_AUTH_SMOKE=1 \
AERIAL_E2E_BASE_URL=https://aerial-preview.example.com \
AERIAL_E2E_SKIP_SERVER=1 \
NEXT_PUBLIC_SUPABASE_URL=... \
NEXT_PUBLIC_SUPABASE_ANON_KEY=... \
SUPABASE_SERVICE_ROLE_KEY=... \
AERIAL_E2E_OWNER_EMAIL=test.drone.owner@natfordplanning.test \
AERIAL_E2E_OWNER_USER_ID=... \
AERIAL_E2E_ORG_ID=... \
AERIAL_E2E_RASTER_ARTIFACT_ID=... \
AERIAL_E2E_SECOND_ARTIFACT_ID=... \
AERIAL_E2E_SYNTHETIC_JOB_ID=... \
AERIAL_E2E_EXPECT_RASTER=1 \
AERIAL_E2E_CONFIRMED_DEDICATED_PROJECT=1 \
  npm run test:e2e -- authenticated-ops.spec.ts
```

Only set `AERIAL_E2E_EXPECT_RASTER=1` when the target deployment has an
externally reachable `AERIAL_TITILER_URL`. Only set
`AERIAL_E2E_CONFIRMED_DEDICATED_PROJECT=1` after confirming the Supabase
credentials point at a dedicated test project; the smoke creates temporary
users/comments through the service-role key.

## Local usage

```bash
cd web
npm install
npx playwright install --with-deps chromium   # first time only
npm run test:e2e
```

By default Playwright boots `npm run dev` on `http://127.0.0.1:3000`. To run
against an already-running server (e.g. a Vercel preview URL), set:

```bash
AERIAL_E2E_BASE_URL=https://aerial-preview.example.com \
AERIAL_E2E_SKIP_SERVER=1 \
  npm run test:e2e
```

## CI posture

Per the plan, unauthenticated public E2E runs on non-PR `main` pushes only —
PR CI stays fast with lint + vitest + build.

The authenticated operational smoke is wired as a separate `web-auth-smoke`
job and remains disabled unless the repository variable
`AERIAL_E2E_AUTH_SMOKE_ENABLED=1` is set. Configure the dedicated Supabase
project variables and secrets in `docs/ops/test-supabase-project.md`, then run
`node scripts/check_auth_smoke_prereqs.mjs`, before enabling it.
