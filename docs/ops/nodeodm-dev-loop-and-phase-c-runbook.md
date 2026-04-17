# NodeODM dev-loop + Phase C runbook

_Last updated: 2026-04-16 · Applies to: `web/` Next.js app._

This doc captures the operator view of the NodeODM dispatch → poll → import path: what you can exercise **today** against the in-memory stub, what's still **blocked** before real NodeODM can round-trip end-to-end, and the runbook for Phase C verification when the blockers are cleared.

## At a glance

The NodeODM integration has three runtime modes:

| Mode | Flag | When to use | State today |
|---|---|---|---|
| **webhook** | `AERIAL_DISPATCH_ADAPTER_URL` set, `AERIAL_NODEODM_URL` unset | External dispatch webhook with async callback | Works |
| **nodeodm-direct** | `AERIAL_NODEODM_URL` set, `AERIAL_NODEODM_MODE=real` | Direct NodeODM REST against a live container | Dispatch + poll work; upload path missing (see Gap 1) |
| **nodeodm-stub** | `AERIAL_NODEODM_MODE=stub` | Dev + CI, no container needed | Works in-process; HTTP-driven round-trip blocked on same upload gap |

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
- **Integration coverage** — `web/src/app/api/internal/nodeodm-poll/route.test.ts` (3 tests): full `launchNodeOdmTask` → `GET /api/internal/nodeodm-poll` → `status=awaiting_output_import` walk across 5 polls, with `nodeodm.task.completed` event emission.

Both test suites use `resetSharedStubNodeOdmClient()` in `afterEach` to isolate runs.

### Manual exercise via curl

1. Run `AERIAL_NODEODM_MODE=stub npm run dev` in `web/`.
2. Insert a `drone_processing_jobs` row with `output_summary = {"nodeodm": {"taskUuid": "<some-uuid>"}}` and status `queued` (requires live Supabase).
3. `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/internal/nodeodm-poll`
4. Watch `/admin` → "NodeODM tasks in flight" for the row.
5. Advance the stub task state via HTTP (only available when `AERIAL_NODEODM_MODE=stub` and `NODE_ENV !== "production"`):

   ```bash
   # Flip to running (simulates commit after upload)
   curl -X POST "http://localhost:3000/api/internal/dev/nodeodm-stub-advance?taskUuid=<uuid>&to=running"
   # Tick progress forward one step
   curl -X POST "http://localhost:3000/api/internal/dev/nodeodm-stub-advance?taskUuid=<uuid>&to=progress"
   # Jump straight to completed (progress=100, statusCode=40)
   curl -X POST "http://localhost:3000/api/internal/dev/nodeodm-stub-advance?taskUuid=<uuid>&to=completed"
   # Simulate failure (statusCode=30)
   curl -X POST "http://localhost:3000/api/internal/dev/nodeodm-stub-advance?taskUuid=<uuid>&to=failed"
   # Simulate cancellation (statusCode=50)
   curl -X POST "http://localhost:3000/api/internal/dev/nodeodm-stub-advance?taskUuid=<uuid>&to=canceled"
   ```

   Then re-hit the poll route to let the app pick up the new state.

## Phase C (real NodeODM round-trip): gaps

### Gap 1 — No upload path from app to NodeODM

`NodeOdmClient.uploadImages(uuid, files)` and `commitTask(uuid)` exist on the client (`web/src/lib/nodeodm/client.ts`) and are implemented on the stub. **Nothing in the app layer calls them.** `launchNodeOdmTask()` creates the task UUID and returns — the comment says _"Image upload + commit happen in a second step after the caller has uploaded the dataset"_ but that second step is TBD.

**Impact:** even with a live NodeODM container, the app can't push a dataset to it. The poll cron will sit on a task forever because the task never gets committed.

**Unblock shape:**

- Add `uploadJobImagesToNodeOdm(jobId, dataset)` in `web/src/lib/dispatch-adapter-nodeodm.ts` that streams from storage (Supabase bucket?) to `uploadImages`, then calls `commitTask`.
- Add an HTTP route or background job that invokes it after dispatch (options: (a) sync after launch, (b) separate `POST /api/internal/nodeodm-upload?jobId=...` cron, (c) client-side from the mission-ingest UI).
- Record progress/failures as `nodeodm.task.uploading` / `nodeodm.task.committed` events.

Scope: ~4–6 hours, depends on where the dataset lives pre-dispatch.

### ~~Gap 2 — No dev affordance to advance stub tasks over HTTP~~ (closed 2026-04-16)

Closed by `POST /api/internal/dev/nodeodm-stub-advance?taskUuid=X&to=running|completed|failed|canceled|progress`, guarded 404 unless `AERIAL_NODEODM_MODE=stub` AND `NODE_ENV !== "production"`. See the "Manual exercise via curl" section above for the call shape. `/admin` observability panels are now live-demonstrable without a container.

### Gap 3 — Output import is synthetic in stub mode

The stub's `taskOutput` returns a synthetic `Uint8Array` tagged with `synthetic: true`. Downstream import code (`web/src/lib/managed-processing-import.ts`) needs to either (a) detect and short-circuit on synthetic outputs, or (b) accept that stub mode stops at `awaiting_output_import` without actually importing.

Current integration test accepts (b). Real-mode verification will need (a) or equivalent.

## Phase C runbook (when blockers clear)

Run this when you have:

- [ ] A local or networked `opendronemap/nodeodm` container (tested against v3.x)
- [ ] A small drone dataset (10–30 JPEGs is plenty for first round-trip)
- [ ] The app-layer upload helper from Gap 1 implemented + tested

### Prereq env

```env
AERIAL_NODEODM_URL=http://localhost:3001          # or wherever the container listens
AERIAL_NODEODM_MODE=real
AERIAL_NODEODM_TOKEN=                              # optional, matches container config
CRON_SECRET=<long-random>
```

### Round-trip steps

1. **Start container**: `docker run -d -p 3001:3000 opendronemap/nodeodm`.
   Verify: `curl http://localhost:3001/info` returns JSON with `version`, `maxImages`, etc.
2. **Start app**: `npm run dev` in `web/`.
3. **Create mission** via UI, attach dataset.
4. **Dispatch** with `dispatchMode: "nodeodm-direct"`, preset `balanced`.
   Expected: `drone_processing_jobs` row gains `output_summary.nodeodm.taskUuid`.
5. **Upload** images (per Gap 1 — route TBD).
   Expected: task transitions from `10 (queued)` to `20 (running)` with increasing `progress`.
6. **Watch** `/admin` → "NodeODM tasks in flight" panel. Status should advance from `queued` → `running` → `completed` over minutes (dataset-dependent).
7. **Poll cron** runs every 5 min (see `vercel.json`) or hit manually:
   `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/internal/nodeodm-poll`
8. On `completed`: job row flips to `awaiting_output_import` and emits `nodeodm.task.completed` event.
9. **Import** outputs (downstream path — verify this lands in `drone_artifacts` or equivalent).

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
- `docs/V1_SINGLE_HOST_ODM_SLICE.md` — architectural spec for the v1 integration
- `docs/SAMPLE_DATASET_BENCHMARK_PROTOCOL.md` — dataset selection + benchmark expectations
- `docs/ops/2026-04-16-phase-e-f-g-evidence.md` — prior ship evidence including stub + integration test
