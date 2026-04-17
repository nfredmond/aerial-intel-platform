# Aerial Operations OS — Phase E + F + G Ship Evidence

_Date: 2026-04-16 (late evening PT; commits + CI in UTC 2026-04-17 early morning)_

Reference plan: `.claude/plans/cheeky-questing-tome.md` ("What's next" post-ship arc). Phases E (share-link observability), F (mission-version diff view), and G (NodeODM stub for CI) all landed on `main` in a single push.

## What was completed

### Phase E — Share-link observability on the admin console

1. **E.1 Query helpers.** Added `selectTopShareLinksByUsage(orgId, limit)` and `selectShareLinksNearExpiry(orgId, daysUntil)` to `web/src/lib/supabase/admin.ts`, right after `selectArtifactShareLinkByToken`. Both helpers follow the existing `adminRestRequest<T>` PostgREST URL style (not a builder). Ordering: top-used → `use_count.desc,last_used_at.desc.nullslast`. Near-expiry → `expires_at=not.is.null&expires_at=lt.<horizon>&revoked_at=is.null&order=expires_at.asc`.
2. **E.2 Admin UI.** Added two panels to `web/src/app/admin/page.tsx` (`TopShareLinksPanel`, `ExpiringShareLinksPanel`). Status pill uses the existing `shareLinkStatus(link)` from `web/src/lib/sharing.ts` with a local `shareLinkStatusTone` mapper (active → success, revoked → danger, expired + exhausted → warning). Both render under the existing `admin-table` CSS conventions — no new primitives were introduced. Fetched in the same `Promise.all` as memberships / entitlements / jobs / events so the page still renders in a single round-trip.
3. **E.3 Verification.** Added `web/src/lib/supabase/admin.test.ts` with 4 tests: URL shape assertions for `selectTopShareLinksByUsage` (org encoding, ordering, limit, method), return-shape passthrough, horizon-math + filter assertions for `selectShareLinksNearExpiry` under `vi.useFakeTimers()`, and a second horizon test at a fixed system time to verify the `daysUntil` arithmetic deterministically.

### Phase F — Mission-version side-by-side diff view

1. **F.1 JSON diff helper.** Added `web/src/lib/missions/version-diff.ts`. Exports `DiffChange`, `DiffEntry`, and `buildVersionDiff(left, right)`. Zero external deps — a ~100-line recursive walker that returns a flat list of `DiffEntry{path, left, right, change}` entries keyed by dot-path (`mission.geometry.coords[1][0]`). Arrays compared pairwise; length asymmetry flags added/removed slots. Both-undefined input returns `[]`; one-side-undefined root returns a single `added|removed` entry at path `""`.
2. **F.2 Compare UI.** Extended `web/src/app/missions/[missionId]/versions/page.tsx` with a "Compare versions" section (renders only when ≥ 2 versions exist). GET-form with two version `<select>` elements + a "hide unchanged rows" checkbox. URL state: `?compareLeft=<id>&compareRight=<id>&hideUnchanged=0|1`. Default selection = two most recent versions. Diff table is 4 columns (Path | Left | Right | Change) with tone-mapped status pills (added → success, removed → danger, changed → warning, unchanged → neutral).
3. **F.3 Verification.** Added `web/src/lib/missions/version-diff.test.ts` with 12 tests: deep-equal objects → all unchanged; add/remove at top; changed primitive; nested object dot-paths; array pairwise + length asymmetry (both directions); null-vs-missing flagged as `changed` (not removed); missing root handled; both-undefined → empty list; deep nested coords; empty-on-both → unchanged.

### Phase G — NodeODM stub for dispatch/poll/import CI

