# Production readiness gates - 2026-04-20

This slice follows the merge of PR #58. It does not claim that production
raster delivery is live. It moves the remaining production gates into executable
repo artifacts.

## What shipped

- Controlled TiTiler service artifacts in `infra/titiler/`.
- `scripts/smoke_titiler.sh` for tilejson and PNG tile smoke checks.
- `scripts/check_release_readiness.sh` for required env and production TiTiler
  guardrails.
- `docs/RELEASE_CHECKLIST.md` for production promotion.
- `docs/ops/test-supabase-project.md` for the dedicated Supabase E2E project.
- Optional `web-auth-smoke` GitHub Actions job gated by
  `AERIAL_E2E_AUTH_SMOKE_ENABLED=1`.

## Validation

From the repository root:

- `bash -n scripts/smoke_titiler.sh scripts/check_release_readiness.sh` - pass.
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
- Create the dedicated Supabase E2E project and set GitHub Actions variables
  and secrets from `docs/ops/test-supabase-project.md`.
- Enable `AERIAL_E2E_AUTH_SMOKE_ENABLED=1` only after those fixtures are stable.
