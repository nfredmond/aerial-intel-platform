# Gap 1 — NodeODM upload + commit wiring plan

_Draft: 2026-04-16 · Scope: unblock real-mode NodeODM round-trip (Phase C)._

This plan covers what's actually missing before a drone dataset can flow through `nodeodm-direct` dispatch end-to-end. The runbook at `docs/ops/nodeodm-dev-loop-and-phase-c-runbook.md` treats this as a single gap ("upload path"), but investigation shows it's two linked gaps. **Do not start implementation without picking one of the options in §3 first** — the UI surface, scope, and test strategy all branch on that choice.

## 1. What's actually missing

### 1a. No call site for `launchNodeOdmTask`

`web/src/lib/dispatch-adapter-nodeodm.ts` exports `launchNodeOdmTask(input)` and `pollNodeOdmTask(uuid)`. Grep across `web/src`:

- `launchNodeOdmTask` — referenced only in its own module + 2 test files (`dispatch-adapter-nodeodm.test.ts`, `api/internal/nodeodm-poll/route.test.ts`). **Zero live call sites.**
- `"nodeodm-direct"` — referenced only in `.env.example` + docs. **No dispatch action dispatches this mode.**

The dispatch UI (`web/src/app/missions/[missionId]/page.tsx`) and the managed-processing state machine (`web/src/lib/managed-processing.ts`) don't know about NodeODM at all. They record `dispatchAdapter.mode` strings into `output_summary`, but nothing dispatches by calling the NodeODM client.

### 1b. No upload + commit step after launch

Even if 1a were fixed, `NodeOdmClient.uploadImages(uuid, files)` and `commitTask(uuid)` — the two calls that actually push a dataset to NodeODM — have zero live callers. They're only exercised in stub-mode tests. A committed NodeODM task with no images just sits queued forever.

### Why the runbook undersells this

The runbook says "the second step is TBD" — true, but the *first step* (wiring launch into dispatch) is also TBD. Fixing only upload without wiring the dispatch action leaves launch still unreachable from the UI.

## 2. What we can reuse

- **Storage layer.** `web/src/lib/supabase/admin-storage.ts` already owns the `drone-ops` bucket: `createDroneOpsSignedUploadTicket(path)` (writes), `createSignedDownloadUrl({path})` (reads), `downloadStorageText({path})` (reads text).
- **Ingest session state.** `drone_ingest_sessions` rows track `source_zip_path` (uploaded ZIP location) and `extracted_dataset_path` (where extracted images live — if extraction has happened). Status state machine: `zip_received → zip_uploaded → extracted → ready`.
- **Dataset row.** `drone_datasets.status` goes `draft → uploading → uploaded → preflight_flagged → ready → processing → archived`. The `ready` state is the natural precondition for dispatch.
- **NodeODM client contract.** `uploadImages` takes `Array<{ blob: Blob; filename: string }>` and loops per-image to `POST /task/new/upload/:uuid`. No bulk ZIP upload — each image is its own multipart request.
- **Event log.** `drone_processing_job_events` already takes structured events; we'd add `nodeodm.task.uploading`, `nodeodm.task.upload_complete`, `nodeodm.task.committed`, `nodeodm.task.commit_failed` alongside the existing `nodeodm.task.completed`.

## 3. Options for the upload step

All three assume 1a is fixed first (see §4 for the shared launch-wiring work).

### Option A — Synchronous server-side upload inside the dispatch action

**Flow:** dispatch action calls `launchNodeOdmTask` → streams each image from `drone-ops` storage → `uploadImages` → `commitTask`, all inside one request.

- **Pros:** simplest state machine (one action, one transaction boundary). No new routes. Failures surface immediately in the dispatch UI.
- **Cons:** a 200-image dataset at ~10 MB/each = 2 GB to stream through a Next.js server route. Vercel serverless has a **300s timeout** (the new default — see Vercel v26 notes) and tight memory limits. Realistic ceiling: ~50–100 small images before hitting the wall. **Blocks on any dataset large enough to actually matter.**
- **When to pick:** never in prod. Could work for a dev/demo path with tiny datasets (<50 images).

### Option B — Async background route (poll-driven, like the existing `nodeodm-poll` cron)

**Flow:**
1. Dispatch action calls `launchNodeOdmTask` → persists `output_summary.nodeodm = { taskUuid, uploadState: "pending" }`. Job status → `pending_upload`.
2. New cron or callback route `POST /api/internal/nodeodm-upload?jobId=...`:
   - Finds jobs in `pending_upload`.
   - Streams images from storage → `uploadImages` in batches (20–50 at a time).
   - Writes progress back to `output_summary.nodeodm.uploadState` on each batch.
   - When all images uploaded, calls `commitTask` → status → `running`.
3. Existing `nodeodm-poll` cron takes over from there.

- **Pros:** survives long uploads. Piggybacks on the same cron pattern already in `vercel.json`. State is observable (upload progress visible in `/admin`). Crash-resumable (next cron tick picks up from last batch).
- **Cons:** most code to write. Needs a batch checkpoint field in `output_summary.nodeodm`. Race conditions between upload cron and poll cron need to be handled (upload cron locks job, or just checks status).
- **When to pick:** default for prod. This is what matches the rest of the architecture.

