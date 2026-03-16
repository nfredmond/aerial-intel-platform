# Aerial Operations OS — Supabase Bootstrap and Seed

_Date: 2026-03-15_

## What was completed

1. Created a dedicated Supabase project for `aerial-intel-platform` under the Nat Ford org.
2. Added a new MCP endpoint for the project (`supabase-aerial`) in the local mcporter config.
3. Applied the following database migrations through **Supabase MCP**:
   - `202603040001_droneops_auth_foundation`
   - `202603150001_aerial_ops_core_foundation`
   - `202603150101_fix_drone_function_search_path`
4. Seeded one real test org/user/workspace path:
   - org
   - membership
   - entitlement
   - project
   - site
   - mission
   - mission version
   - dataset
   - processing job
   - processing outputs
   - processing job events
5. Added local app env wiring via ignored `web/.env.local` so the app can point at the new project during local runs.

## Verification

### MCP verification
- `list_migrations` shows all three migrations applied.
- `list_tables` shows all drone tables present.
- Row counts confirm seeded workspace state exists.

### Local app verification
- `npm run test` ✅
- `npm run lint` ✅
- `npm run build` ✅

## Security / advisor notes

Supabase security advisor warnings were reduced by hardening function `search_path` in the trigger helpers.

Remaining warnings are currently expected / known:
- `public.spatial_ref_sys` flagged for RLS-disabled because PostGIS installs this public reference table.
- `postgis` extension installed in `public` schema (default posture in this project bootstrap).
- leaked-password protection is still disabled in Supabase Auth and should be reviewed during auth hardening.

## Practical result

The `/missions` route can now load from a **real Supabase-backed workspace** instead of only using the fallback demo snapshot, as soon as the seeded test user signs in.

## Recommended next steps

1. Add a small authenticated smoke-test runbook for the seeded test user.
2. Build mission/project detail pages off the newly live schema.
3. Add write mutations for planner updates, dataset ingest state, and job/event transitions.
4. Decide whether to keep PostGIS in `public` for this project or move extension objects into a dedicated extension schema later.
