# TiTiler setup (W1-B raster viewer)

TiTiler is the COG-tile server behind the artifact-detail raster preview. The
Next.js app builds `.../cog/tiles/WebMercatorQuad/{z}/{x}/{y}.png?url=<signed>`
URLs and reads `.../cog/WebMercatorQuad/tilejson.json?url=<signed>` for WGS84
bounds; TiTiler pulls the COG from Supabase Storage (via a signed URL) and
responds with PNG tiles. The app itself does not need to proxy anything.

## Environment

The app reads two env vars:

```
AERIAL_TITILER_URL=http://localhost:8000
# Optional — only when TiTiler cannot reach the app's storage origin directly:
AERIAL_TITILER_STORAGE_URL=http://172.17.0.1:55321
```

`AERIAL_TITILER_URL` is the browser- and server-facing TiTiler base URL. Set it
for local dev (via `.env.local`) and for the deployment. The raster preview is
automatically suppressed when it is unset — users see a "viewer not configured"
card instead of a broken embed.

`AERIAL_TITILER_STORAGE_URL` is optional and rewrites the *origin* of the signed
COG URL handed to TiTiler (path + signing token preserved). Leave it unset for
hosted Supabase, where TiTiler reaches the signed `supabase.co` URL directly.
Set it when TiTiler runs in a container that cannot reach the app's storage
origin — see the reachability section below.

## Run TiTiler locally (Docker)

On this dev host the OpenGeo stack already runs a TiTiler 2.0.1 container at
`opengeo-titiler` exposing port 8000. You can reuse it as-is; the client's URL
builders target `/cog/tiles/{tileMatrixSetId}/{z}/{x}/{y}.{format}` and
`/cog/info`, both of which are in the 2.x surface.

For a scratch instance on a fresh host:

```bash
docker run --rm -p 8000:8000 \
  -e PORT=8000 \
  -e CORS_ORIGINS='http://localhost:3000,http://localhost:3001' \
  -e MOSAIC_ENDPOINT_ENABLED=FALSE \
  ghcr.io/developmentseed/titiler:latest
```

Smoke-check against the upstream sample COG:

```
curl -fsSo /tmp/tile.png -w 'http=%{http_code} type=%{content_type}\n' \
  'http://localhost:8000/cog/tiles/WebMercatorQuad/2/1/1.png?url=https%3A%2F%2Fraw.githubusercontent.com%2Fcogeotiff%2Frio-tiler%2Fmaster%2Ftests%2Ffixtures%2Fcog.tif'
file /tmp/tile.png   # expect: PNG image data, 256 x 256
```

`CORS_ORIGINS='*'` is safe for dev only. In production, restrict it to the
deployed app origin.

## Supabase Storage reachability

TiTiler fetches the COG bytes over HTTP from the URL passed via `?url=`. The
Next.js server hands the browser a Supabase signed URL (6 h TTL). For
TiTiler-inside-a-container to resolve that URL, the Supabase Storage endpoint
must be reachable from *inside* the container:

- **Hosted Supabase (prod / staging):** works by default — the signed URL is an
  HTTPS `supabase.co` URL, TiTiler fetches it like any other upstream. Leave
  `AERIAL_TITILER_STORAGE_URL` unset.
- **Local / self-hosted Supabase:** the signed URL points at the app's storage
  origin (on the self-host, `http://127.0.0.1:55321`). A container on the default
  bridge network cannot reach `127.0.0.1`/`localhost` on the host — GDAL's
  `/vsicurl` fails with `CURL error: Failed to connect to 127.0.0.1 ...` and the
  tile/info request 500s. Fix it by setting `AERIAL_TITILER_STORAGE_URL` to an
  origin the TiTiler container *can* reach:
  - Default bridge network: the host is the bridge gateway, `172.17.0.1`, so use
    `AERIAL_TITILER_STORAGE_URL=http://172.17.0.1:55321`
    (confirm with `docker network inspect bridge --format '{{range .IPAM.Config}}{{.Gateway}}{{end}}'`).
  - Or run the container with `--add-host=host.docker.internal:host-gateway` and
    set `AERIAL_TITILER_STORAGE_URL=http://host.docker.internal:55321`.

  The app rewrites only the origin of the copy handed to TiTiler; the
  browser-facing signed URL (used for direct downloads) still points at the app's
  storage origin. `--network host` also works but is coarser and changes port
  publishing. This var is server-only, so a restart picks it up — no rebuild.

## Running beside NodeODM

Use a shared compose file so both services come up on the same dev host family,
matching the Wave 1 plan. Minimal snippet:

```yaml
services:
  nodeodm:
    image: opendronemap/nodeodm:latest
    ports:
      - "3000:3000"
    volumes:
      - ./nodeodm-data:/var/www/data

  titiler:
    image: ghcr.io/developmentseed/titiler:latest
    command: uvicorn titiler.application.main:app --host 0.0.0.0 --port 80
    ports:
      - "8090:80"
    environment:
      PORT: "80"
      CORS_ORIGINS: "http://localhost:3000,http://localhost:3001"
      MOSAIC_ENDPOINT_ENABLED: "FALSE"
```

## Controlled service artifacts

The deployable service shape now lives in `infra/titiler/`:

- `Dockerfile` wraps the official TiTiler image with the expected port and
  disabled mosaic endpoint.
