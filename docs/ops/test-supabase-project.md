# Dedicated Supabase E2E project

The authenticated Playwright smoke should run against a dedicated test Supabase
project, not the shared dev project and not production.

## Project requirements

- Separate Supabase project, for example `aerial-ops-e2e`.
- All migrations in `supabase/migrations` applied.
- Seeded Nat Ford test org, owner membership, active entitlement, two ready
  artifacts, and the synthetic failed job.
- Storage bucket/object fixtures for the raster artifact if
  `AERIAL_E2E_EXPECT_RASTER=1`.
- Copilot enabled only if the target Preview has AI Gateway credentials.

## Bootstrap checklist

1. Create the project in Supabase.
2. Link the local Supabase CLI to that project.
3. Apply migrations:

   ```bash
   supabase db push --workdir supabase
   ```

4. Apply seed data:

   ```bash
   SUPABASE_URL=https://PROJECT_REF.supabase.co \
   SUPABASE_SERVICE_ROLE_KEY=... \
     node scripts/seed_aerial_ops_workspace.mjs --org-slug nat-ford-drone-lab

   supabase db query --linked --workdir supabase \
     --file seed/2026-04-19-synthetic-failed-job.sql
   ```

5. Create or confirm the owner auth user:

   ```text
   test.drone.owner@natfordplanning.test
   ```

6. Confirm these fixture ids and store them as repository variables:

   - `AERIAL_E2E_BASE_URL`
   - `AERIAL_E2E_OWNER_EMAIL`
   - `AERIAL_E2E_OWNER_USER_ID`
   - `AERIAL_E2E_ORG_ID`
   - `AERIAL_E2E_RASTER_ARTIFACT_ID`
   - `AERIAL_E2E_SECOND_ARTIFACT_ID`
   - `AERIAL_E2E_SYNTHETIC_JOB_ID`
   - `AERIAL_E2E_EXPECT_RASTER`

7. Store these as repository secrets:

   - `AERIAL_E2E_SUPABASE_URL`
   - `AERIAL_E2E_SUPABASE_ANON_KEY`
   - `AERIAL_E2E_SUPABASE_SERVICE_ROLE_KEY`

8. Set repository variable `AERIAL_E2E_AUTH_SMOKE_ENABLED=1` only after the
   test project and Preview URL are stable.

## CI behavior

The `web-auth-smoke` GitHub Actions job is gated behind:

```text
github.event_name == 'push'
github.ref == 'refs/heads/main'
vars.AERIAL_E2E_AUTH_SMOKE_ENABLED == '1'
```

This keeps PR CI fast and prevents accidental live-dev/prod fixture use. If the
variable is unset, the authenticated smoke does not run.
