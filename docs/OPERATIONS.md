# Operations

- Runtime ownership
- Alert routing
- On-call/escalation expectations

## Release gates

Use `docs/RELEASE_CHECKLIST.md` before production promotion. At minimum:

```bash
AERIAL_RELEASE_TARGET=production scripts/check_release_readiness.sh
AERIAL_TITILER_URL=https://titiler.example.com scripts/smoke_titiler.sh
```

Production raster delivery requires a controlled TiTiler service. The deployable
container and Cloud Run example live in `infra/titiler/`; `https://titiler.xyz`
is Preview-only evidence and must not be used as a production claim.

## Managed processing dispatch handoff (current truthful v1 lane)

Use this when a mission has a `managed-processing-v1` job and operator intake review is complete.

1. Open `/jobs/[jobId]`.
2. In **Managed-processing controls**, enter:
   - assigned host
   - optional worker / queue slot
   - external run reference
   - optional dispatch notes
3. Submit **Record dispatch handoff** only after the real compute-side launch/handoff has actually happened.
4. Confirm the job now shows:
   - processing stage
   - persisted external run reference
   - dispatch handoff metadata card
   - dispatch event(s) in the timeline
5. Do **not** start QA until real outputs are attached/imported.

Truth boundary: this lane records a real operator handoff in-app, but it still does not mean the web app itself launched NodeODM/ClusterODM automatically. That remains a later closure step.

## Dispatch adapter webhook lane (new first real adapter contract)

Use this when `AERIAL_DISPATCH_ADAPTER_URL` is configured in the web environment and you want the app to attempt the processing-host launch itself.

1. Open `/jobs/[jobId]` while the managed request is in `intake_review`.
2. In **Managed-processing controls**, complete the **Launch through configured adapter** form.
3. Submit **Launch via dispatch adapter**.
4. Confirm one of two truthful outcomes:
   - **Accepted:** job moves to `processing`, external run reference is persisted, and dispatch-adapter metadata appears on the page.
   - **Failed / unconfigured:** job stays in `intake_review`, adapter status/error is recorded, and no host dispatch is claimed.

Current contract:

- request contract version: `aerial-dispatch-adapter.v1`
- deterministic request id derived from job + host + worker
- expected success return: external run reference in JSON (`externalRunReference`, `external_run_reference`, `runId`, `run_id`) or `x-external-run-reference` header

Truth boundary: this is the first real app/API dispatch adapter slice, not yet a full worker-control plane.

## Dispatch adapter callback/status return leg (new truthful precursor)

Use this when the worker or adapter needs to send status back into the app after launch acceptance.

1. POST to `/api/dispatch/adapter/callback`.
2. Authenticate with `Authorization: Bearer <AERIAL_DISPATCH_CALLBACK_TOKEN>`.
   - If no dedicated callback token is configured, the route falls back to `AERIAL_DISPATCH_ADAPTER_TOKEN`.
3. Send `contractVersion = "aerial-dispatch-adapter-callback.v1"` with:
   - `callbackId`
   - `requestId`
   - `callbackAt`
   - `orgId`
   - `job.id`
   - `status` (`accepted`, `running`, `awaiting_output_import`, `failed`, or `canceled`)
4. Include optional worker context when available:
   - `externalRunReference`
   - `progress`
   - `workerStage`
   - `message`
   - `dispatch.hostLabel`
   - `dispatch.workerLabel`
   - `metrics.queuePosition`
   - `metrics.startedAt`
   - `metrics.finishedAt`
5. Confirm the truthful outcome in `/jobs/[jobId]`:
   - dispatch adapter card shows callback status / last callback / worker stage / reported progress
   - timeline records a `job.dispatch.callback.*` event
   - job status/stage update only as far as the callback truly supports

Truth boundary:

- `accepted` / `running` mean worker-side processing is underway.
- `awaiting_output_import` means compute may be complete, but the app still needs a real import/attach step before QA or delivery-ready status can be claimed.
- `failed` / `canceled` record worker-side terminal state honestly.
- This is the first honest return leg, but broader retry logic and richer fleet-wide synchronization are still future work.
