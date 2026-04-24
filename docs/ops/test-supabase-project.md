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

4. Provision the deterministic authenticated-smoke fixtures:

   ```bash
   SUPABASE_URL=https://PROJECT_REF.supabase.co \
   SUPABASE_ANON_KEY=... \
   SUPABASE_SERVICE_ROLE_KEY=... \
     node scripts/provision_e2e_supabase_fixtures.mjs
   ```

   The script is idempotent. It creates or reuses the owner auth user, upserts
   `Nat Ford Drone Lab`, writes an active owner membership and entitlement,
   enables org copilot settings by default, creates two ready artifacts, and
   refreshes the synthetic failed job used by the processing-QA smoke.

   To upload a real COG fixture for raster tile checks, add:

   ```bash
   SUPABASE_URL=https://PROJECT_REF.supabase.co \
   SUPABASE_ANON_KEY=... \
   SUPABASE_SERVICE_ROLE_KEY=... \
   AERIAL_E2E_EXPECT_RASTER=1 \
   AERIAL_E2E_RASTER_FIXTURE_PATH=/absolute/path/to/fixture.cog.tif \
     node scripts/provision_e2e_supabase_fixtures.mjs
   ```

   If no COG is uploaded, keep `AERIAL_E2E_EXPECT_RASTER=0`. The smoke still
   validates signed-in access, suspended-user RLS, artifact comment scoping,
   copilot citations, support docs, and audit export.

5. Store the script output as repository variables:

   - `AERIAL_E2E_BASE_URL`
   - `AERIAL_E2E_OWNER_EMAIL`
   - `AERIAL_E2E_OWNER_USER_ID`
   - `AERIAL_E2E_ORG_ID`
   - `AERIAL_E2E_RASTER_ARTIFACT_ID`
   - `AERIAL_E2E_SECOND_ARTIFACT_ID`
   - `AERIAL_E2E_SYNTHETIC_JOB_ID`
   - `AERIAL_E2E_EXPECT_RASTER`
   - `AERIAL_E2E_CONFIRMED_DEDICATED_PROJECT` (`1` only after confirming the
     secrets below point at the dedicated test project)

6. Store these as repository secrets:

   - `AERIAL_E2E_SUPABASE_URL`
   - `AERIAL_E2E_SUPABASE_ANON_KEY`
   - `AERIAL_E2E_SUPABASE_SERVICE_ROLE_KEY`

7. Run the prereq check locally:

   ```bash
   node scripts/check_auth_smoke_prereqs.mjs
   ```

8. Set repository variable `AERIAL_E2E_AUTH_SMOKE_ENABLED=1` only after the
   test project and Preview URL are stable.

## Script outputs

`scripts/provision_e2e_supabase_fixtures.mjs` prints the fixture IDs plus
`gh variable set` / `gh secret set` commands. It does not print the service-role
key value.

Default fixture IDs that are intentionally stable across runs:

- Raster artifact: `22222222-2222-4222-8222-222222222222`
- Cross-artifact comment fixture: `33333333-3333-4333-8333-333333333333`
- Successful source job: `44444444-4444-4444-8444-444444444444`
- Synthetic failed job: `11111111-1111-4111-8111-111111111111`

The owner email defaults to `test.drone.owner@natfordplanning.test`. Override it
with `AERIAL_E2E_OWNER_EMAIL` before provisioning if the test project needs a
different mailbox identity.

## CI behavior

The `web-auth-smoke` GitHub Actions job is gated behind:

```text
github.event_name == 'push'
github.ref == 'refs/heads/main'
vars.AERIAL_E2E_AUTH_SMOKE_ENABLED == '1'
```

This keeps PR CI fast and prevents accidental live-dev/prod fixture use. If the
variable is unset, the authenticated smoke does not run. When enabled, CI runs
`scripts/check_auth_smoke_prereqs.mjs` before installing dependencies so a
production alias or missing dedicated-project confirmation fails before any
service-role fixture writes.
