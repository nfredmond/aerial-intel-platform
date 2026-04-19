# TiTiler Wave-1 exit evidence — 2026-04-18

Captures what was verified locally and what still blocks a true Toledo-20 render-through-viewer closure.

## Verified

- `opengeo-titiler` container at `ghcr.io/developmentseed/titiler:latest` (v2.0.1) listening on `http://localhost:8000` on this dev host, already running as part of the OpenGeo stack.
- TiTiler speaks the client's URL scheme:
  - `GET /cog/tiles/WebMercatorQuad/{z}/{x}/{y}.png?url=<encoded-cog-url>` → 200, `image/png`, 256×256
  - `GET /cog/info?url=<encoded-cog-url>` → 200 JSON with `bounds` + `crs`
- Sample tile request against the upstream rio-tiler fixture COG resolves; `sample-tile.png` in this directory is the 334-byte PNG returned by TiTiler.
- Unit tests (`src/lib/titiler/client.test.ts`, 7 tests) pin the URL builders against the 2.x paths. Full suite: 313/313 green.
- Typecheck clean (`./node_modules/.bin/tsc --noEmit`).
- App env: `AERIAL_TITILER_URL=http://localhost:8000` added to `.env.example`.

## Still blocked on Supabase creds

A true end-to-end Toledo-20 verification — upload via the UI → extraction → dispatch → auto-import with copy-to-storage → artifact page renders the orthomosaic overlay — requires `web/.env.local` to be populated with real Supabase credentials (URL, anon key, service-role key). The plan constraint is to not guess creds. No `.env.local` exists in the repo on this dev host.

## What happens when creds land

1. `pnpm --filter web dev` on `:3000`.
2. UI upload of `~/toledo-20.zip` (already staged) → extraction → job → poll → auto-import writes COG bytes to `drone-ops/<org-slug>/jobs/<job-id>/outputs/orthomosaic/odm_orthophoto.tif`.
3. Open `/artifacts/<artifact-id>` for the `ready` orthomosaic output.
4. Expected: raster-preview card renders the basemap with the ortho overlay, pan/zoom works, opacity slider mutates `raster-opacity`. Network tab shows tile requests to `http://localhost:8000/cog/tiles/…?url=<signed-supabase-url>` returning 200 `image/png`.
5. Comparison matrix in `knowledge/PARA/Projects/Aerial-Intel-Platform-ODM+.md` can then honestly flip "raster viewer" to shipped.

## Dev-loop gotcha recorded in runbook

Local Supabase signed URLs point at `http://localhost:54321`, which a container on the default bridge network cannot resolve. Fix: run TiTiler on `--network host`, or rewrite the signed-URL base to `http://host.docker.internal:54321` before handing it to the browser. Documented in `docs/ops/titiler-setup.md`.
