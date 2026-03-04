# Sample Dataset Benchmark Protocol

## Objective

Produce reproducible ODM benchmark runs that can be compared across datasets, hardware profiles, and configuration choices.

## Scope

- Baseline engine: ODM Docker image
- Input: image-only datasets (optional GCP files allowed if explicitly noted)
- Output: runtime logs, preflight record, summary manifest, output inventory, and QA checklist results

## Dataset Contract (Required Structure)

The benchmark script expects:

```text
<dataset_root>/
  images/
    IMG_0001.JPG
    IMG_0002.JPG
    ...
```

Accepted image extensions: `jpg`, `jpeg`, `tif`, `tiff`, `png`.

If sample datasets are not available yet, operators should still create the expected directory scaffold so preflight can be repeated deterministically once files arrive.

## Preflight Gate (Do This Before Runtime)

Run:

```bash
./scripts/run_odm_benchmark.sh --preflight-only <dataset_root> [benchmark_label]
```

Preflight currently enforces:

- Dataset path exists and includes `images/`
- At least one supported image is present
- Docker is installed and daemon is reachable
- Disk free space at dataset volume meets threshold (`MIN_FREE_GB`, default `40`)
- ODM invocation command is resolved and written to artifact

Artifacts created during preflight:

- `benchmark/<timestamp>-<label>/preflight.txt`

Do **not** run full benchmarks until preflight passes.

## Required Dataset Metadata

Record the following before each run:

- Dataset ID and name
- Source/owner and usage permission status
- Capture date
- Location (generalized if sensitive)
- Sensor/camera model
- Image count
- Total image size (GB)
- Average GSD estimate (if known)
- Overlap estimate (front/side, if known)
- Control data:
  - GCP present (yes/no)
  - Coordinate reference details

## Hardware and Environment Record

Capture:

- Host OS and kernel
- CPU model and core/thread count
- RAM (GB)
- GPU model and driver (if used)
- Docker version
- ODM image tag/digest
- Available disk space before run

## Benchmark Configuration

For each run, store:

- Benchmark label
- Dataset root and ODM project name
- Full ODM command arguments
- Key parameters tracked explicitly:
  - `--orthophoto-resolution`
  - `--dem-resolution`
  - `--feature-quality`
  - `--pc-quality`
  - Any fast-orthophoto/split/mesh options
- Randomness controls/seeding notes (if any step is non-deterministic)

Determinism defaults in script:

- Pinned default image: `opendronemap/odm:3.5.5`
- Deterministic ODM arg mode unless `ODM_ARGS` override is used
- Explicit preflight artifact generated per run folder

## Runtime Measurement Rules

- Use wall-clock runtime from command start to process exit.
- Record start/end timestamps in UTC.
- Record exit code.
- Capture stdout/stderr to run log without truncation.
- If run fails, retain all partial logs and mark status as failed.

## Output Artifacts

For each run, publish:

- `preflight.txt`
- `run.log`
- `summary.json` with:
  - dataset metadata
  - hardware/environment snapshot
  - command args
  - runtime timing
  - exit status
  - key output file presence checks
- `output_inventory.tsv` (status + size for major deliverables)

Major deliverables tracked by default inventory:

- Orthophoto (`odm_orthophoto/odm_orthophoto.tif`)
- DSM (`odm_dem/dsm.tif`)
- DTM (`odm_dem/dtm.tif`)
- Georeferenced model (`odm_georeferencing/odm_georeferenced_model.laz`)
- Textured model (`odm_texturing/odm_textured_model.obj`)

## QA Checks

Minimum QA gate per run:

- Completeness:
  - Required output files exist.
- Integrity:
  - Output files are non-zero size.
- Geospatial sanity:
  - CRS metadata present where expected.
- Visual spot check:
  - At least 3 sample areas reviewed for obvious artifacts (blur, seam distortion, severe holes).
- Log health:
  - No unreviewed fatal errors.

## Comparison Reporting

When comparing runs, report:

- Runtime delta (% and absolute)
- Output size delta
- QA pass/fail deltas
- Material parameter differences
- Observed tradeoffs (speed vs detail, completeness vs noise)

## Reproducibility Requirements

- Keep dataset immutable during comparison cycle.
- Pin ODM image version for the test set.
- Run from clean output directory per attempt.
- Record any manual interventions explicitly.
- Treat undocumented parameter changes as invalidating strict comparisons.