### Option C — Client-side browser upload from ingest UI direct to NodeODM

**Flow:** mission-ingest UI fetches signed download URLs from Supabase → browser streams each image via `fetch()` directly to NodeODM's `/task/new/upload/:uuid` → browser calls `/task/new/commit/:uuid`.

- **Pros:** no server-side bandwidth cost. Natural progress indicator in UI.
- **Cons:** exposes NodeODM URL + token to the browser (CORS + auth surface). Only works for browser-originated uploads — doesn't cover the batch/API path. NodeODM's default CORS config doesn't allow arbitrary origins; would need a reverse proxy.
- **When to pick:** never as the only path. Could be a nice-to-have alongside Option B for interactive uploads, but scope creep.

## 4. Shared work for all options (Gap 1a)

This has to happen regardless of which option we pick for upload:

1. **Add `nodeodm-direct` as a dispatch mode** in the managed-processing dispatch action. File: `web/src/lib/managed-processing.ts` — extend `dispatchManagedOdmJob` (or equivalent entry point) to branch on `dispatchMode === "nodeodm-direct"` and call `launchNodeOdmTask`.
2. **Persist the task UUID** into `output_summary.nodeodm.taskUuid`. The admin panel already reads it — this wires the producer side.
3. **Emit `nodeodm.task.launched` event** to `drone_processing_job_events`.
4. **UI surface:** add a "NodeODM (direct)" option to the dispatch mode select in `web/src/app/missions/[missionId]/page.tsx`. Gate on `AERIAL_NODEODM_URL` being set (reuse `getNodeOdmAdapterConfig()`).

Scope for §4 alone: ~2–3 hours.

## 5. Recommendation

**Pick Option B + §4 shared work.** Total scope: ~6–9 hours.

- §4 first (~3h) — unblocks real-mode launch, leaves upload as `pending_upload` forever (harmless, observable in admin).
- Option B upload cron second (~4–6h) — closes the loop.

Reasons:
- Matches the architecture the rest of NodeODM already uses (poll cron pattern).
- Survives real dataset sizes (no 300s-timeout cliff).
- Observable every step of the way — we already have the admin panel.
- Can ship §4 and Option B as separate commits; after §4 lands, stub-mode round-trip tests can go end-to-end even before Option B lands.

## 6. Open decisions (blockers for starting)

1. **Where do images actually live when dispatch is invoked?** We need a concrete answer before writing the upload cron:
   - (a) Still inside `drone_ingest_sessions.source_zip_path` (zipped) — needs server-side extraction step first.
   - (b) Already extracted into `drone_ingest_sessions.extracted_dataset_path` as individual files — read and upload directly.
   - (c) In `drone_datasets`-linked paths somewhere else — needs audit.
   
   Current codebase suggests (a) for browser-zip intakes and (b) for local-zip intakes, but the extraction path for browser-zip uploads isn't wired either. **Open question for Nathaniel: is mission-dataset extraction in scope for Phase C, or is the assumption that external ops extract ZIPs before dispatch?**

2. **Batch size for upload.** NodeODM's `/task/new/upload/:uuid` endpoint is per-image. Batching means multiple parallel HTTP requests. Tradeoff: parallelism vs. rate limits. Default: 10 parallel uploads per cron tick, no more than 50 images per tick.

3. **Upload concurrency with poll.** Both crons would touch the same job row. Options: (a) advisory lock in Postgres, (b) status-based gating (upload cron only processes `pending_upload`; poll cron only processes `queued|running|processing`). Default: (b) — simpler, no new infra.

4. **Failure + retry policy.** If `uploadImages` fails mid-batch, should we `cancelTask` + mark job failed, or leave it in `pending_upload` for the next tick? Default: retry 3 ticks (15 min), then `cancelTask` + mark `failed` with `nodeodm.task.upload_failed` event.

## 7. Testing strategy

- **Unit tests:** extend `dispatch-adapter-nodeodm.test.ts` with a mock `NodeOdmClient` that covers upload batch loop + commit. Test checkpoint resume (start from batch 3 of 5). Test failure after N retries.
- **Integration tests:** extend `api/internal/nodeodm-poll/route.test.ts` pattern — new `api/internal/nodeodm-upload/route.test.ts` using the shared stub. Drive the full `pending_upload → running → awaiting_output_import` state walk.
- **Stub-mode manual:** `AERIAL_NODEODM_MODE=stub` locally, dispatch a fake job, watch upload cron advance it via `/admin` panel (the panel already surfaces `lastPolledAt` — add `lastUploadedAt` if needed).
- **Real-mode manual:** runbook in `docs/ops/nodeodm-dev-loop-and-phase-c-runbook.md` §"Phase C runbook" covers this.

## 8. What NOT to do

- Don't implement Option A as the production path. The 300s timeout will bite on the first real dataset.
- Don't add Option C speculatively. Wait until Option B is proven and a real product need for browser uploads appears.
- Don't inline upload inside `launchNodeOdmTask`. That function is a pure launch; keeping it that way means §4 can ship + be tested independently.
- Don't block on Option B to ship §4. §4 alone is useful: it makes `nodeodm-direct` dispatch mode reach production for stub-mode tests and unblocks Phase C blocker #1.
- Don't assume the `extracted_dataset_path` is always populated. Decision #6.1 above has to be resolved first.
