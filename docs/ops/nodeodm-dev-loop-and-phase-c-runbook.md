# NodeODM dev-loop + Phase C runbook

_Last updated: 2026-04-18 · Applies to: `web/` Next.js app._

This doc captures the operator view of the NodeODM dispatch → upload → poll → import path: what you can exercise **today** against the in-memory stub, what evidence is needed before claiming a real NodeODM round-trip, and the runbook for Phase C verification.

## At a glance

The NodeODM integration has three runtime modes:

| Mode | Flag | When to use | State today |
|---|---|---|---|
| **webhook** | `AERIAL_DISPATCH_ADAPTER_URL` set, `AERIAL_NODEODM_URL` unset | External dispatch webhook with async callback | Works |
| **nodeodm-direct** | `AERIAL_NODEODM_URL` set, `AERIAL_NODEODM_MODE=real` | Direct NodeODM REST against a live container | Full loop wired: dispatch → upload cron → poll → auto-import (real-bundle adapter lands stub-free outputs) |
| **nodeodm-stub** | `AERIAL_NODEODM_MODE=stub` | Dev + CI, no container needed | Full loop works in-process; integration test walks `processing → succeeded` with synthetic `benchmark_summary.json` |

## Stub mode: what works today

The stub is a `StubNodeOdmClient` backed by a **process-wide singleton** (see `web/src/lib/nodeodm/stub.ts`) so dispatch state is visible to later poll calls. The shared-singleton design is load-bearing for the integration test — don't "fix" it back to per-call instances.

### Env setup

```env
AERIAL_NODEODM_MODE=stub
CRON_SECRET=anything-long
NODE_ENV=development   # guard: stub in production throws
```

### Verified paths (covered by tests)

- **Unit coverage** — `web/src/lib/nodeodm/stub.test.ts` (11 tests): state-machine advance, terminal states, `cancelTask` stability, progress clamping.
- **Integration coverage** — `web/src/app/api/internal/nodeodm-upload/route.test.ts` and `web/src/app/api/internal/nodeodm-poll/route.test.ts`: launch → upload/commit → poll → auto-import, with synthetic stub outputs copied through the same storage/output persistence path used by real bundles.
- **Bootstrap coverage** — `scripts/check_phase3_live_stub_bootstrap.mjs --print-operator-loop` emits redacted local commands only after env posture passes, and `scripts/check_phase3_live_stub_bootstrap.test.mjs` guards the no-secret-output behavior.

The Vitest suites use `resetSharedStubNodeOdmClient()` in `afterEach` to isolate runs.

### Manual exercise via curl

1. Run `AERIAL_NODEODM_MODE=stub npm run dev` in `web/`.
2. In the browser, sign in, select a mission, extract a dataset, create a managed-processing request, start intake review, then launch the NodeODM task.
3. Copy `output_summary.nodeodm.taskUuid` from the job page or `/admin`:

   ```bash
   export TASK_UUID="<task-uuid-from-job-summary>"
   ```

4. Upload and commit extracted images to the stub through the same cron route used by real mode:

   ```bash
   curl -fsS -H "Authorization: Bearer $CRON_SECRET" \
     http://localhost:3000/api/internal/nodeodm-upload
   ```

5. Advance the stub task state via HTTP (only available when `AERIAL_NODEODM_MODE=stub` and `NODE_ENV !== "production"`). This dev-only route now requires the same internal-route auth pattern as upload and poll:

   ```bash
   # Flip to running (simulates commit after upload)
   curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" \
     "http://localhost:3000/api/internal/dev/nodeodm-stub-advance?taskUuid=$TASK_UUID&to=running"
   # Tick progress forward one step
   curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" \
     "http://localhost:3000/api/internal/dev/nodeodm-stub-advance?taskUuid=$TASK_UUID&to=progress"
   # Jump straight to completed (progress=100, statusCode=40)
   curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" \
     "http://localhost:3000/api/internal/dev/nodeodm-stub-advance?taskUuid=$TASK_UUID&to=completed"
   # Simulate failure (statusCode=30)
   curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" \
     "http://localhost:3000/api/internal/dev/nodeodm-stub-advance?taskUuid=$TASK_UUID&to=failed"
   # Simulate cancellation (statusCode=50)
   curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" \
     "http://localhost:3000/api/internal/dev/nodeodm-stub-advance?taskUuid=$TASK_UUID&to=canceled"
   ```

6. Re-hit the poll route to let the app pick up the new state and auto-import the synthetic outputs:

   ```bash
   curl -fsS -H "Authorization: Bearer $CRON_SECRET" \
     http://localhost:3000/api/internal/nodeodm-poll
   ```

For a redacted checklist of the same sequence, run:

```bash
node scripts/check_phase3_live_stub_bootstrap.mjs --print-operator-loop
```

