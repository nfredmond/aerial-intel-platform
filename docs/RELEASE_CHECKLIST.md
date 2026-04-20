# Release checklist

Use this checklist before promoting Aerial Operations OS to production.

## Database

- All migrations in `supabase/migrations` are applied to the target project.
- `supabase migration list --linked --workdir supabase` has no unexpected drift.
- RLS smoke confirms active members can read tenant rows and suspended members cannot.
- Seed/demo rows are not required for production operation.

## Environment

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CRON_SECRET`
- `AERIAL_TITILER_URL`
- `AERIAL_COPILOT_ENABLED`
- `AERIAL_COPILOT_DEFAULT_CAP_TENTH_CENTS`
- `AI_GATEWAY_API_KEY` or Vercel OIDC when copilot is enabled

Run:

```bash
AERIAL_RELEASE_TARGET=production scripts/check_release_readiness.sh
```

Production must not use `https://titiler.xyz` or any localhost TiTiler URL.

## Raster

- Controlled TiTiler service is deployed outside localhost.
- `scripts/smoke_titiler.sh` passes against the controlled service URL.
- Vercel production `AERIAL_TITILER_URL` points at the controlled service.
- A signed-in artifact page loads at least one `200` TiTiler tile.

## Authenticated smoke

- Dedicated test Supabase project exists.
- GitHub Actions variables/secrets from `docs/ops/test-supabase-project.md` are set.
- `web-auth-smoke` is enabled only after fixtures are stable.
- Latest authenticated smoke passed against the production candidate URL.

## Copilot

- Org-level copilot enablement is intentional.
- Monthly cap is set for the org.
- `/admin/copilot` shows quota, recent events, and CSV export.
- Generated text still renders per-sentence `[fact:*]` citations.

## Rollback

- Last known-good Vercel deployment URL is recorded.
- Supabase migration rollback plan is documented for any new migration.
- TiTiler previous service revision is available or the CDN origin can be
  pointed back to the last known-good service.
