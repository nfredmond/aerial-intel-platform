# Dispatch adapter contract

The webhook dispatch adapter lets an operator run compute off-box while the app
tracks it truthfully. It is **additive** to NodeODM-direct dispatch and to the
OpenPlan `natford-aerial-processing.v1` worker API — operators can use whichever
compute path fits. Both contract versions below are **stable**: add new fields as
a new version (`v2`), never mutate an existing version's shape.

## Outbound launch — `aerial-dispatch-adapter.v1`

When `AERIAL_DISPATCH_ADAPTER_URL` is configured, `/jobs/[jobId]` can attempt a
real managed launch during intake review. The app POSTs:

- `contractVersion = "aerial-dispatch-adapter.v1"`
- a deterministic `requestId`
- org / job / project / mission / dataset identifiers and names
- requested host / optional worker / dispatch notes

Auth (optional): `Authorization: Bearer <AERIAL_DISPATCH_ADAPTER_TOKEN>`.

A successful response must return an external run reference, via JSON
(`externalRunReference`, `external_run_reference`, `runId`, or `run_id`) or the
`x-external-run-reference` response header. Failed/unconfigured launches are
recorded honestly — the app does not claim compute started.

## Inbound status — `aerial-dispatch-adapter-callback.v1`

- Route: `POST /api/dispatch/adapter/callback`
- Auth: `Authorization: Bearer <AERIAL_DISPATCH_CALLBACK_TOKEN>` (falls back to
  `AERIAL_DISPATCH_ADAPTER_TOKEN` when no dedicated callback token is set).
- Required fields: `contractVersion`, `callbackId`, `requestId`, `callbackAt`,
  `orgId`, `job.id`, `status`
  (`accepted | running | awaiting_output_import | failed | canceled`).
- Optional fields: `externalRunReference`, `progress`, `workerStage`, `message`,
  `dispatch.hostLabel`, `dispatch.workerLabel`, `metrics.queuePosition`,
  `metrics.startedAt`, `metrics.finishedAt`.

Example:

```json
{
  "contractVersion": "aerial-dispatch-adapter-callback.v1",
  "callbackId": "cb-20260406-0007",
  "requestId": "dispatch-job-123-single-host-odm-01-default",
  "callbackAt": "2026-04-06T18:30:00.000Z",
  "orgId": "org-1",
  "job": { "id": "job-123" },
  "externalRunReference": "odm-20260406-gv-downtown",
  "status": "awaiting_output_import",
  "progress": 90,
  "workerStage": "nodeodm:complete",
  "message": "Compute finished; upload/import the real outputs before QA.",
  "dispatch": { "hostLabel": "single-host-odm-01", "workerLabel": "docker-worker-2" },
  "metrics": { "startedAt": "2026-04-06T18:05:00.000Z", "finishedAt": "2026-04-06T18:29:30.000Z" }
}
```

## Truth boundary

- `accepted` / `running` → app syncs worker status, progress, and timeline.
- `awaiting_output_import` → app records worker-side compute completion **without**
  claiming QA or delivery-ready state; outputs still need a real import/attach step
  before QA/delivery can close.
- `failed` / `canceled` → app records the worker-side terminal state honestly.

This is a single-adapter contract, not a full worker orchestration/control plane.
The proxy/middleware matcher excludes `/api/dispatch/adapter/callback` — its auth
is the bearer token above, never the session cookie.