## Phase C (real NodeODM round-trip): gap status

### ~~Gap 1 — No upload path from app to NodeODM~~ (closed 2026-04-17)

Closed by the upload cron at `GET /api/internal/nodeodm-upload` (`CRON_SECRET` bearer guard). It streams extracted-dataset objects out of Supabase Storage (`extracted_dataset_path` on `drone_ingest_sessions`), pushes them to NodeODM via `uploadImages` in batches of up to 50, then calls `commitTask` and emits `nodeodm.task.uploading` / `nodeodm.task.committed` events. Integration coverage lives alongside `web/src/app/api/internal/nodeodm-upload/route.test.ts`. The "Extract dataset" server action shipped the same week, so a real-mode run is now possible end-to-end.

### ~~Gap 2 — No dev affordance to advance stub tasks over HTTP~~ (closed 2026-04-16)

Closed by `POST /api/internal/dev/nodeodm-stub-advance?taskUuid=X&to=running|completed|failed|canceled|progress`, guarded 404 unless `AERIAL_NODEODM_MODE=stub` AND `NODE_ENV !== "production"`. See the "Manual exercise via curl" section above for the call shape. `/admin` observability panels are now live-demonstrable without a container.

### ~~Gap 3 — Output import~~ (closed 2026-04-18, storage copy closed later)

Real NodeODM bundles do not emit `benchmark_summary.json` (that file is a stub/scripted-benchmark invention). The poll route (`web/src/app/api/internal/nodeodm-poll/route.ts` → `importCompletedOutputs`) now branches on the presence of `benchmark_summary.json` in the downloaded zip. If present, the existing stub/scripted path runs. If absent, `inventoryNodeOdmBundle` + `synthesizeBenchmarkSummary` (`web/src/lib/nodeodm/real-output-adapter.ts`) build a `ManagedImportSummary`-shaped record from canonical ODM output paths (`odm_orthophoto/odm_orthophoto.tif`, `odm_dem/{dsm,dtm}.tif`, `odm_georeferencing/*.laz` + `entwine_pointcloud/ept.json`, `odm_texturing/*.obj`) and round-trips it through `parseManagedBenchmarkSummaryText` to keep a single source of truth. Real-mode jobs with the two required outputs (orthophoto + DSM) flip to `status=succeeded` with `benchmarkSummary.source=nodeodm-real-bundle`. When neither `benchmark_summary.json` nor any recognized ODM output is found, the import throws and the job stays `awaiting_output_import` with `lastImportError` populated. Stub mode still carries an explicitly synthetic dataset root and tiny fabricated output bytes, and its integration walk ends at `status=succeeded` via the stub's fabricated `benchmark_summary.json`.

The poll route now copies recognized ODM bundle outputs into protected Supabase Storage and inserts ready `drone_processing_outputs` rows. The stub bundle uses tiny synthetic bytes, so it is a safety proof for orchestration and persistence only; it is not evidence of real ODM compute quality.

## Phase C runbook — real-mode Toledo round-trip (Gap 1 + Gap 3 closed)

Run this when you have:

- [ ] A local `opendronemap/nodeodm:latest` container (pin the digest in evidence)
- [ ] A small drone dataset staged as a ZIP (the ODM Toledo subset below is the reference dataset)
- [ ] `web/.env.local` populated with real Supabase creds (service role + anon + URL)
- [ ] A seeded mission + org in the Supabase project

### Prereq env (`web/.env.local`)

```env
AERIAL_NODEODM_URL=http://localhost:3101          # NOTE: 3001 is typically taken by opengeo-martin on dev hosts
AERIAL_NODEODM_MODE=real
AERIAL_NODEODM_TOKEN=                              # empty — default container has no auth
CRON_SECRET=<long-random>
NEXT_PUBLIC_SUPABASE_URL=<existing>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<existing>
SUPABASE_SERVICE_ROLE_KEY=<existing>
```

### One-time dataset staging

```bash
git clone --depth 1 https://github.com/OpenDroneMap/odm_data_toledo \
  ~/.openclaw/workspace/datasets/odm_data_toledo   # 87 JPGs, ~428 MB

# Build a tractable 20-image subset (keeps the first round-trip laptop-friendly)
rm -rf /tmp/toledo-20 && mkdir -p /tmp/toledo-20/images
ls ~/.openclaw/workspace/datasets/odm_data_toledo/images/*.JPG | sort | head -20 \
  | xargs -I{} cp {} /tmp/toledo-20/images/
(cd /tmp/toledo-20 && zip -r ~/toledo-20.zip images)    # ~97 MB
```

### Container bring-up