1. **G.1 Stub factory.** Added `web/src/lib/nodeodm/stub.ts`. `StubNodeOdmClient extends NodeOdmClient` so structural typing works for every current caller. In-memory task table keyed by UUID; `createTask` returns `stub-task-<seq>`. State machine: `queued (10) → running (20, on commitTask) → progress advances by `progressStep` (default 25) per taskInfo → completed (40)` at 100%. `cancelTask` flips to terminal `50`. `downloadAllAssets` returns an empty zip with `X-Stub-NodeODM: synthetic` header.
2. **G.2 Env switch + prod guard.** Extended `web/src/lib/nodeodm/config.ts`. Added `mode: "real" | "stub"` to `NodeOdmAdapterConfig`. Read via `AERIAL_NODEODM_MODE` env var. When `mode==="stub"`, `createConfiguredNodeOdmClient()` returns the stub — unless `NODE_ENV==="production"`, in which case it throws. Documented the new flag in `web/.env.example` with a one-line warning.
3. **G.3 Verification.** Added `web/src/lib/nodeodm/stub.test.ts` with 11 tests: full state-machine walk (queued → running → progress → completed); terminal stability (extra `taskInfo` calls don't advance past 40); cancel flips to 50 and blocks further progress; upload counts accumulate; `not_found` error on unknown uuid; synthetic zip response shape; `info` reflects queue size; mode switch returns stub when `AERIAL_NODEODM_MODE=stub`; mode switch throws when combined with `NODE_ENV=production`; real mode returns `null` without a URL; real mode returns a real `NodeOdmClient` when URL is set.

## Commit chain

| Phase | Commit | Subject |
| --- | --- | --- |
| E | `44a6e4b` | `feat(admin): link activity observability (Phase E)` |
| F | `0917f89` | `feat(missions): side-by-side version diff (Phase F)` |
| G | `d69310a` | `feat(nodeodm): in-memory stub for dispatch/poll/import (Phase G)` |

Push: all three commits went to `origin/main` in a single `git push` from `85df315..d69310a`.

## Verification

### Unit tests

Full vitest suite: **226 tests across 43 files, all green.** Before Phase E the baseline was 203 tests in 41 files — the net additions are:

- `src/lib/supabase/admin.test.ts`: +4 tests
- `src/lib/missions/version-diff.test.ts`: +12 tests
- `src/lib/nodeodm/stub.test.ts`: +11 tests

```
Test Files  43 passed (43)
     Tests  226 passed (226)
```

### Lint

`npm run lint` exits clean (eslint, no output).

### Typecheck

`npx tsc --noEmit` on the changed files (`admin.ts`, `admin/page.tsx`, `sharing.ts` touchpoint, `version-diff.ts`, `versions/page.tsx`, `nodeodm/stub.ts`, `nodeodm/config.ts`, `nodeodm/stub.test.ts`, `supabase/admin.test.ts`) reports **zero errors**. Pre-existing type errors in unrelated test fixtures (`dispatch-adapter.test.ts`, `job-retries.test.ts`, `managed-processing.test.ts`) are unchanged — they predate Phase E.

### CI

Pending at time of writing — the push landed at ~2026-04-17T04:38Z and `web-quality` + `web-e2e` each typically take ~2 minutes. CI gate is `.github/workflows/ci.yml` with the `web-e2e` job running Playwright chromium against the public showcase on main-push only.

## What this unlocks

- Operators on the `/admin` page can now see which share links are actually being used and which are about to expire without leaving the console.
- Mission operators can side-by-side diff any two version snapshots on `/missions/[id]/versions?compareLeft=…&compareRight=…`, closing the explicit "side-by-side diff remains deferred" line from the Phase 3.4 CHANGELOG entry.
- Future Phase C real NodeODM verification is now reducible to "replace stub with real" rather than "build the test harness from scratch." CI can exercise the full `dispatch-adapter-nodeodm.ts` → `/api/internal/nodeodm-poll` → managed-processing-import path against the stub without needing a Docker container or real imagery. An optional stretch (G.4 in the plan) to add `AERIAL_NODEODM_MODE=stub` into the `web-e2e` CI env remains open — the integration test in G.3 already covers the state machine, so the stretch is low priority.

## Remaining work from the plan

- **Phase C — real NodeODM round-trip.** Still deferred. Needs a local `opendronemap/nodeodm` container and 12+ overlapping EXIF photos.
- **Phase D — showcase preview.** Conditional on C.
- **Admin write actions (invite / pause / resume).** Still parked behind an email-service decision.
- **Auth-gated Playwright specs.** Still needs a dedicated test Supabase project.
