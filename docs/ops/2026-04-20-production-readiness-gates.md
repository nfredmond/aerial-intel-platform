# Production readiness gates - 2026-04-20

This slice follows the merge of PR #58. It does not claim that production
raster delivery is live. It moves the remaining production gates into executable
repo artifacts.

## What shipped

- Controlled TiTiler service artifacts in `infra/titiler/`.
- Manual Cloud Run deployment workflow for TiTiler in
  `.github/workflows/deploy-titiler-cloud-run.yml`.
- `scripts/check_titiler_deploy_prereqs.sh` for a no-secret preflight of the
  GitHub Actions variables and secrets required by the TiTiler deploy workflow.
- `scripts/smoke_titiler.sh` for tilejson and PNG tile smoke checks.
- `scripts/deploy_titiler_cloud_run.sh` for local or workflow-backed Cloud Run
  deploys.
- `scripts/check_release_readiness.sh` for required env and production TiTiler
  guardrails.
- `scripts/provision_e2e_supabase_fixtures.mjs` for idempotent dedicated
  Supabase fixture setup for the authenticated Playwright smoke.
- `docs/RELEASE_CHECKLIST.md` for production promotion.
- `docs/ops/test-supabase-project.md` for the dedicated Supabase E2E project.
- Optional `web-auth-smoke` GitHub Actions job gated by
  `AERIAL_E2E_AUTH_SMOKE_ENABLED=1`.

## Validation

From the repository root:

- `for script in scripts/smoke_titiler.sh scripts/check_release_readiness.sh scripts/check_titiler_deploy_prereqs.sh scripts/deploy_titiler_cloud_run.sh; do bash -n "$script"; done` - pass.
- `node --check scripts/provision_e2e_supabase_fixtures.mjs` - pass.
- `node scripts/provision_e2e_supabase_fixtures.mjs --help` - pass.
- `docker compose -f infra/titiler/docker-compose.yml config` - pass.
- `NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=anon SUPABASE_SERVICE_ROLE_KEY=service AERIAL_TITILER_URL=https://titiler.example.com AERIAL_RELEASE_TARGET=production scripts/check_release_readiness.sh` - pass.
- Same readiness command with `AERIAL_TITILER_URL=https://titiler.xyz` and `AERIAL_RELEASE_TARGET=production` - fails as expected.
- `AERIAL_TITILER_URL=https://titiler.xyz scripts/smoke_titiler.sh` - pass, script validation only against public demo endpoint.

From `web/`:

- `npm ci` - pass.
- `npm run lint -- --quiet` - pass.
- `npm run test` - pass, 65 files / 414 tests.
- `npm run build` - pass.
- `npm run test:e2e` - pass, 2 public tests and 1 skipped authenticated smoke.

## Remaining external work

- Deploy the controlled TiTiler container to Nat Ford infrastructure.
- Configure `AERIAL_TITILER_URL` in Vercel Preview and production to the
  controlled service URL.
- Create the dedicated Supabase E2E project, apply migrations, and run
  `scripts/provision_e2e_supabase_fixtures.mjs` to generate the GitHub Actions
  variables and secrets listed in `docs/ops/test-supabase-project.md`.
- Enable `AERIAL_E2E_AUTH_SMOKE_ENABLED=1` only after those fixtures are stable.
