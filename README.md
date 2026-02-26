# Nat Ford Aerial Intelligence Platform (ODM+)

Project slug: 
default branch: main

See project charter and docs folder for current scope and architecture.

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

Optional overrides:

- `ODM_IMAGE` (default: `opendronemap/odm:latest`)
- `ODM_ARGS` (default: `--project-path /datasets <project_name>`)

Example override:

```bash
ODM_IMAGE=opendronemap/odm:3.5.5 ODM_ARGS="--project-path /datasets site-a-baseline --orthophoto-resolution 2" ./scripts/run_odm_benchmark.sh ./sample-datasets/site-a site-a-baseline
```
