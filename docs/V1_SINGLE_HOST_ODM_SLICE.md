# V1 Single-Host ODM Slice

_Date: 2026-04-05_

## Purpose

Define the first truthful v1 slice for the aerial-intel platform without pretending the full browser ingest/orchestration stack already exists.

The slice is:

**single mission -> ZIP ingest -> single-host ODM run -> download-first review -> real export bundle**

## Current assessment

### Real today
- Local ZIP ingest via `scripts/e2e_v1_slice.sh`
- Single-host ODM processing via Docker and `scripts/run_odm_benchmark.sh`
- Review bundle generation from actual emitted files via `scripts/build_v1_review_bundle.mjs`
- Optional import of the same run into Supabase via `scripts/import_odm_benchmark_run.mjs`
- Web app surfaces for imported jobs and artifacts (`/jobs/[jobId]`, `/artifacts/[artifactId]`)
- Mission-level intake session records that can capture ZIP evidence, protected browser-upload storage paths, benchmark paths, review-bundle ZIP paths, and truthful pass/fail posture without implying extraction or ODM orchestration already ran
- Benchmark import can now attach real outputs onto an existing managed-processing job, and storage-published imported artifacts can issue signed downloads in the app
- Managed job detail now includes a browser-based operator import lane that can upload benchmark evidence, review bundle ZIPs, and real output files into protected storage, then attach them to the managed job without shell access

### Not real today
- Browser-native ZIP upload/resumable ingest beyond the current signed-upload path
- Automatic app-initiated NodeODM/ClusterODM dispatch
- Fully generalized signed-download delivery beyond storage-published imported outputs and review bundles
- TiTiler-backed raster serving
- Real mission-controller install bundles derived from controller-native exports

## Acceptance bar for this slice

A run counts as a truthful pass only when all of the following are true:

1. Mission imagery arrives as a ZIP.
2. The ZIP is extracted into a local dataset workspace.
3. ODM runs locally on the host via Docker.
4. The run produces a real `summary.json` and `run.log`.
5. The required deliverables are present as non-zero files:
   - orthophoto
   - dem
   - point cloud
6. A review bundle is assembled from only those real files plus run evidence.
7. The final export ZIP is generated for download-first review.

If the run fails or required outputs are missing, the bundle should still be created for inspection, but the overall command must not claim success.

## Current implementation

### Orchestrator
`./scripts/e2e_v1_slice.sh <images_zip_file> <project_slug> [options]`

What it does:
- validates required local tooling
- extracts the ZIP into `.data/.../dataset/images`
- launches ODM against that dataset
- builds a review bundle with:
  - `REVIEW.md`
  - `EXPORT_MANIFEST.json`
  - `run_summary.json`
  - `run.log` when available
  - `deliverables/*` copied only from real ODM outputs
- zips the review bundle for handoff
- optionally imports the run into Supabase
- exits non-zero if the run does not clear the truthful v1 pass bar

### Review bundle contract
The bundle intentionally carries evidence, not just outputs:
- operator-readable review note (`REVIEW.md`)
- machine-readable manifest (`EXPORT_MANIFEST.json`)
- original benchmark summary (`run_summary.json`)
- run log (`run.log`)
- copied deliverables under `deliverables/`

## Recommended next implementation order

1. **Real job orchestration**
   - replace manual/proving job progression with actual NodeODM state transitions
2. **Managed-job import closure**
   - continue the new attach-to-existing-job import lane until operators can close the whole managed-processing loop without sidecar DB edits or shell uploads
3. **Storage-backed delivery expansion**
   - extend the now-landed signed-download path for storage-published imported outputs/review bundles into a broader default delivery contract
4. **Raster review upgrade**
   - move orthophoto/DEM review from file-level evidence to actual in-app visualization

## Operating note

Do not market this slice as full web ingest or a complete WebODM replacement. Right now it is a credible local vertical slice plus a data-backed review surface, which is enough to prove the loop honestly and worth shipping forward.