- `docker-compose.yml` runs the same shape locally.
- `cloud-run.service.yaml.example` captures the Cloud Run container settings,
  resource floor, and CORS envs to fill for a Nat Ford deployment.
- `scripts/check_titiler_deploy_prereqs.sh` checks the GitHub Actions variable
  and secret names required by the controlled Cloud Run deployment. It also
  validates non-secret variable values such as GCP ids and exact HTTPS CORS
  origins. It does not inspect or print secret values.
- `scripts/bootstrap_titiler_gcp_wif.sh` prompts locally for the Nat Ford GCP
  project values, creates/reuses the Artifact Registry repository, deployer
  service account, Workload Identity Federation pool/provider, and deploy IAM
  bindings, then writes the required GitHub Actions variables and
  secret-designated values without putting them in chat or command-line
  arguments.
- `scripts/configure_titiler_github_actions_prereqs.sh` prompts locally for the
  required GitHub Actions variables and secrets, validates non-secret values
  before any write, and stores secrets through `gh secret set` without putting
  secret values in chat or command-line arguments.
- `.github/workflows/deploy-titiler-cloud-run.yml` is a manual workflow that
  fails fast on missing prerequisites, then builds, pushes, deploys, and smokes
  the controlled Cloud Run service after the required GCP repository variables
  and Workload Identity secrets are set.
- `scripts/run_titiler_cloud_run_workflow.sh` is the local operator wrapper:
  it runs the repository prereq check, dispatches the manual workflow, and
  watches the run without inspecting or printing secret values.

If the Nat Ford GCP Workload Identity and deployer service account do not exist
yet, bootstrap them from a local terminal with an authenticated `gcloud` session:

```bash
scripts/bootstrap_titiler_gcp_wif.sh --repo nfredmond/aerial-intel-platform
```

If `gcloud` is missing on the dev host, install it through the checksum-gated
local helper first. Copy the current SHA256 from Google's official Google Cloud
CLI install/download page for the selected Linux archive
(<https://cloud.google.com/sdk/docs/install>); do not use an unchecked archive
or `curl | bash` pattern.

```bash
scripts/install_gcloud_cli_verified.sh \
  --sha256 <official-sha256-for-the-selected-linux-archive> \
  --yes
export PATH="$HOME/.local/share/google-cloud-sdk/bin:$PATH"
gcloud --version
```

If those GCP resources already exist, configure only the GitHub Actions
prerequisites from a local terminal after the real Nat Ford GCP project, region,
repository, Cloud Run service, CORS origins, Workload Identity Provider, and
service account values are known:

```bash
scripts/configure_titiler_github_actions_prereqs.sh --repo nfredmond/aerial-intel-platform
```

Once the GitHub Actions variables and secrets exist, deploy the controlled
service from `main` with:

```bash
scripts/run_titiler_cloud_run_workflow.sh --repo nfredmond/aerial-intel-platform
```

Smoke any controlled endpoint before wiring the app to it:

```bash
AERIAL_TITILER_URL=https://titiler.example.com scripts/smoke_titiler.sh
```

Then set the Vercel env var through the smoke-first helper:

```bash
scripts/configure_vercel_titiler_url.sh https://titiler.example.com --scope natford --environment production
```

## Production deployment notes

- Host TiTiler on its own fly.io / ECS / Cloud Run service. Do not co-locate
  with NodeODM in production — NodeODM is CPU/RAM-heavy during processing,
  TiTiler is latency-sensitive during user sessions.
- Put TiTiler behind a CDN (Cloudflare, Vercel, CloudFront). Tile responses
  are highly cacheable — cache on `(url-hash, z, x, y)`.
- The app passes the COG via short-lived Supabase signed URLs (6 h TTL). Users
  reloading the artifact page after the TTL expires get a new URL automatically.
  Nothing in TiTiler needs Supabase credentials.
- Lock `CORS_ORIGINS` to exact deployed Next.js origins. Do not use wildcard,
  localhost, path, or query-string origins for the controlled service.
- Before production promotion, run
  `AERIAL_RELEASE_TARGET=production scripts/check_release_readiness.sh` and
  confirm it does not reject the configured TiTiler URL.

## Verification

From the artifact page, with TiTiler running:

1. Confirm env var: `printenv AERIAL_TITILER_URL` inside the Next dev server.
2. Open `/artifacts/<id>` for a `ready` orthomosaic artifact with
   `storage_path` populated.
3. Expect: the raster-preview card renders a basemap with the ortho overlay,
   zoom/pan work, and the opacity slider mutates the `raster-opacity` layer
   paint property.
4. Check the browser Network tab — tile requests should go to
   `${AERIAL_TITILER_URL}/cog/tiles/WebMercatorQuad/{z}/{x}/{y}.png?url=<signed>`
   and return 200 with `image/png`.
5. Bounds should come from
   `${AERIAL_TITILER_URL}/cog/WebMercatorQuad/tilejson.json?url=<signed>`.
   Do not pass `/cog/info` bounds into MapLibre; TiTiler returns those in the
   source CRS for projected COGs, not longitude/latitude.

If tiles fail with 403, the Supabase signed URL expired or the COG wasn't
written with COG-friendly tiling; fall back to verifying the bytes with
`gdalinfo <signed-url>`.
