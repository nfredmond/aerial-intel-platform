# `aklvm4c7y` Preview disposition - 2026-04-24

Purpose: close the residual Wave 2.5 question about why
`https://aerial-intel-platform-aklvm4c7y-natford.vercel.app` rendered a
mission brief without visible `[fact:*]` citations and did not write a current
`copilot.call.*` audit row.

## Vercel metadata

`vercel ls aerial-intel-platform --scope natford --format=json` identified
`aklvm4c7y` as a Preview deployment from a non-main branch:

- URL: `aerial-intel-platform-aklvm4c7y-natford.vercel.app`
- Created: `2026-04-22T04:20:30.262Z`
- Git ref: `bart/2026-04-21-main-reconcile`
- Commit: `b6b02df41a45e3c1d89e94ec8d29114df59b7472`
- Commit message: `docs: record preview copilot QA and mcp transport metadata`

That commit is not an ancestor of current `main`. Its merge base with `main`
is `9aeaf0f` from 2026-04-18, before the later review-hardening commits that
added copilot audit events and the citation-preserving grounding validator.

For comparison:

- Audit-capable Preview used for Wave 2.5 proof:
  `aerial-intel-platform-2rrb9z3pp-natford.vercel.app`, commit
  `fa300b06af3cb6bcb4434df677cf6f3acab1a424`, message
  `feat: audit copilot calls`.
- Production smoke target:
  `aerial-intel-platform-jqcd9ywgt-natford.vercel.app`, commit
  `e39b81a252bf3890e51d09cf976bd9ba89538ea8`.
- Current `main` after smoke docs:
  `d5359477d7f68c264b0703eb860135d97e6a6bfb`.

## Code explanation

The `aklvm4c7y` build contains the older grounding validator behavior:

- `web/src/lib/copilot/grounding-validator.ts` used
  `CITATION_RUN_PATTERN` and `stripCitations(...)`.
- `validateGrounding(...)` returned kept sentence text with citation tokens
  removed.
- `web/src/lib/copilot/mission-brief-server.ts` had no
  `recordCopilotAuditEventSafely(...)` calls, so successful mission briefs did
  not insert `drone_org_events` rows.

Current `main` preserves citation tokens in kept sentence text and records
`copilot.call.succeeded`, `copilot.call.refused`, `copilot.call.blocked`, and
`copilot.call.failed` events.

## Disposition

The mismatch is explained by a stale/non-main Preview deployment, not by a
current Production regression. Do not use `aklvm4c7y` as Wave 2.5 proof. Use
current Production or a fresh Preview from `main` for any future copilot
verification.

