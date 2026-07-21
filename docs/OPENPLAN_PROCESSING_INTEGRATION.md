# OpenPlan processing integration (natford-aerial-processing.v1)

Status: implemented 2026-07-21. This platform is OpenPlan's ODM processing
worker. The wire contract is `schemas/aerial_processing_contract.schema.json`,
committed identically to both repositories — treat that file as the single
source of truth and bump `schemaVersion` for any breaking change.

## Flow

1. **OpenPlan → Aerial** — OpenPlan POSTs a `ProcessingRequest` (signed
   imagery ZIP URL + `requestId` idempotency key + `callbackUrl`) to
   `POST /api/v1/processing-requests`, bearer-authenticated with
   `AERIAL_EXTERNAL_PROCESSING_TOKEN`. The endpoint validates the payload,
   claims the `requestId` in `drone_external_processing_requests`, creates the
   mission/dataset/ingest-session/job under the org named by
   `AERIAL_EXTERNAL_PROCESSING_ORG_SLUG` (project/site `external-<system>` are
   created on first use), and replies `202` with an `accepted`
   `ProcessingCallback` body carrying `jobReference`. Replays of the same
   `requestId` return `200` with the original `jobReference` and create
   nothing. The job's `external_job_reference` column holds the `requestId`;
   its org-unique constraint is the database-level guard against double job
   creation.

2. **Ingest** — the `external-ingest` cron (`3-59/5 * * * *`) pulls the
   consumer's ZIP, streams it image-by-image into
   `<org>/missions/<missionId>/extracted/<sessionId>` (same layout as operator
   ZIP intake), marks the session `extracted`, launches the NodeODM task, and
   flips the job to `running`/`intake_review`. From there the existing
   `nodeodm-upload` and `nodeodm-poll` crons drive the job exactly like a
   native one. Download/launch errors retry up to 3 attempts, then the job is
   failed. If NodeODM is unconfigured the cron pauses (no attempts burned).

3. **Aerial → OpenPlan** — lifecycle callbacks are POSTed to `callbackUrl`
   bearer-authenticated with `AERIAL_PROCESSING_CALLBACK_TOKEN`. The
   reconciler (`web/src/lib/external-processing-callbacks.ts`) compares each
   request row's `last_callback_status/progress` against its job and emits
   what's owed: `running` on transitions and progress changes, then one
   terminal `succeeded`/`failed`/`canceled`. A `succeeded` callback carries
   24-hour signed download URLs for every ready output (orthomosaic, DSM, DTM,
   point cloud, mesh) plus the run's `benchmarkSummary`. It runs from the
   `nodeodm-poll` completion path (immediate) and again as a catch-up sweep in
   `external-ingest` (upload-lane failures, user cancellations, missed
   deliveries — retried per tick, terminal deliveries abandoned after 8
   failed attempts with the error recorded on the row).

## Environment

| Where | Name | Meaning |
| --- | --- | --- |
| aerial | `AERIAL_EXTERNAL_PROCESSING_TOKEN` | inbound bearer for `/api/v1/processing-requests` (fails closed when unset) |
| aerial | `AERIAL_PROCESSING_CALLBACK_TOKEN` | outbound bearer on every `ProcessingCallback` |
| aerial | `AERIAL_EXTERNAL_PROCESSING_ORG_SLUG` | `drone_orgs.slug` that owns external work |
| openplan | `OPENPLAN_AERIAL_PROCESSING_WORKER_URL` | base URL of this platform |
| openplan | `OPENPLAN_AERIAL_PROCESSING_WORKER_TOKEN` | = `AERIAL_EXTERNAL_PROCESSING_TOKEN` |
| openplan | `OPENPLAN_AERIAL_PROCESSING_CALLBACK_BEARER_TOKEN` | = `AERIAL_PROCESSING_CALLBACK_TOKEN` |
| openplan | `OPENPLAN_AERIAL_PROCESSING_CALLBACK_URL` | public base origin OpenPlan hands out as `callbackUrl` |

Generate the token pair with `scripts/provision_openplan_integration_tokens.sh`.

## OpenPlan side (for reference)

Branch `feat/aerial-processing-contract` in `~/code/openplan`: dispatch route
`POST /api/aerial/missions/[missionId]/process` records the
`requestId → mission/workspace` mapping in `aerial_processing_jobs` before
calling this platform; callback route `POST /api/aerial/processing-callback`
validates payloads, dedupes on `callbackId`, and on `succeeded` writes the
`aerial_evidence_packages` row from the artifact list.

## Contract deviations to know about

- The contract's preset ids (`fast-preview`, `balanced`, `high-quality`) are
  deliberately abstract; the endpoint maps them to NodeODM presets
  (`fast-ortho`, `balanced`, `high-quality-3d`) in
  `web/src/lib/external-processing.ts`.
- `accepted` is delivered synchronously as the HTTP response body of the
  submit call, not as an async callback; async callbacks start at `running`.
