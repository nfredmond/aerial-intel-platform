# Phase 3 Live-Stub Bootstrap Checklist

Date: 2026-04-24

This checklist keeps the Phase 3 / live-stub round-trip unblocked without
guessing credentials or weakening the TiTiler Cloud Run setup posture.

## Current local posture

- Active repo: `/home/narford/.openclaw/workspace/aerial-intel-platform`
- Branch: `main`, aligned with `origin/main` before this slice.
- `web/.env.local` exists locally, but the safe key-only check showed no
  `CRON_SECRET` entry and no explicit `AERIAL_NODEODM_MODE=stub`.
- `gcloud` was missing at the start of this slice, then installed locally from
  Google's official Linux x86_64 archive as Google Cloud CLI `565.0.0`.
- The archive checksum was verified before extraction:
  `f52ac03660684aed058898beb03506dc9387e299501b3ecba05309f0b4fb48ea`.
- `gcloud` is now on the default shell `PATH`, but no active authenticated
  account is configured.
- No GCP writes were run during this check or install.

## Gcloud setup posture

Use the local installer only if `gcloud` is missing or needs a clean reinstall:

```bash
scripts/install_gcloud_cli_verified.sh \
  --sha256 <official-sha256-for-the-selected-linux-archive> \
  --yes
```

Rules:

- The checksum must be copied from Google's current official Google Cloud CLI
  install/download page for the exact archive URL being installed:
  <https://cloud.google.com/sdk/docs/install>
- The helper refuses to run without a 64-character SHA256 and restricts the
  download URL to Google's official Linux rapid-channel archives.
- The helper installs under `~/.local/share/google-cloud-sdk` by default.
- The helper does not run `gcloud init`, `gcloud auth login`, `gcloud config
  set project`, or any GCP write.
- After install, add the SDK to the current shell if a fresh shell does not
  already find it:

```bash
export PATH="$HOME/.local/share/google-cloud-sdk/bin:$PATH"
gcloud --version
```

Only then authenticate intentionally in a local terminal:

```bash
gcloud auth login
gcloud config set project <nat-ford-gcp-project-id>
```

## TiTiler Cloud Run bootstrap

Once `gcloud` and `gh` are both authenticated locally, run the existing
interactive bootstrap helper:

```bash
scripts/bootstrap_titiler_gcp_wif.sh --repo nfredmond/aerial-intel-platform
```

This helper performs real GCP and GitHub writes, so it keeps an interactive
confirmation gate and prompts for the real Nat Ford project/region/repository,
Cloud Run service, and exact HTTPS CORS origins. It does not accept secrets as
command-line flags.

Then dispatch the controlled workflow:

```bash
scripts/run_titiler_cloud_run_workflow.sh --repo nfredmond/aerial-intel-platform
```

After the controlled endpoint exists:

```bash
AERIAL_TITILER_URL=https://<controlled-titiler-service> scripts/smoke_titiler.sh
scripts/configure_vercel_titiler_url.sh https://<controlled-titiler-service> --scope natford --environment production
```

## Phase 3 live-stub env checklist

For local live-stub round-trip work, `web/.env.local` must contain:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
CRON_SECRET=<long-local-secret>
AERIAL_NODEODM_MODE=stub
```

Do not set `AERIAL_NODEODM_MODE=stub` in production.

Check the local posture without printing secrets:

```bash
node scripts/check_phase3_live_stub_bootstrap.mjs
```

Expected failure mode today: missing `CRON_SECRET` and missing or non-stub
`AERIAL_NODEODM_MODE`. Once those are present, the next round-trip step is:

1. Start the app from `web/` with `npm run dev`.
2. Sign in with the seeded Supabase test user.
3. Create or select a mission with an ingest session and extracted dataset.
4. Launch a NodeODM-direct job in stub mode.
5. Run `GET /api/internal/nodeodm-upload` with `Authorization: Bearer
   <CRON_SECRET>`.
6. Advance the stub task to completed through
   `/api/internal/dev/nodeodm-stub-advance`.
7. Run `GET /api/internal/nodeodm-poll` with the same bearer token.
8. Confirm the job reaches `succeeded`, emits `nodeodm.task.imported`, and the
   output summary includes the synthetic orthophoto, DEM, point cloud, and mesh.

## Deterministic coverage

- `node scripts/check_phase3_live_stub_bootstrap.mjs --example` verifies the
  example env file still advertises the names needed for a live-stub bootstrap.
- `node scripts/check_titiler_ops_pipeline.mjs` verifies the gcloud installer,
  TiTiler setup doc, and release checklist keep the checksum-gated setup
  posture wired into the repo.
