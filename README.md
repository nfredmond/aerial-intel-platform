# Nat Ford Aerial Intelligence Platform (ODM+)

Project slug:
default branch: main

See project charter and docs folder for current scope and architecture.

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
