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
