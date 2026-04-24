# TiTiler setup (W1-B raster viewer)

TiTiler is the COG-tile server behind the artifact-detail raster preview. The
Next.js app builds `.../cog/tiles/WebMercatorQuad/{z}/{x}/{y}.png?url=<signed>`
URLs and reads `.../cog/WebMercatorQuad/tilejson.json?url=<signed>` for WGS84
bounds; TiTiler pulls the COG from Supabase Storage (via a signed URL) and
responds with PNG tiles. The app itself does not need to proxy anything.

## Environment

The only env var the app reads is:

```
AERIAL_TITILER_URL=http://localhost:8000
```

Set it for local dev (via `.env.local`) and for the Vercel project (per
environment). The raster preview is automatically suppressed when the var is
unset — users see a "viewer not configured" card instead of a broken embed.

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
  HTTPS `supabase.co` URL, TiTiler fetches it like any other upstream.
- **Local Supabase (`supabase start`):** the signed URL points at
  `http://localhost:54321`. A container on the default bridge network cannot
  resolve `localhost` on the host. Either (a) put TiTiler on the `host` network
  (`--network host`), or (b) rewrite the Supabase base URL the app uses for
  signed-download to `http://host.docker.internal:54321` before handing the URL
  to the browser. Keeping TiTiler on host-network is simplest for dev loops.

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
  and secret names required by the controlled Cloud Run deployment. It does not
  inspect or print secret values.
- `.github/workflows/deploy-titiler-cloud-run.yml` is a manual workflow that
  fails fast on missing prerequisites, then builds, pushes, deploys, and smokes
  the controlled Cloud Run service after the required GCP repository variables
  and Workload Identity secrets are set.

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
- Lock `CORS_ORIGINS` to the deployed Next.js origin + any preview domains.
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
