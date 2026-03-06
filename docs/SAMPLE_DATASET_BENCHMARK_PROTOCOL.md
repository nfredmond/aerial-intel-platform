# Sample Dataset Benchmark Protocol

## Objective

Produce reproducible ODM benchmark runs that can be compared across datasets, hardware profiles, and configuration choices.

## Scope

- Baseline engine: ODM Docker image
- Input: image-only datasets (optional GCP files allowed if explicitly noted)
- Output: runtime logs, summary manifest, and QA checklist results

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

- Project name
- Full ODM command arguments
- Key parameters tracked explicitly:
  - `--orthophoto-resolution`
  - `--dem-resolution`
  - `--feature-quality`
  - `--pc-quality`
  - Any fast-orthophoto/split/mesh options
- Randomness controls/seeding notes (if any step is non-deterministic)

## Runtime Measurement Rules

- Use wall-clock runtime from command start to process exit.
- Record start/end timestamps in UTC.
- Record exit code.
- Capture stdout/stderr to run log without truncation.
- If run fails, retain all partial logs and mark status as failed.

## Output Artifacts

For each run, publish:

- `run.log`
- `summary.json` with:
  - dataset metadata
  - hardware/environment snapshot
  - command args
  - runtime timing
  - exit status
  - key output file presence checks:
    - `outputs.orthophoto`: `odm_orthophoto/odm_orthophoto.tif`
    - `outputs.dem`: prefer `odm_dem/dsm.tif`, fallback `odm_dem/dtm.tif`
    - `outputs.point_cloud`: prefer `odm_georeferencing/odm_georeferenced_model.laz`, fallback `.ply`
    - `outputs.mesh`: `odm_texturing/odm_textured_model.obj`
    - each output contains `path`, `exists`, `non_zero_size`, `size_bytes`
  - QA gate snapshot:
    - `qa_gate.required_outputs_present` (orthophoto + dem + point cloud)
    - `qa_gate.minimum_pass` (`status=success` and required outputs present)
    - `qa_gate.missing_required_outputs` (array of missing required keys)
- Output inventory list (file names + sizes) for major deliverables:
  - Orthophoto
  - DEM/DSM
  - Point cloud
  - Texturing/mesh (if enabled)

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
