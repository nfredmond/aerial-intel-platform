# Copilot audit events slice - 2026-04-20

This slice closes the operational visibility gap left after the support assistant and report-summary panels landed. It does not add autonomous write actions; it only records org-scoped evidence about copilot calls already made by authenticated users.

## What shipped

- `web/src/lib/copilot/audit.ts` centralizes event writes for copilot outcomes.
- Mission brief, processing QA, data scout, support assistant, and report summary server runners now record:
  - blocked calls after org context is known;
  - refused calls, including grounding sentence counts;
  - successful calls, including cited fact counts, spend, model, and token counts;
  - caught failures after org context is known.
- `/admin/copilot` now shows the recent `copilot.call.*` events beside quota history.
- `/api/admin/copilot/events` exports the same org-scoped audit trail as CSV for owner/admin review packets.
- `selectRecentCopilotEventsForOrg` reads org-scoped audit rows through the service-role admin helper.

## Event contract

Rows are inserted into `drone_org_events` with one of these `event_type` values:

- `copilot.call.succeeded`
- `copilot.call.refused`
- `copilot.call.blocked`
- `copilot.call.failed`

The payload keeps the data reviewers need for a defensible audit trail:

- `skill`, `status`, `targetType`, `targetId`
- `reason`, `modelId`
- `spendTenthCents`, `capTenthCents`, `remainingTenthCents`
- `totalSentences`, `keptSentences`, `droppedSentences`, `citedFactCount`
- `inputTokens`, `outputTokens`

Unauthenticated and no-org failures cannot be attached to `drone_org_events` without inventing tenant context, so they remain user-facing blocked responses only.

## Verification

Run from `web/`:

```bash
npm run test -- src/lib/copilot/audit.test.ts src/lib/supabase/admin.test.ts
npm run lint -- --quiet
npm run test
npm run build
```

Preview smoke should include one signed-in support assistant or report-summary call, then a reload of `/admin/copilot` to confirm a recent `copilot.call.succeeded` row appears with sentence/drop context.

The CSV export is read-only and authenticated through `getDroneOpsAccess` plus `admin.support`. It exports at most the latest 500 org-scoped copilot events and returns `Cache-Control: no-store`.

## 2026-04-20 validation

Code gates:

- `npm run test -- src/lib/copilot/audit.test.ts src/lib/supabase/admin.test.ts` - pass, 2 files / 35 tests.
- `npm run lint -- --quiet` - pass.
- `npm run test` - pass, 63 files / 408 tests.
- `npm run build` - pass.

Preview:

```text
https://aerial-intel-platform-82z2b3mpf-natford.vercel.app
```

Vercel deployment:

```text
dpl_8qcDz9ZdT9WHydpJVRjK4cEi1yaZ
```

Preview smokes:

- `AERIAL_E2E_BASE_URL=https://aerial-intel-platform-82z2b3mpf-natford.vercel.app AERIAL_E2E_SKIP_SERVER=1 npm run test:e2e` - pass, 2 public showcase tests and 1 skipped authenticated smoke.
- `AERIAL_E2E_AUTH_SMOKE=1 ... AERIAL_E2E_EXPECT_RASTER=1 npm run test:e2e -- authenticated-ops.spec.ts` - pass, including support-answer generation followed by `/admin/copilot` audit-panel verification for `support-assistant`, `succeeded`, sentence/drop counts, and authenticated CSV export.

## CSV export follow-up validation

Code gates:

- `npm run test -- src/lib/copilot/audit-export.test.ts src/app/api/admin/copilot/events/route.test.ts src/lib/supabase/admin.test.ts` - pass, 3 files / 35 tests.
- `npm run lint -- --quiet` - pass.
- `npm run test` - pass, 65 files / 414 tests.
- `npm run build` - pass.

Preview:

```text
https://aerial-intel-platform-2rrb9z3pp-natford.vercel.app
```

Vercel deployment:

```text
dpl_oAw27T1bHJRErG1wog2u5VeKbYSs
```

Preview smokes:

- `AERIAL_E2E_BASE_URL=https://aerial-intel-platform-2rrb9z3pp-natford.vercel.app AERIAL_E2E_SKIP_SERVER=1 npm run test:e2e` - pass, 2 public showcase tests and 1 skipped authenticated smoke.
- `AERIAL_E2E_AUTH_SMOKE=1 ... AERIAL_E2E_EXPECT_RASTER=1 npm run test:e2e -- authenticated-ops.spec.ts` - pass, including the authenticated `/api/admin/copilot/events?limit=20` CSV export check.
