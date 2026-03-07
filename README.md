# Nat Ford Aerial Intelligence Platform (ODM+)

Project slug: 
default branch: main

See project charter and docs folder for current scope and architecture.

## Current Implementation Tracks

- ODM benchmark harness (`scripts/run_odm_benchmark.sh`)
- Auth delivery readiness plan (`docs/AUTH_DELIVERY_READINESS_2026-03-03.md`)
- Supabase auth/entitlement schema scaffold (`supabase/migrations/202603040001_droneops_auth_foundation.sql`)
- DroneOps auth MVP web app (`web/`)

## Quickstart (Benchmark Script)

Run ODM against a dataset folder that contains an `images/` directory:

```bash
./scripts/run_odm_benchmark.sh <dataset_root> <project_name>
```

Example:

```bash
./scripts/run_odm_benchmark.sh ./sample-datasets/site-a site-a-baseline
```

Artifacts are written to:

- `benchmark/<timestamp>/run.log`
- `benchmark/<timestamp>/summary.json`

`summary.json` now includes output presence checks in `outputs` for:

- `orthophoto` (`odm_orthophoto/odm_orthophoto.tif`)
- `dem` (prefers `odm_dem/dsm.tif`, falls back to `odm_dem/dtm.tif`)
- `point_cloud` (prefers `odm_georeferencing/odm_georeferenced_model.laz`, falls back to `.ply`)
- `mesh` (`odm_texturing/odm_textured_model.obj`)

Each output entry includes:

- `path`
- `exists`
- `non_zero_size`
- `size_bytes`

`summary.json` also includes a `qa_gate` section with:

- `required_outputs_present` (orthophoto + dem + point cloud)
- `minimum_pass` (run status is `success` and required outputs are present)
- `missing_required_outputs` (array)

Optional overrides:

- `ODM_IMAGE` (default: `opendronemap/odm:latest`)
- `ODM_ARGS` (default: `--project-path /datasets <project_name>`)

Example override:

```bash
ODM_IMAGE=opendronemap/odm:3.5.5 ODM_ARGS="--project-path /datasets site-a-baseline --orthophoto-resolution 2" ./scripts/run_odm_benchmark.sh ./sample-datasets/site-a site-a-baseline
```

## DroneOps Auth MVP (web)

Minimal Next.js app with:

- `/sign-in` email/password auth via Supabase
- `/dashboard` protected route
- role + entitlement gate (`drone_memberships` + active `drone_entitlements` where `product_id='drone-ops'`)
- blocked state with support contact + prefilled support diagnostics (user ID, organization ID/slug/name, role, membership, entitlement), a generated support reference + UTC snapshot timestamp, support email subjects prefilled with that reference, an "Open in Gmail" quick action, one-click copy actions for the signed-in user ID, signed-in account email, organization ID, organization slug, support email address, support email link, support reference, support snapshot timestamp, support triage summary, blocked-access reason, operator handoff checklist, support email subject, support email body, support context, support context JSON, and full support email draft text, and ready-to-copy manual fallback text boxes when clipboard access is unavailable

### Local setup

1) Ensure the auth schema migration has been applied:

```bash
supabase db push
```

2) Install and run the web app:

```bash
cd web
npm install
npm run dev
```

3) Build check:

```bash
cd web
npm run build
```

### Required web environment variables

Set these in `web/.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
```

## Buyer provisioning script

Use this script to create/find a buyer auth user, create/find org, and upsert membership + active entitlement:

```bash
SUPABASE_URL=https://<project-ref>.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=<service-role-key> \
node scripts/provision_droneops_buyer.mjs \
  --email buyer@example.com \
  --password 'TempStrongPass!123' \
  --org-name 'Acme Drone Co' \
  --org-slug acme-drone-co \
  --role owner \
  --tier pro
```

Notes:

- `--role` defaults to `owner`
- `--tier` defaults to `starter`
- If the user already exists, the script reuses that account and leaves password unchanged