```bash
docker pull opendronemap/nodeodm:latest
# NOTE: on this dev host the Docker default bridge network is broken for host→container
# traffic. Create a user-defined bridge and attach the container to it instead.
docker network create aerial-nodeodm-net 2>/dev/null || true
docker run -d --name aerial-nodeodm --network aerial-nodeodm-net \
  -p 3101:3000 --memory 8g --cpus 4 opendronemap/nodeodm:latest
curl -fsS http://localhost:3101/info | jq
```

Capture `docker inspect aerial-nodeodm` (abridged) + the image digest + the `/info` response to the evidence doc.

### Round-trip steps

1. **Start app**: `npm run dev` in `web/`.
2. **Upload the ZIP** through the mission ingest UI → confirm `drone_ingest_sessions` row with `source_zip_path` populated.
3. **Click "Extract dataset"** → confirm `extracted_dataset_path` populated and 20 images in the `drone-ops` Storage bucket under `${orgSlug}/missions/${missionId}/extracted/${sessionId}/`.
4. **Dispatch** a job (UI or direct DB insert to `drone_processing_jobs` with `output_summary.dispatchMode="nodeodm-direct"` and preset `balanced`). Verify via `/admin` → "NodeODM tasks in flight" that `taskUuid` is recorded.
5. **Trigger upload cron manually** (local dev, don't wait for Vercel schedule):
   ```bash
   curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/internal/nodeodm-upload
   ```
   Expect `uploadState: committed` after one tick (20 images < 50-batch cap).
6. **Let NodeODM process.** Toledo-20 at balanced preset is typically 15–45 min on laptop-class hardware. Watch container logs: `docker logs -f aerial-nodeodm`.
7. **Trigger poll cron** until completion:
   ```bash
   while true; do
     curl -s -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/internal/nodeodm-poll | jq '.details[0]'
     sleep 60
   done
   ```
8. On `statusCode=40`: the real-bundle adapter fires (no `benchmark_summary.json` in a real ODM zip), the job flips to `succeeded`, and `/admin` shows imported outputs with `importedFromTaskUuid` + `benchmarkSummary.source=nodeodm-real-bundle`. Capture screenshot.
9. **Verify UI**: navigate to the job detail page; confirm the benchmark summary renders with `orthophoto` and `dsm` marked present.

If a real run lands in `awaiting_output_import` instead of `succeeded`, log `lastImportError` and iterate. Most likely cause: an ODM bundle path variant not in `inventoryNodeOdmBundle` (e.g., a nested or renamed `odm_georeferencing/`). Add the variant to the canonical-path arrays in `web/src/lib/nodeodm/real-output-adapter.ts`, regenerate the test fixture, ship a small follow-up.

### Evidence to capture

Save to `docs/ops/2026-MM-DD-phase-c-round-trip-evidence.md`:

- Commit SHA of the version tested
- `docker inspect` output for the NodeODM container
- Dataset size + image count
- Timings: dispatch → upload complete → poll completed → import complete
- Screenshots of `/admin` panel at each transition
- Any `failures[]` entries from the poll route response
- Any `nodeodm.task.failed` events in `drone_processing_job_events`

### Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Task stays `queued` forever | Upload never happened | Check Gap 1 helper; look for `nodeodm.task.uploading` event |
| Poll route 500s | `AERIAL_NODEODM_URL` wrong or container not reachable | `curl` the `/info` endpoint directly |
| Task goes `failed` immediately | Preset incompatible with dataset (e.g., insufficient overlap) | Switch preset to `fast` or shrink dataset |
| Job stuck `awaiting_output_import` | Import path not implemented for real outputs | See Gap 3 |
| 401 on poll | Missing `CRON_SECRET` env or wrong bearer | Confirm env + header match |

## Related code + docs

- `web/src/lib/nodeodm/config.ts` — env-switchable client factory, stub-vs-real, prod guard
- `web/src/lib/nodeodm/client.ts` — HTTP client for real NodeODM
- `web/src/lib/nodeodm/stub.ts` — in-memory stub with shared singleton
- `web/src/lib/dispatch-adapter-nodeodm.ts` — `launchNodeOdmTask`, `pollNodeOdmTask`
- `web/src/app/api/internal/nodeodm-poll/route.ts` — poll cron
- `web/src/app/admin/page.tsx` — "NodeODM tasks in flight" + "Stuck in-flight jobs" observability panels
- `web/src/app/api/internal/nodeodm-upload/route.ts` — upload cron that streams extracted dataset to NodeODM and commits the task
- `web/src/lib/nodeodm/real-output-adapter.ts` — real-bundle inventory + synthesized `ManagedImportSummary`
- `docs/V1_SINGLE_HOST_ODM_SLICE.md` — architectural spec for the v1 integration
- `docs/SAMPLE_DATASET_BENCHMARK_PROTOCOL.md` — dataset selection + benchmark expectations
- `docs/ops/2026-04-16-phase-e-f-g-evidence.md` — prior ship evidence including stub + integration test
