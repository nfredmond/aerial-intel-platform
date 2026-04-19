# TiTiler setup (W1-B raster viewer)

TiTiler is the COG-tile server behind the artifact-detail raster preview. The
Next.js app builds `.../cog/tiles/WebMercatorQuad/{z}/{x}/{y}.png?url=<signed>`
URLs; TiTiler pulls the COG from Supabase Storage (via a signed URL) and
responds with PNG tiles. The app itself does not need to proxy anything.

## Environment

The only env var the app reads is:

```
AERIAL_TITILER_URL=http://localhost:8090
```

Set it for local dev (via `.env.local`) and for the Vercel project (per
environment). The raster preview is automatically suppressed when the var is
unset — users see a "viewer not configured" card instead of a broken embed.

## Run TiTiler locally (Docker)

The first-party `ghcr.io/developmentseed/titiler` image speaks the endpoints
the client uses. One-liner for a scratch dev instance:

```bash
docker run --rm -p 8090:80 \
  -e PORT=80 \
  -e CORS_ORIGINS='*' \
  -e MOSAIC_ENDPOINT_ENABLED=FALSE \
  ghcr.io/developmentseed/titiler:latest \
  uvicorn titiler.application.main:app --host 0.0.0.0 --port 80
```

Then hit:

```
curl -fsS 'http://localhost:8090/cog/bounds?url=https%3A%2F%2Fexample.com%2Fortho.tif'
```

`CORS_ORIGINS='*'` is safe for dev only. In production, restrict it to the
deployed app origin.

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

If tiles fail with 403, the Supabase signed URL expired or the COG wasn't
written with COG-friendly tiling; fall back to verifying the bytes with
`gdalinfo <signed-url>`.
