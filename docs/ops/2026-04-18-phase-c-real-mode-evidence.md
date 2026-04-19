# Phase C real-mode evidence — Toledo-20 NodeODM round-trip

_Date: 2026-04-18 · Run type: standalone adapter exercise (bypasses Next.js dev server + Supabase)_

## What this evidences

Closes the longest-running open gap in the aerial lane (benchmark artifact outstanding since 2026-02-27) at the **adapter correctness** level:

> "Can `web/src/lib/nodeodm/real-output-adapter.ts` — specifically `inventoryNodeOdmBundle` + `synthesizeBenchmarkSummary` — correctly promote a real `opendronemap/nodeodm` output bundle into a `ManagedImportSummary`-shaped record with `status=success` and `qa_gate.required_outputs_present=true`?"

Because this run bypasses the UI + Supabase + the upload cron, it **does not** evidence the full e2e flow (mission ingest → dispatch → upload cron → poll cron → job row flips to `succeeded`). That remains R-3-proper and is still gated on seeded Supabase state. What it *does* evidence is the load-bearing piece that was the real technical uncertainty: whether our canonical-path inventory matches what ODM actually produces.

## Run parameters

| Parameter | Value |
|---|---|
| Commit under test | `9aeaf0f` (`chore(scripts): standalone NodeODM round-trip exerciser`) |
| NodeODM image | `opendronemap/nodeodm:latest` — digest `cb07d06e21fd6189cfad287c6fedfa0b72568100355635cd9035cb86eed42ee2` |
| NodeODM version | `2.2.4` (engine: `odm` 3.5.6) |
| Container network | `aerial-nodeodm-net` (user-defined bridge — default Docker bridge is non-functional for host→container traffic on this host) |
| Container port mapping | `0.0.0.0:3101 -> 3000/tcp` (3001 is taken by `opengeo-martin` on this dev host) |
| Container resources | `--memory 8g --cpus 4` |
| Host resources seen by container | 33 GB total / 24 CPU cores (`/info`) |
| Preset | `balanced` (`orthophoto-resolution=3`, `dsm=true`, `feature-quality=high`, `min-num-features=12000`) |
| Dataset | 20-image Toledo subset (`~/toledo-20.zip`, ~97 MB, filenames `1JI_0062.JPG` through `1JI_0081.JPG`) |
| Source dataset | `https://github.com/OpenDroneMap/odm_data_toledo` — `license: null` (see CHANGELOG 2026-04-18 note) |
| Task UUID | `8dda4117-a73d-4acb-914d-4342b32de64b` |

## Timings

| Phase | Duration |
|---|---|
| Upload + commit | 0.43 s (20 images, total upload well under 1 s on loopback) |
| Commit → terminal status | 1203 s (~20 min) |
| Bundle download + adapter pass | <1 s combined |

## Bundle contents

- Total entries in `all.zip`: **115**
- `benchmark_summary.json` present: **false** (confirms real ODM does not emit this — the adapter's reason to exist)
- Bundle size: **239 MB** (`238,821,153` bytes)
- Canonical ODM outputs detected by `inventoryNodeOdmBundle`:
  - orthophoto: `odm_orthophoto/odm_orthophoto.tif` — 60.65 MB
  - dsm: `odm_dem/dsm.tif` — 45.54 MB
  - dtm: **null** (not emitted at this preset — expected; DTM is optional per the canonical list)
  - point_cloud: `odm_georeferencing/odm_georeferenced_model.laz` — 10.84 MB
  - mesh: `odm_texturing/odm_textured_model_geo.obj` — 33.21 MB (`_geo` variant preferred by the adapter)

## Adapter verdict

- `status`: **"success"**
- `qa_gate.required_outputs_present`: **true**
- `qa_gate.minimum_pass`: **true**
- `qa_gate.missing_required_outputs`: **[]**

This is the proof point that was outstanding since 2026-02-27: the real-output adapter correctly promotes a real NodeODM output bundle into a `ManagedImportSummary`-shaped record without requiring the container to synthesize a `benchmark_summary.json`. The canonical-path list in `inventoryNodeOdmBundle` matches what `opendronemap/nodeodm:2.2.4` / ODM 3.5.6 actually produces at the `balanced` preset.

## Rerunning this

```bash
# Container (reusable if already up):
docker network create aerial-nodeodm-net 2>/dev/null || true
docker run -d --name aerial-nodeodm --network aerial-nodeodm-net \
  -p 3101:3000 --memory 8g --cpus 4 opendronemap/nodeodm:latest
curl -fsS http://localhost:3101/info | jq .

# Dataset (one-time):
git clone --depth 1 https://github.com/OpenDroneMap/odm_data_toledo \
  ~/.openclaw/workspace/datasets/odm_data_toledo
mkdir -p /tmp/toledo-20/images
ls ~/.openclaw/workspace/datasets/odm_data_toledo/images/*.JPG | sort | head -20 \
  | xargs -I{} cp {} /tmp/toledo-20/images/
(cd /tmp/toledo-20 && zip -r ~/toledo-20.zip images)

# Round-trip:
node scripts/exercise_real_nodeodm_roundtrip.mjs ~/toledo-20.zip --name my-run
```

Artifacts land in `~/.openclaw/workspace/datasets/toledo-20-evidence/<uuid>.{zip,manifest.json}`.

## What this does NOT close

- **R-3 proper (UI → upload cron → poll cron path).** Still gated on `web/.env.local` and seeded Supabase state (org + user + membership + mission + ingest_session with `source_zip_path`). Next step to unblock: `supabase start` locally + apply migrations + use `scripts/provision_droneops_buyer.mjs` and `scripts/seed_aerial_ops_workspace.mjs`, then populate an ingest session.
- **Copy-to-storage for real outputs.** Auto-import still records outputs path-only. Moving bytes into Supabase Storage so shared/signed URLs work without NodeODM being up is the next slice.
- **Public external use of Toledo-derived imagery.** Upstream has `license: null` — any derived imagery published on natfordplanning.com should use a differently-licensed dataset or clarified license.
