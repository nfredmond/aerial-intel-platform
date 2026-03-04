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

Run preflight first, then execute ODM benchmark:

```bash
./scripts/run_odm_benchmark.sh --preflight-only <dataset_root> [benchmark_label]
./scripts/run_odm_benchmark.sh <dataset_root> [benchmark_label]
```

Expected dataset layout:

```text
<dataset_root>/
  images/
    IMG_0001.JPG
    IMG_0002.JPG
    ...
```

Example:

```bash
./scripts/run_odm_benchmark.sh --preflight-only ./sample-datasets/site-a site-a-baseline
./scripts/run_odm_benchmark.sh ./sample-datasets/site-a site-a-baseline
```

Artifacts are written to:

- `benchmark/<timestamp>-<label>/preflight.txt`
- `benchmark/<timestamp>-<label>/run.log`
- `benchmark/<timestamp>-<label>/output_inventory.tsv`
- `benchmark/<timestamp>-<label>/summary.json`

Optional environment overrides:

- `ODM_IMAGE` (default: `opendronemap/odm:3.5.5`)
- `ODM_PROJECT_NAME` (default: basename of `dataset_root`)
- `ODM_EXTRA_ARGS` (appended in deterministic mode)
- `ODM_ARGS` (full override, advanced/legacy)
- `MIN_FREE_GB` (default: `40`)

Example override:

```bash
ODM_EXTRA_ARGS="--orthophoto-resolution 2 --dem-resolution 5" \
  ./scripts/run_odm_benchmark.sh ./sample-datasets/site-a site-a-tuned
```

## DroneOps Auth MVP (web)

Minimal Next.js app with:

- `/sign-in` email/password auth via Supabase
- `/dashboard` protected route
- role + entitlement gate (`drone_memberships` + active `drone_entitlements` where `product_id='drone-ops'`)
- blocked state with support contact when user is signed in but not entitled

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
