# Progress Note — 2026-02-25 — Benchmark Pipeline Hardening

## Summary

Delivered a robustness increment for ODM benchmark execution focused on deterministic operator flow when sample datasets are delayed.

## Shipped in this increment

- Hardened `scripts/run_odm_benchmark.sh` with:
  - `--preflight-only` mode
  - dataset contract validation (`images/` + supported file extensions)
  - Docker daemon availability check
  - disk headroom gate (`MIN_FREE_GB`, default 40GB)
  - deterministic default ODM image pin (`opendronemap/odm:3.5.5`)
  - deterministic argument mode (`ODM_EXTRA_ARGS`) with explicit legacy override mode (`ODM_ARGS`)
  - richer benchmark artifacts: `preflight.txt`, `output_inventory.tsv`, expanded `summary.json`
- Updated protocol documentation to include mandatory preflight gate and deterministic execution conventions.
- Updated README quickstart to enforce preflight-first execution.

## Why this matters

- Removes ambiguous failure modes before expensive ODM runtime.
- Creates repeatable operator behavior while waiting for sample dataset handoff.
- Improves comparability of future benchmark runs by pinning defaults and recording preflight context.

## Operator guidance

1. Stage dataset under `<dataset_root>/images`.
2. Run preflight:
   - `./scripts/run_odm_benchmark.sh --preflight-only <dataset_root> <label>`
3. Resolve any preflight failures.
4. Run benchmark:
   - `./scripts/run_odm_benchmark.sh <dataset_root> <label>`
5. Archive `preflight.txt`, `run.log`, `output_inventory.tsv`, and `summary.json`.

## Current blocker state

- No benchmark evidence yet because sample dataset is still pending.
