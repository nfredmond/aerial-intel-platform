# Phase 3 Live-Stub Bootstrap Checklist

Date: 2026-04-24

This checklist keeps the Phase 3 / live-stub round-trip unblocked without
guessing credentials or weakening the TiTiler Cloud Run setup posture.

## Current local posture

- Active repo: `/home/narford/.openclaw/workspace/aerial-intel-platform`
- Branch: `main`, aligned with `origin/main` before this slice.
- `web/.env.local` exists locally. As of the 2026-04-27 catch-up slice, the
  safe key-only check shows local-only `AERIAL_NODEODM_MODE=stub` is present,
  and `CRON_SECRET` remains missing. No secret values were printed.
- `gcloud` was missing at the start of this slice, then installed locally from
  Google's official Linux x86_64 archive as Google Cloud CLI `565.0.0`.
- The archive checksum was verified before extraction:
  `f52ac03660684aed058898beb03506dc9387e299501b3ecba05309f0b4fb48ea`.
- `gcloud` is now on the default shell `PATH`, but no active authenticated
  account is configured.
- No GCP writes were run during this check or install.
- The local bootstrap helper prints only redacted key presence/length status and
  warnings; it does not write `web/.env.local` or generate local secrets.

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

For a non-default local env file, use `--env-path <path>`. The older
`--env-file` spelling is still accepted when passed through with `node --`, but
Node 24+ also has a native `--env-file` option and can intercept that argument.

Expected failure mode after the 2026-04-27 catch-up slice: missing
`CRON_SECRET` only. If the Supabase-looking values are unusually short, the
helper also warns the operator to verify they are real local keys before trying
the loop.

Delegated-agent boundary: `AERIAL_NODEODM_MODE=stub` is a non-secret local env
setting, but `CRON_SECRET` is a secret-bearing control. Automation should not
invent, append, or store `CRON_SECRET` during a delegated proof run unless an
approved local secret location or existing value is already available. Before a
human appends either local-only line, check for an existing entry without
printing values:

```bash
grep -nE '^(CRON_SECRET|AERIAL_NODEODM_MODE)=' web/.env.local | cut -d= -f1
```

Edit any existing line instead of adding a duplicate. The checker prints the
human/operator-only secret setup command shape for local use without ever
printing or reading the generated value, and it now fails if live-stub-critical
env names are defined more than once.

Once the local check passes, print the redacted operator-loop plan:

```bash
node scripts/check_phase3_live_stub_bootstrap.mjs --print-operator-loop
```

That command prints browser steps and curl commands with `$CRON_SECRET` and
`$TASK_UUID` placeholders only; it does not execute requests.

To produce a no-secret dry-run artifact that says exactly what remains before a
Phase 3 live-stub proof, including the current redacted preflight status, run:

```bash
node scripts/check_phase3_live_stub_bootstrap.mjs \
  --print-dry-run-artifact \
  > /tmp/aerial-phase-3-live-stub-dry-run.md || true
```

The dry-run artifact may exit 1 when local env is still incomplete. That is
intentional: it keeps readiness truthful while still leaving the operator with a
redacted checklist of remaining local env work, browser setup, endpoint calls,
expected JSON fields, event evidence, and out-of-scope items. It does not run
the app, call internal routes, create secrets, touch GCP, dispatch GitHub
Actions, write Vercel env, or modify `web/.env.local`.

To produce a fill-in proof note for the operator-assisted run, include the
evidence-template flag and redirect to a local scratch file or a new dated ops
note:

```bash
node scripts/check_phase3_live_stub_bootstrap.mjs \
  --print-operator-loop \
  --print-evidence-template \
  > /tmp/aerial-phase-3-live-stub-proof.md
```

The generated template repeats the no-secret rule and asks for only status
codes, UUIDs, event types, output counts, and visible UI outcomes. Do not paste
`CRON_SECRET`, Supabase keys, cookies, bearer tokens, or magic-link tokens into
the proof note.

The first round-trip step is:

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

The dev-only stub advance route now also requires the internal-route auth
pattern. In local live-stub mode, use the same bearer token as upload and poll:

```bash
export TASK_UUID="<output_summary.nodeodm.taskUuid>"
curl -fsS -X POST \
  -H "Authorization: Bearer $CRON_SECRET" \
  "http://localhost:3000/api/internal/dev/nodeodm-stub-advance?taskUuid=$TASK_UUID&to=completed"
```

## Deterministic coverage

- `node scripts/check_phase3_live_stub_bootstrap.mjs --example` verifies the
  example env file still advertises the names needed for a live-stub bootstrap.
- `node --test scripts/check_phase3_live_stub_bootstrap.test.mjs` verifies
  redacted output, missing-env failures, production stub rejection, the
  operator-loop command plan, the dry-run artifact, and the proof-note template
  guardrails.
- `node scripts/check_titiler_ops_pipeline.mjs` verifies the gcloud installer,
  TiTiler setup doc, and release checklist keep the checksum-gated setup
  posture wired into the repo.
