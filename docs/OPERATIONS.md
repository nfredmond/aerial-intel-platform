# Operations

- Runtime ownership
- Alert routing
- On-call/escalation expectations

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

Truth boundary: this is the first real app/API dispatch adapter slice, not yet a full worker-control plane. Broader worker retries, callbacks, and status synchronization still remain to be built.
