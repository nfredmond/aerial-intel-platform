# Changelog

## 2026-04-24 - TiTiler Cloud Run workflow wrapper added

Added `scripts/run_titiler_cloud_run_workflow.sh`, a one-command wrapper for
the manual controlled TiTiler Cloud Run deployment. The wrapper checks required
GitHub Actions variable and secret names, dispatches the workflow, and watches
the run without reading or printing secret values. It is intentionally blocked
until the real GCP repository variables and Workload Identity secrets exist.

## 2026-04-24 - Smoke-first Vercel TiTiler URL helper added

Added `scripts/configure_vercel_titiler_url.sh` so the final production raster
env step is executable once a controlled TiTiler URL exists. The helper rejects
unsafe production URLs before any write, smokes TiTiler against a public COG,
then writes `AERIAL_TITILER_URL` to Vercel and reruns the no-secret production
env-name preflight. It was not run against a placeholder endpoint.

## 2026-04-24 - Production Vercel cron/cap env names configured

Configured production Vercel env names for `CRON_SECRET` and
`AERIAL_COPILOT_DEFAULT_CAP_TENTH_CENTS=50000`, then redeployed Production so
the runtime receives them. First redeploy attempt failed because the stdin-added
`CRON_SECRET` carried trailing whitespace; it was overwritten through Vercel's
non-stdin value path and the replacement deployment
`https://aerial-intel-platform-abigvfvhv-natford.vercel.app` is `READY`.
No secret value was printed. The no-secret env-name preflight now reports only
`AERIAL_TITILER_URL` missing, so production raster delivery remains blocked on a
controlled TiTiler endpoint.

## 2026-04-24 - Vercel production env-name preflight added

Added `scripts/check_vercel_production_env_names.mjs`, a no-secret Vercel CLI
preflight that checks required production environment variable names without
requesting or printing values. CI now syntax-checks every `.mjs` script in
`scripts/`. Current live output against `natford/aerial-intel-platform`
correctly reports missing `CRON_SECRET`, `AERIAL_TITILER_URL`, and
`AERIAL_COPILOT_DEFAULT_CAP_TENTH_CENTS`, matching the release-readiness
blockers.

## 2026-04-24 - Release readiness env gate tightened

Tightened `scripts/check_release_readiness.sh` so it matches the production
release checklist: `CRON_SECRET`, `AERIAL_COPILOT_ENABLED`, and
`AERIAL_COPILOT_DEFAULT_CAP_TENTH_CENTS` are now explicit checks, copilot flags
and caps are validated, and production rejects the example Supabase URL plus
demo/local/plain-HTTP TiTiler endpoints. CI now syntax-checks every shell script
in `scripts/`. Current Vercel production env-name posture still lacks
`CRON_SECRET`, `AERIAL_TITILER_URL`, and
`AERIAL_COPILOT_DEFAULT_CAP_TENTH_CENTS`, so the production raster/release gate
remains intentionally blocked.

## 2026-04-24 - Authenticated smoke safety preflight added

Added `scripts/check_auth_smoke_prereqs.mjs` and wired it into the opt-in
`web-auth-smoke` CI job before dependency installation. The preflight requires
all fixture IDs and Supabase credentials, rejects the production alias as the
authenticated-smoke base URL, and requires
`AERIAL_E2E_CONFIRMED_DEDICATED_PROJECT=1` so service-role fixture writes are
not enabled by a single variable flip. Current repo posture remains disabled:
`AERIAL_E2E_AUTH_SMOKE_ENABLED=0`.

## 2026-04-24 - Vercel cron config reconciled

Reconciled root `vercel.json` and `web/vercel.json` so both schedule the same
three internal routes: proving heartbeat, NodeODM upload, and NodeODM poll.
Added `scripts/check_vercel_crons.mjs` to CI's validate-docs job so future
cron drift fails before deploy. Also corrected `web/.env.example` to list all
three cron routes and to state that `50000` tenth-cents equals `$50`.

## 2026-04-24 - Controlled TiTiler deploy preflight added

Added `scripts/check_titiler_deploy_prereqs.sh` and wired it into the manual
`Deploy TiTiler Cloud Run` workflow so the controlled raster-plane deployment
fails fast with exact missing GitHub Actions variable/secret names before Google
auth or Cloud Run deploy begins. Current ops finding: production Vercel still
has no `AERIAL_TITILER_URL`; the only TiTiler env var is the old branch-scoped
Preview setting, so production raster delivery remains intentionally unclaimed.

## 2026-04-24 - `aklvm4c7y` Preview mismatch explained

Closed the residual Wave 2.5 Preview question without spending another copilot call. Vercel metadata shows `https://aerial-intel-platform-aklvm4c7y-natford.vercel.app` was built from non-main branch `bart/2026-04-21-main-reconcile` at `b6b02df41a45e3c1d89e94ec8d29114df59b7472`, not from current `main`. That build predates the audit-event layer and used the older grounding validator that stripped `[fact:*]` tokens from kept sentence text before rendering. Disposition: stale/non-main Preview, not a current Production regression. Evidence: `docs/ops/2026-04-24-aklvm4c7y-preview-disposition.md`.

## 2026-04-24 - Production mission-brief smoke passed

Verified the current Production deployment `https://aerial-intel-platform-jqcd9ywgt-natford.vercel.app` with the passwordless admin magic-link OTP sign-in pattern. Mission `3ca2d074-0f00-4adf-b3a4-75f63a964a77` generated a cited mission brief with visible `[fact:*]` tokens, `8/8` sentences kept, `anthropic/claude-opus-4.7`, `74` tenth-cents spend (`$0.074`), no captured browser console/page errors, and a new `drone_org_events` audit row `470419a0-65c8-4aae-906f-60094a32d5cd` (`copilot.call.succeeded`, `skill=mission-brief`, `status=ok`). Evidence: `docs/ops/2026-04-24-production-copilot-smoke.md`.

## 2026-04-24 - Supabase leaked-password protection enabled

Closed #106 on project `bvrmnesiamadpnysqiqd`: enabled Supabase Auth leaked-password protection by setting `password_hibp_enabled=true` through the Management API, then reran:

```bash
supabase db advisors --linked --type security --output json --workdir . --agent=no
```

Result: `auth_leaked_password_protection` no longer appears. The only remaining security advisor rows are the expected PostGIS findings already dispositioned in `docs/ops/2026-04-19-supabase-advisor-state.md`: `rls_disabled_in_public` on `public.spatial_ref_sys` and `extension_in_public` for `postgis`.

Operational note: an attempted CLI `supabase config push` briefly applied local default Auth settings. Before verification, the remote Auth config was restored to the prior production site URL, redirect allow-list, TOTP MFA enabled state, email-confirmation posture, 60-second email frequency, and 8-character OTP length, with only `password_hibp_enabled` changed to `true`.

## 2026-04-24 - Wave 2.5 exit verification reconciled

Closed the remaining evidence loop against the current `main` state rather than the stale 2026-04-20 handoff snapshot. The repo was already clean with W2-C2 seed/changelog and MCP transport metadata committed, and copilot audit events were already shipped via `drone_org_events`.

- **Wave 1 raster:** localhost render check passed for Toledo-20 artifact `6c413396-7475-4010-a1fe-b90cbc22977a` with TiTiler `2.0.1` on `127.0.0.1:8000` and Next on `localhost:3000`. MapLibre canvas rendered, "Viewer not configured" was absent, multiple TiTiler tiles returned `200`, and no blocking console/page errors were captured.
- **Wave 2 C-1 happy path:** audit-capable Preview `https://aerial-intel-platform-2rrb9z3pp-natford.vercel.app` generated a cited mission brief for mission `3ca2d074-0f00-4adf-b3a4-75f63a964a77` with `6/7` sentences kept, `anthropic/claude-opus-4.7`, `74` tenth-cents spend, and a `copilot.call.succeeded` `mission-brief` audit row.
- **Grounding challenge:** support assistant ignored a prompt-side "surveyed on Mars" injection, returned only grounded TiTiler/raster facts, kept `2/2` sentences, and inserted a `copilot.call.succeeded` `support-assistant` audit row. This proves resistance to that prompt, not a refusal branch.
- **Cap exhaustion:** with explicit chat approval, the April quota row was temporarily set to cap, one mission-brief call refused pre-call with the visible `$50.000 of $50.000` quota message, and `/admin/copilot` recorded `copilot.call.blocked` with `reason=quota-exhausted`; the row was restored to `698` tenth-cents afterward.

Truthfulness note: the latest listed Preview `aklvm4c7y` was not used as the exit proof target because it rendered mission-brief text without visible `[fact:*]` citations and did not insert a current audit row, despite updating spend. A linked Security Advisor check during the Wave 2.5 reconciliation showed `auth_leaked_password_protection` still present as a WARN; it was closed later on 2026-04-24 in the entry above.

## 2026-04-19 — Wave 2 C-2 exit: processing-QA diagnostic verified end-to-end on Preview

First live copilot run against a Vercel Preview deployment. Seeded a synthetic failed NodeODM job on `nat-ford-drone-lab` (`supabase/seed/2026-04-19-synthetic-failed-job.sql` — job id `11111111-1111-4111-8111-111111111111`, attached to the Downtown corridor mission so Toledo-20's verified-success posture stays clean, `output_summary->>'synthetic' = 'true'` for greppability). Signed in the test owner via admin-generated magic-link OTP → direct `/auth/v1/verify` POST → `supabase.auth.setSession` in the Preview origin, which is a clean passwordless path that bypasses local dev entirely.

The diagnostic output cited every seeded fact — exit code 137, `--feature-quality high` on 20 images, feature-extraction failed at 18%, ingest + preflight green, matching/reconstruction/orthomosaic never started, no orthophoto/DEM/report produced — and inferred the OOM-killer root cause from the seeded `logTail` (`[feature_extraction] OOM killer signaled by host`) plus domain knowledge that exit 137 is `128 + SIGKILL`. Suggested mitigation (`--feature-quality medium`, `--min-num-features 4000`) is framed as a retry suggestion, not a claim of fact. Overlap advice is hedged with "if the lighter preset still fails." No hallucinated root causes. Grounding validator reports `5/5 sentences kept`; spend landed at **$0.070** on `anthropic/claude-opus-4.7` and is recorded in `drone_org_ai_quota` (70 of 50000 tenth-cents). Zero console errors, zero warnings.

Closes #92. Covenant-truthfulness gate held: the skill cited real facts, hedged uncertainty, and the spend accounting round-tripped correctly.

## 2026-04-19 — Supabase security-advisor disposition

Worked the three items surfaced by `get_advisors(security)` on project `bvrmnesiamadpnysqiqd`. Result is honest, not pretty: one is a real fix carried over from the RLS recursion work, two are not fixable in place on a hosted Supabase DB, one requires a dashboard click.

- **`rls_disabled_in_public` on `public.spatial_ref_sys` (ERROR)** — `ALTER TABLE public.spatial_ref_sys ENABLE ROW LEVEL SECURITY` errors with `42501: must be owner of table spatial_ref_sys` because the table belongs to the PostGIS extension; forcing it through would break every geometry query. Dismissed as false positive.
- **`extension_in_public` for `postgis` (WARN)** — `ALTER EXTENSION postgis SET SCHEMA extensions` errors with `0A000: extension "postgis" does not support SET SCHEMA` (PostGIS declares itself non-relocatable). The only in-place alternative is `DROP EXTENSION postgis CASCADE; CREATE EXTENSION postgis SCHEMA extensions`, which would cascade through every `geometry` column in `drone_datasets`, `drone_missions`, and `drone_sites` and destroy data. Not worth it for an advisory warning. Dismissed.
- **`auth_leaked_password_protection` (WARN)** — enables HaveIBeenPwned check for Supabase Auth signups. Not reachable through the Supabase MCP surface (no Auth-config tool); originally flagged in `docs/ops/2026-04-19-supabase-advisor-state.md` with the dashboard click path. Closed on 2026-04-24 through the Management API and verified with the linked Security Advisor.

Added a risk-register row capturing the PostGIS-in-public posture and the conditions under which it could be revisited (new Supabase project from scratch with `CREATE EXTENSION postgis SCHEMA extensions` on day one). Added `docs/ops/2026-04-19-supabase-advisor-state.md` so the next audit doesn't repeat the diagnosis.

No DDL merged. The earlier-authored `20260420000003_move_postgis_to_extensions_schema.sql` was deleted after it hit the `0A000` error against the live DB — it was never applied to the ledger.

## 2026-04-19 — Wave 1 exit: Toledo-20 raster pipeline verified end-to-end

Wave 1 raster viewer claim is honest: the full path from Supabase Storage → signed URL → TiTiler `/cog/info` + `/cog/WebMercatorQuad/tilejson.json` + `/cog/preview.png` renders real pixels for artifact `6c413396-7475-4010-a1fe-b90cbc22977a`. TiTiler reports 3-band uint8 RGB, EPSG:32617 (UTM Zone 17N, Toledo OH), 5107×5905, overviews 2/4/8/16, driven off a 7.8 MB COG derived from the NodeODM task `8dda4117-a73d-4acb-914d-4342b32de64b` orthophoto with a `gdal_translate -of COG -co COMPRESS=JPEG -co QUALITY=85` derivative recorded in the artifact metadata. Browser-side MapLibre rendering of the same artifact is authored but still awaits a signed-in hands-on check — called out explicitly rather than claimed.

Also landed `supabase/migrations/20260420000002_fix_drone_memberships_rls_recursion.sql`: the 2026-03-04 `members_can_read_memberships` policy self-referenced `drone_memberships` in its USING clause and was throwing "infinite recursion detected in policy" on sign-in once the staging schema had the full DroneOps surface applied. Replaced with `users_read_own_memberships` (`user_id = auth.uid()`); admin UIs and invitation-accept already read cross-member state through service-role `adminRestRequest` which bypasses RLS, so no app-level change.

`docs/ODM_PLUS_COMPARISON_MATRIX.md` now includes a "Shipped now (Wave 1 + Wave 2)" section that lists the raster viewer, comments + approvals, share links, handoff workflow, benchmark evidence, the three Aerial Copilot skills, the `/admin/copilot` spend dashboard, and `/admin/people` invitations with the ADR-003 boundary — so client-facing copy on natfordplanning.com can reference these capabilities without caveat.

## 2026-04-19 — Security: scope invitation revoke by org (IDOR fix)

`updateInvitationStatus(id, patch)` filtered the PATCH only by invitation id, which meant `revokeInvitationAction` could flip any invitation row to `revoked` before its post-update `row.org_id !== orgId` check ran — an admin of org A could revoke a pending invitation belonging to org B. Caught during `/review` of the Wave 2.5 bridge slice.

- **Helper signature.** `updateInvitationStatus(id, orgId, patch)` in `web/src/lib/supabase/admin.ts` — PostgREST filter is now `id=eq.X&org_id=eq.Y`, so no row matches and no UPDATE fires when an admin submits an invitation id from a different org.
- **Callers.** `revokeInvitationAction` (`web/src/app/admin/people/actions.ts`) passes the admin's `orgId`; `/invitations/[token]/page.tsx` (expire + accept) passes `invitation.org_id` from the token-scoped lookup.
- **Tests.** Existing `updateInvitationStatus` test updated to assert the `org_id` filter; new test covers the cross-org revoke attempt and asserts the helper returns null without mutating. Full web suite 371/371.

## 2026-04-19 — Wave 2.5 Track D: data-cleaning scout (W2-C3, Haiku)

Third Aerial Copilot skill on main. The scout inspects a dataset's `metadata.per_image_summary[]` with deterministic rules (missing-gps / missing-exif / missing-timestamp / low blur variance / duplicate basename) and asks Haiku 4.5 for one grounded paragraph explaining what the planner should do before dispatch. Every sentence cites a `[fact:<id>]` drawn from the per-image aggregates — same narrow-grounded contract as mission-brief and processing-QA.

- **Lib modules.** `web/src/lib/copilot/data-scout.ts` (orchestration + grounding, default model `anthropic/claude-haiku-4.5` — first use of the Haiku routing path), `data-scout-facts.ts` (deterministic classification, blur threshold 80, only explicit negatives trigger flags — unknown fields stay unknown), `data-scout-server.ts` (auth + quota + spend-record cascade, matches mission-brief-server / processing-qa-server shape).
- **UI.** `web/src/components/copilot/data-scout-panel.tsx` + server action at `web/src/app/datasets/[datasetId]/copilot-actions.ts`. Panel mounted on `/datasets/[datasetId]` between the callout and the detail grid; shows blocked/refused reasons, the grounded summary, and up to 10 per-image flags with kind + measured detail. Scout is advisory — it never blocks dispatch.
- **RBAC.** New `copilot.scout` DroneOps action, analyst+ (same tier as `copilot.generate`). Added to `ANALYST_WRITE_ACTIONS` matrix; vitest assertions updated.
- **Tests.** 11 new vitest cases: `data-scout.test.ts` (5) covers ok path, hallucination refusal (>30% dropped), empty-output refusal, too-short refusal, and Haiku pricing math (1/5 tenth-cents per MTok → 1000/500 token call = 4 tenth-cents). `data-scout-facts.test.ts` (6) covers all-clean → no flags, each flag kind, low-variance threshold boundary, duplicate-basename counting, unknown-field treatment, and per-image-length fallback when `image_count` is missing. Full copilot suite now 42/42; full web suite 370/370.
- **Scope note.** The scout reads whatever the ingest pipeline already populates in `dataset.metadata.per_image_summary[]`. No changes to the ingest pipeline itself in this slice — when ingest later starts writing richer per-image fields, the scout lights them up automatically.

## 2026-04-19 — Copilot provider: route through Vercel AI Gateway (ADR-002 revised)

Reversed ADR-002 Decision 3 one day after accepting it. Aerial Copilot now routes through Vercel AI Gateway instead of the direct `@ai-sdk/anthropic` provider. The migration cost was trivial (model-id format change, one env swap, one mock removal) and buys provider-swap-by-env plus unified spend attribution when C-3 or a future multi-provider experiment lands.

- **Skill modules.** `web/src/lib/copilot/{mission-brief,processing-qa}.ts` drop the `@ai-sdk/anthropic` import and pass model id as a string to `generateText`. The AI SDK's default global provider is AI Gateway, so no provider import is needed.
- **Model ids.** `pricing.ts` `CopilotModelId` moves from `"claude-opus-4-7" | "claude-haiku-4-5-20251001"` to `"anthropic/claude-opus-4.7" | "anthropic/claude-haiku-4.5"` (gateway canonical form, dots not hyphens). Model ids were fetched from `https://ai-gateway.vercel.sh/v1/models` at code-write time per skill guidance. Anthropic pricing numbers are unchanged — the gateway passes through at cost.
- **Auth.** `config.ts` `hasApiKey` now checks `AI_GATEWAY_API_KEY` first, then falls back to `VERCEL_OIDC_TOKEN` so Vercel deployments auto-authenticate without an explicit key. `.env.example` updated. `ANTHROPIC_API_KEY` is no longer read anywhere.
- **UI strings.** Both copilot panels now say "AI Gateway credentials" instead of "Anthropic API key" in the `missing-api-key` blocked state.
- **Dep graph.** `@ai-sdk/anthropic` removed from `package.json` (no remaining imports).
- **Tests + verification.** 31/31 copilot vitest cases green, typecheck clean, eslint clean on all changed files.
- **Docs.** `docs/ADR/ADR-002-aerial-copilot.md` Decision 3 rewritten with the revised posture; original decision preserved in a "Superseded decision" block so the reversal is traceable. `docs/AI_DISCLOSURE.md` updated to name AI Gateway as the routing layer.

## 2026-04-18 — Wave 2 copilot: mission-brief + processing-QA skills (W2-C1, W2-C2)

First two Aerial Copilot skills on main. Both follow the narrow-grounded pattern locked by `docs/ADR/ADR-002-aerial-copilot-architecture.md`: citation-gated output via `[fact:<id>]` tokens, integer-tenth-cent spend cap per org per month, default-off per org, direct Anthropic SDK (not AI Gateway). Feature-flag stack: `AERIAL_COPILOT_ENABLED` env + `drone_org_settings.copilot_enabled` per-org toggle + `copilot.generate` RBAC action (analyst+).

- **Shared foundations (W2 base).** `supabase/migrations/20260418000002_drone_org_settings_and_ai_quota.sql` adds `drone_org_settings.copilot_enabled` and `drone_org_ai_quota` (unique on `org_id,period_month`). New lib modules: `web/src/lib/copilot/{config,pricing,grounding-validator,quota}.ts`. Grounding validator segments on sentence-terminal punctuation, extracts `[fact:<id>]` citations into a set, and drops any sentence whose citations don't resolve against the provided fact registry. Pricing table covers Opus + Haiku input/output rates in integer tenth-cents.
- **W2-C1 Mission-brief generator.** `web/src/lib/copilot/{mission-brief,mission-brief-facts,mission-brief-server}.ts`. Server action at `web/src/app/missions/[missionId]/copilot-actions.ts`; client panel at `web/src/components/copilot/mission-brief-panel.tsx` mounted on `/missions/[missionId]` between the status dashboard and the detail grid. One-click generation of a ~250-word client-ready brief; copy-to-clipboard + download as `${missionName}_brief.md`. Refuses if >30% of sentences fail grounding or the grounded output is under 200 chars.
- **W2-C2 Processing-QA assistant.** `web/src/lib/copilot/{processing-qa,processing-qa-facts,processing-qa-server}.ts`. Server action at `web/src/app/jobs/[jobId]/copilot-actions.ts`; client panel at `web/src/components/copilot/processing-qa-panel.tsx` mounted on `/jobs/[jobId]` above the Benchmark evidence section. System prompt includes a short hardcoded rubric of ODM failure patterns (overlap, GCPs, feature extraction, low-light blur, exit-code-0-with-missing-outputs) and requires every sentence to cite facts from benchmark summary, stage checklist, NodeODM task info, or output presence map. Panel is gated by server-computed `copilotRelevant` (job failed / needs_review / `minimumPass=false` / succeeded-empty) so it doesn't bloat every job page.
- **Tests.** 31 vitest cases across the copilot suite — pricing (7), grounding-validator (9), mission-brief (5), mission-brief-facts (3), quota (3), processing-qa (4). All green.
- **Still outstanding for Wave 2 exit.** `ANTHROPIC_API_KEY` needs to be added to staging and `drone_org_settings.copilot_enabled` flipped for Nat Ford's own org before the live verification runs (task #90 for brief hallucination-injection + 5-cent cap; task #92 for the QA diagnostic on a real or synthetic Toledo failure). C-3 data-cleaning scout is not yet started.
- **AI disclosure.** New `docs/AI_DISCLOSURE.md` documents the grounding guarantee, model selection, spend governance, and the limitation envelope per the Nat Ford Operating Covenant.

## 2026-04-18 — Wave 1 delivery: copy-to-storage, comments/approvals, TiTiler raster viewer

Closes the first three Wave-1 slices of the 2026-04-18 strategic plan. The delivery pillar is now honest: real outputs are durable in Supabase Storage, reviewers can comment + approve without leaving the artifact page, and a TiTiler-backed raster preview lets planners see the ortho/DSM/DTM at the same URL they'll share with the client.

- **W1-A Copy-to-storage.** `web/src/app/api/internal/nodeodm-poll/route.ts` → `importCompletedOutputs` now downloads each canonical output byte stream, uploads to `drone-ops/${orgSlug}/jobs/${jobId}/outputs/${kind}/…`, inserts `drone_processing_outputs` rows (`status=ready`), and merges `storage.{bucket,path}` refs into `output_summary.*`. Poll patch includes `copiedToStorageCount` + `storageBucket` alongside the synthesized benchmark summary. Test fixture exercises the full flow end-to-end against a synthetic NodeODM bundle.
- **W1-C Comments + approvals.** New migration `supabase/migrations/20260418000001_drone_artifact_comments_approvals.sql` — `drone_artifact_comments` (threaded, tenant-safe composite FK) and `drone_artifact_approvals` (decision in {`approved`, `changes_requested`}) with RLS member-read policies + updated_at triggers. New admin helpers in `web/src/lib/supabase/admin.ts`. New DroneOps actions `artifacts.comment` and `artifacts.approve` (analyst+ can exercise; viewer can still read). `web/src/app/artifacts/[artifactId]/page.tsx` grows a comments thread + approvals log + inline forms, emits `artifact.comment.posted` / `artifact.approval.{approved,changes_requested}` events, and gates the "Mark exported" transition on a latest `approved` decision. Callouts added for all new action outcomes.
- **W1-B TiTiler raster viewer.** New `web/src/lib/titiler/{config,client}.ts` — `AERIAL_TITILER_URL` env + URL builders for `/cog/tiles/WebMercatorQuad/{z}/{x}/{y}.{png,webp,jpg}`, `/cog/bounds`, `/cog/info`, and `/cog/<tms>/tilejson.json`, with 7 unit tests pinning URL encoding, default TMS, rescale + colormap params, and bounds-fetch success/error paths. New `web/src/components/raster-viewer.tsx` client component — MapLibre GL JS + raster source pointing at the TiTiler tile template, pan/zoom + opacity slider, graceful fallback basemap when `NEXT_PUBLIC_MAPLIBRE_STYLE_URL` is unset. Artifact page mounts the viewer for COG-kind outputs (`orthomosaic`, `dsm`, `dtm`, `dem`) when the output is `ready`, `storage_path` is populated, and TiTiler is configured; passes a short-lived (6 h) Supabase signed URL as the `?url=` param so TiTiler never needs Supabase creds. Runbook: `docs/ops/titiler-setup.md` covers local Docker one-liner, NodeODM co-located compose, production co-location guidance, and tile verification via the browser Network tab.
- **W1-D Version diff UI.** Was already shipped earlier — the 4-column diff at `/missions/[missionId]/versions` with `compareLeft`/`compareRight`/`hideUnchanged` querystring controls covers the plan's "left | changed | right | review-status" layout. No new code in this slice; marked complete in the Wave 1 tracker.
- **Still outstanding for Wave 1 exit.** Stand up the TiTiler Docker sidecar on the dev host beside NodeODM and exercise the Toledo-20 ortho through it (the code path is verified; the evidence loop needs a running TiTiler instance). After that, the public comparison matrix can be updated to honestly claim "raster viewer: yes" and "client-portal comments: yes".

## 2026-04-18 — Real-mode NodeODM output adapter + Toledo round-trip staging

The load-bearing code change that unblocks real-mode NodeODM: the auto-import path shipped earlier today assumed `benchmark_summary.json` is present in the completed-task zip, but that file is a stub/scripted-benchmark invention — real `opendronemap/nodeodm` output bundles don't emit it. Without an adapter, every real-mode job would terminate at `awaiting_output_import`. This slice closes that gap code-side and stages the infrastructure for the first real round-trip; actual round-trip execution is still gated on local `.env.local` Supabase credentials being available.

- **Real-output adapter.** New `web/src/lib/nodeodm/real-output-adapter.ts` — `inventoryNodeOdmBundle(entries)` reads canonical ODM output paths (`odm_orthophoto/odm_orthophoto.tif`, `odm_dem/{dsm,dtm}.tif`, `odm_georeferencing/odm_georeferenced_model.laz` + `entwine_pointcloud/ept.json` fallback, `odm_texturing/odm_textured_model_geo.obj` + non-`_geo` fallback) and `synthesizeBenchmarkSummary(inventory, {taskUuid, importedAt})` builds a snake_case record that round-trips through `parseManagedBenchmarkSummaryText` without throwing. Required-outputs gate is `orthophoto + dsm both present and non-zero`, matching `run_odm_benchmark.sh`; when absent, status falls to `partial`. 12 unit tests cover per-path inventory, variant acceptance (`_geo` preferred when both mesh variants present), zero-byte retention, and full/partial/empty status branches.
- **Poll route.** `web/src/app/api/internal/nodeodm-poll/route.ts` → `importCompletedOutputs` now branches on `benchmark_summary.json` presence. Stub/scripted path is unchanged; real-mode path synthesizes via the adapter, re-parses through `parseManagedBenchmarkSummaryText` to keep one source of truth for `outputs` shape. Bundles with neither the summary file nor any recognized ODM output throw — the job stays `awaiting_output_import` with `lastImportError` populated rather than silently "succeeding" on an unusable zip. +1 integration test walks a fixture built via `fflate.zipSync` with TIFF + LAS magic bytes at the canonical paths and asserts `succeeded` + `benchmarkSummary.source=nodeodm-real-bundle` + `qa_gate.required_outputs_present=true`.
- **Runbook.** `docs/ops/nodeodm-dev-loop-and-phase-c-runbook.md` rewritten to reflect state-after: Gap 1 (upload cron) + Gap 3 for real mode are closed, replaced the "when blockers clear" section with a concrete real-mode Toledo runbook, documented the port 3101 deviation (3001 is held by `opengeo-martin` on this dev host) and the user-defined bridge network `aerial-nodeodm-net` (the default Docker bridge network is non-functional for host→container traffic here).
- **Infrastructure staged (not yet exercised end-to-end).** `opendronemap/nodeodm:latest` running at `http://localhost:3101`. `odm_data_toledo` cloned to `~/.openclaw/workspace/datasets/odm_data_toledo` (87 JPGs, ~428 MB). 20-image subset staged at `~/toledo-20.zip` (~97 MB, filenames `1JI_0062.JPG`–`1JI_0081.JPG`). **Toledo license posture:** GitHub API on `OpenDroneMap/odm_data_toledo` confirms `license: null` — no assertion from upstream. Plan's CC-BY-SA 4.0 assumption was wrong. Toledo is fine for internal round-trip + private evidence; any publicly-published derived imagery (natfordplanning.com showcase) should use a differently-licensed dataset or get explicit clarification from the OpenDroneMap org.
- **Still outstanding.** The canonical benchmark artifact listed on the project brief is still not produced — R-3 execution (UI upload → extract → dispatch → upload cron → poll → auto-import on a real Toledo run) is blocked on `web/.env.local` being populated with real Supabase creds; per plan constraint, credentials will not be guessed. R-4 evidence doc (`docs/ops/2026-04-XX-phase-c-real-mode-evidence.md`) lands after R-3 executes successfully.

## 2026-04-18 — ODM benchmark pipeline hardening (PR #7 → main)

Landed the deterministic benchmark-pipeline-hardening work from PR #7 (open 50+ days, base diverged by 176 commits so a clean merge was not possible). Cherry-picked `scripts/run_odm_benchmark.sh` + the dated progress note; the stale PR-side doc updates (README / LAUNCH_STATUS_REPORT / SAMPLE_DATASET_BENCHMARK_PROTOCOL) were not carried forward because their base state moved significantly after the PR was opened.

- **Hardened `scripts/run_odm_benchmark.sh`:** `--preflight-only` mode; dataset-contract validation (`images/` + supported extensions); Docker daemon reachability check; disk-headroom gate (`MIN_FREE_GB`, default 40GB); pinned `opendronemap/odm:3.5.5`; deterministic argument mode (`ODM_EXTRA_ARGS`) with explicit legacy override (`ODM_ARGS`); richer artifacts (`preflight.txt`, `output_inventory.tsv`, expanded `summary.json`).
- **Review-applied fixes on top of the PR version:**
  - Portable file-size wrapper (`file_size()` — prefers GNU `stat -c%s`, falls back to BSD/macOS `stat -f%z`); replaces the two hard-coded GNU-only `stat -c%s` calls in the output inventory.
  - Failed preflight writes a `preflight.txt` artifact with `preflight_status=failed` + `failure_reason=…` (dataset missing, images folder missing, images empty, docker unreachable, disk short) — operators no longer have to re-derive why a preflight bailed.
  - Mount-scope comment above the `docker run -v "${DATASET_PARENT}:/datasets"` line — documents that anything under `DATASET_PARENT` is visible to the container and warns against pointing `DATASET_ROOT` at `$HOME` or similarly broad paths.
  - Usage note that `ODM_ARGS` and `ODM_EXTRA_ARGS` are whitespace-split (no shell quoting support) — caught during review because the PR's deterministic mode silently word-splits these envs.
- **Progress note.** `docs/2026-02-25-benchmark-pipeline-hardening.md` — dated operator-facing writeup of the increment, kept at the PR's original authoring date.
- **PR #7 closed** with a pointer to this commit. No follow-up hardening rolled into this slice — sample dataset is still the blocker for actual benchmark evidence.

## 2026-04-18 — Phase C stub round-trip: extraction + auto-import

Closes the last two gaps blocking an end-to-end stub-mode NodeODM round-trip. An audit of the freshly-shipped Gap 1 §3 upload cron surfaced a hard gap: `drone_ingest_sessions.extracted_dataset_path` had no writer anywhere in the codebase, which meant the upload cron would always hit `skipped:no-session` in practice. The second gap was that poll stopped at `awaiting_output_import` — the synthetic `benchmark_summary.json` built in Gap 3 was never consumed.

- **Extraction.** New `web/src/lib/zip-extraction.ts` (`parseZipToImages`, `sanitizeStorageFilename`) — `fflate.unzipSync`, rejects `..` / `.` path traversal, flattens nested `images/foo.jpg` → `foo.jpg`, filters via `isImageFilename`, dedupes by basename, sorted output. 12 tests pin every rejection and acceptance rule.
- **Storage helper.** `uploadStorageBytes({path, bytes, contentType?, upsert?})` added to `admin-storage.ts` (parallel to the existing `downloadStorageBytes` / `listStorageObjects`).
- **Admin helper.** `updateIngestSession(id, patch)` + `IngestSessionPatch` type added to `admin.ts` (raw PostgREST URL pattern, matches `updateProcessingJob`).
- **Server action + UI.** New `extractIngestSession` server action on `/missions/[missionId]` mirrors `finalizeBrowserZipUpload` auth guards. Downloads the ZIP, flattens images into `${orgSlug}/missions/${missionId}/extracted/${sessionId}/`, uploads 10 parallel per chunk, then writes `{extracted_dataset_path, image_count, status: "extracted"}` on the session. Explicit "Extract dataset" button on the ingest-session card, gated on `source_zip_path` present, no prior `extracted_dataset_path`, and `role !== viewer`. New `?extract=...` callout branch covers recorded / no-images / already-extracted / missing-zip / missing-session / malformed-zip-path / denied / failed.
- **Auto-import.** `web/src/app/api/internal/nodeodm-poll/route.ts` extended: when a task hits `statusCode=40`, `downloadAllAssets` → `unzipSync` → pull `benchmark_summary.json` → `parseManagedBenchmarkSummaryText` → advance job to `status=succeeded / stage=completed` with `output_summary.nodeodm.{outputs, qaGate, benchmarkSummary, importedAt, importedFromTaskUuid}` populated. Emits `nodeodm.task.imported` alongside the existing `nodeodm.task.completed`. If the bundle lacks `benchmark_summary.json` or parse fails, falls back to `awaiting_output_import` with `lastImportError` — the cron keeps making forward progress on other cursors.
- **Tests.** +12 extraction, +1 poll fallback, updated existing poll integration walk to assert `succeeded` end-state + `output_summary.nodeodm.outputs` length 4 + `importedFromTaskUuid` + `nodeodm.task.imported` event. Added `@vitest-environment node` to the poll suite (jsdom mishandles `fflate` unzipSync round-trip, same trap as `stub.test.ts`).
- **Scope held.** Path-only import — output files stay referenced at their NodeODM asset paths for this slice; copy-to-storage is a follow-up for real-mode. No client-side extraction. No migration. No rework of `parseManagedBenchmarkSummaryText`. In-memory `unzipSync` caps ZIPs at ~500 MB — large-ZIP chunking is a follow-up.

Test + lint posture: 49 files / 293 tests green (+13 new); tsc baseline unchanged.

## 2026-04-17 — Gap 1 §3: NodeODM upload + commit cron

Closes §3 of `docs/ops/nodeodm-upload-gap-1-plan.md` — the upload-and-commit step that was blocking Phase C's real round-trip. `uploadImages` and `commitTask` have their first live callers. After this, `launchNodeOdmTask` → images → `commitTask` → poll → `awaiting_output_import` works end-to-end in stub mode, and is ready for a real dataset when the container is up.

- **Pure helpers.** New `web/src/lib/nodeodm-upload.ts` — `isImageFilename`, `extractNodeOdmUploadCursor`, `pickLatestSessionByMission`, `computeBatchSlice`, `shouldEscalateFailure`, `buildUploadCheckpointPatch`. 20 unit tests pin the 13-image single-tick, 75-image two-tick, exact-50 boundary, retry threshold, and sibling-preserving patch behavior.
- **Storage helpers.** `web/src/lib/supabase/admin-storage.ts` gains `downloadStorageBytes({path})` and `listStorageObjects({prefix, limit?})` with a `sortBy: name asc` default.
- **Cron route.** New `GET /api/internal/nodeodm-upload` mirrors the `nodeodm-poll` pattern (bearer/UA auth, unconfigured short-circuit, structured logging). Each tick finds jobs in `running/intake_review` with an unfinished `uploadState`, resolves the latest ingest session's `extracted_dataset_path` per mission, lists images, computes the next batch slice (cap 50/tick, 10 parallel per chunk), streams each image via Supabase Storage → `uploadImages`, and calls `commitTask` on the final slice. On failure it bumps `uploadRetryCount`; at threshold 3 it calls `cancelTask` and marks the job `failed`. Added to `vercel.json` with schedule `2-59/5 * * * *` (2 min offset from poll) and to the `proxy.ts` middleware allow-list.
- **Events.** `nodeodm.task.uploading`, `nodeodm.task.committed`, `nodeodm.task.upload_retrying`, `nodeodm.task.upload_failed` — mirror the existing `nodeodm.task.*` family.
- **Tests.** New `route.test.ts` (7 tests) walks the stub through: auth reject, no-cursor tick, 13-image single-tick commit, 75-image two-tick with mid-state resume, retry without escalation, retry escalation + cancel + status=failed, and no-session skip. Uses `@vitest-environment node` to match the stub suite.
- **Scope held.** Commit still happens inside the cron — no Workflow DevKit migration. `retryCount` is a persisted cross-tick counter in `output_summary.nodeodm`, not an in-process loop. The cron pattern matches the existing `nodeodm-poll` sibling. Gate remains status-based (upload cron only processes `running/intake_review`; poll cron only processes post-commit states), so the two crons never touch the same row simultaneously.

Test + lint posture: 48 files / 280 tests green (+7 from the upload route suite +20 from the pure helpers); lint clean; build clean; tsc baseline unchanged.

## 2026-04-17 — Gap 3: synthetic NodeODM stub outputs

Stub's `downloadAllAssets` now returns a real zip with 4 output-shaped entries (orthophoto / DEM / point cloud / mesh) plus a parseable `benchmark_summary.json` and a `logs/run.log` line. The synthetic summary validates cleanly through `parseManagedBenchmarkSummaryText`, so the managed import path can consume stub outputs end-to-end without a real NodeODM container.

- **New helper.** `buildSyntheticOutputZip(uuid, projectName)` in `web/src/lib/nodeodm/stub.ts` — deterministic, compiled with `fflate.zipSync`, emits 6 entries sized for `qa_gate.minimum_pass: true`.
- **Stub wiring.** `StubNodeOdmClient.downloadAllAssets` now returns a `Response` whose body is the synthetic zip (still tagged `X-Stub-NodeODM: synthetic`).
- **Tests.** `stub.test.ts` gains two tests — one asserts the 6-entry structure, the second proves `benchmark_summary.json` round-trips through `parseManagedBenchmarkSummaryText` (4 outputs, `minimumPass: true`, required outputs present). Test file is now `@vitest-environment node` because the `jsdom` env resolves `fflate`'s `browser.js` build which mishandles the zip round-trip — runtime code still works fine in Node (stub only runs server-side anyway).
- **NOT in scope.** Auto-import on NodeODM `statusCode=40` (i.e., the poll cron calling `downloadAllAssets` + handing bytes to the managed import parser without operator involvement) is a separate, future slice. `/jobs/[jobId]` still uses the operator-driven managed output import form.

Test + lint posture: 46 files / 253 tests green (+2 from the stub suite); lint clean; build clean; tsc baseline unchanged.

## 2026-04-16 — NodeODM-direct launch wiring (Gap 1 §4)

One commit against `main` closes §4 of `docs/ops/nodeodm-upload-gap-1-plan.md` — the launch-wiring work. `launchNodeOdmTask` now has its first live call site, which means `nodeodm-direct` dispatch mode is reachable from the jobs page UI. The upload step (§3) is still blocked on four open decisions and intentionally stays out of scope.

- **New writer.** `recordManagedNodeOdmLaunchOutcome` in `web/src/lib/managed-processing.ts` mirrors the existing webhook adapter writer. Three branches: accepted (writes `output_summary.nodeodm.{taskUuid, presetId, adapterLabel, acceptedAt, lastPolledAt, statusCode: 10, statusName: "queued", progress: 0, uploadState: "pending", launchNotes}` + emits `nodeodm.task.launched`), failed (preserves prior nodeodm fields, writes `lastLaunchError/Kind/AttemptAt`, emits `nodeodm.task.launch_failed`), unconfigured (event-only, no `updateProcessingJob` call). Gated on `status === "running" && stage === "intake_review"` like the webhook path.
- **Server action + form.** New `launchNodeOdmDispatch` server action on `/jobs/[jobId]` + a form alongside the existing webhook adapter form. Gated on `getNodeOdmDispatchSummary().configured` and `role !== viewer`. Form copy tells the truth: "Images are NOT uploaded yet — the task will sit queued until the upload step lands."
- **Truthful posture.** After this commit, stub-mode `/admin` surfaces the new task immediately. The poll cron advances status through `queued → running → completed` via the dev stub-advance route. No drone dataset moves — that's §3. Intentional seam: `uploadState: "pending"` is where Option B will plug in.
- **Tests.** New `web/src/lib/managed-processing-nodeodm.test.ts` (7 tests, all green) covers the three launch branches plus `not-managed` and `noop` gates. Full 251-test suite stays green.

Test + lint posture: 46 files / 251 tests green; lint clean; build clean; tsc baseline unchanged (pre-existing errors on `main` from `dispatch-adapter.test.ts`, `job-retries.test.ts`, `managed-processing.test.ts` — untouched).

Deferred (unchanged): Gap 1 §3 upload + commit (four open decisions in the Gap 1 plan block it), Phase C real NodeODM round-trip (needs §3 + a container + a real dataset), Phase D showcase preview, auth-gated Playwright flow, admin write actions.

## 2026-04-16 — Admin NodeODM observability + dev stub loop

Five commits landed on `main` after the Phase E/F/G post-ship fill-in, rounding out the NodeODM lane with operator-visible panels, a written runbook, and an HTTP dev affordance that makes the stub demoable without a container.

- **`/admin` NodeODM task panel + stuck-jobs panel.** Added `selectNodeOdmJobsForOrg(orgId, limit)` and `selectStaleInFlightJobsForOrg(orgId, {minutesStale, limit})` in `web/src/lib/supabase/admin.ts` (raw PostgREST URL pattern, JSON-path filter for `output_summary->nodeodm->>taskUuid`, clamped limits). Extended `/admin` with two new tables: "NodeODM tasks in flight" (task UUID prefix, status, progress, mission, last polled) and "Stuck in-flight jobs" (> 60 min since `updated_at`, with stale-for via `formatRelativeTime`). Added two summary cards alongside the existing ones. Five new URL-shape tests (including fake-timers for the `minutesStale` cutoff math).
- **NodeODM dev-loop + Phase C runbook.** New `docs/ops/nodeodm-dev-loop-and-phase-c-runbook.md` documents the three runtime modes (webhook / nodeodm-direct / stub), captures the Phase C blockers honestly (Gap 1 upload path, Gap 3 synthetic outputs), and gives the round-trip steps + evidence checklist for when the blockers clear. Closed Gap 2 inline.
- **Dev-only stub-advance route.** Added `POST /api/internal/dev/nodeodm-stub-advance?taskUuid=X&to=running|completed|failed|canceled|progress` under a 404 guard (`AERIAL_NODEODM_MODE=stub` AND `NODE_ENV !== "production"`). Extended `StubNodeOdmClient` with `completeTask` and `failTask` that jump straight to terminal states (progress=100/statusCode=40, statusCode=30). Ten route tests cover the guards, validation, not-found, and each transition. Makes `/admin` panels + the poll cron live-demoable from curl without Docker.
- **Gap 1 upload-plan draft.** Added `docs/ops/nodeodm-upload-gap-1-plan.md` — investigation found that Gap 1 is actually two linked gaps: (1a) `launchNodeOdmTask` has no live call site in the dispatch flow, and (1b) `uploadImages` + `commitTask` have no callers at all. Plan sketches three upload-path options (sync server, async cron, client-direct), recommends the async cron (Option B) + the shared launch-wiring work as the production path, and lists four open decisions that block starting implementation. No code changed.

Test + lint posture: 45 files / 244 tests green; lint clean; tsc baseline unchanged (pre-existing errors on `main` from `dispatch-adapter.test.ts`, `job-retries.test.ts`, `managed-processing.test.ts`).

Deferred (unchanged): Phase C real NodeODM round-trip (now gated on the Gap 1 upload plan + a local container + a real dataset), Phase D showcase preview, auth-gated Playwright flow, admin write actions.

## 2026-04-16 — Post-ship fill-in (Phase E + F + G)

Three shippable slices landed against `main` without blocking on a drone dataset, container pull, or dedicated test Supabase project. See `docs/ops/2026-04-16-phase-e-f-g-evidence.md`.

- **Phase E — Share-link observability.** Added `selectTopShareLinksByUsage(orgId, limit)` and `selectShareLinksNearExpiry(orgId, daysUntil)` in `web/src/lib/supabase/admin.ts` (PostgREST URL style, same as the surrounding helpers). Extended `/admin` with a "Top share links by usage" table (use count, last used, status pill) and a "Share links expiring soon" table (expires-at, usage progress) — both gated behind the existing `admin.support` action check. Unit tests assert the URL shape, filters, and `daysUntil` horizon math under fake timers.
- **Phase F — Mission-version diff view.** Added `buildVersionDiff(left, right)` in `web/src/lib/missions/version-diff.ts`, a dependency-free JSON walker that returns a flat list of `DiffEntry{path, left, right, change}` entries keyed by dot-path. Wired a compare toggle into `/missions/[missionId]/versions` (left + right picker, hide-unchanged checkbox) that renders a 4-column diff table using the existing admin-table / status-pill styling. 12 unit tests cover deep equality, added / removed / changed paths, nested objects + arrays, array-length asymmetry, null-vs-missing, and both-undefined roots.
- **Phase G — NodeODM stub for dispatch/poll/import CI.** Added `StubNodeOdmClient` in `web/src/lib/nodeodm/stub.ts` that extends `NodeOdmClient` with a deterministic in-memory task table (status machine: queued → running on `commitTask` → progress advance on `taskInfo` → completed at 100%, cancel transitions to terminal 50). Gated behind `AERIAL_NODEODM_MODE=stub` with a prod guard that throws if anyone tries `NODE_ENV=production` + stub. Synthetic `downloadAllAssets` returns an empty zip tagged `X-Stub-NodeODM: synthetic`. 11 tests cover the state machine, cancel-terminal, upload counting, mode switch, and the prod guard. Unlocks future CI runs of the dispatch-adapter → poll → import path without an `opendronemap/nodeodm` container or real imagery.

Deferred (unchanged): Phase C real NodeODM round-trip (needs local container + real dataset), Phase D showcase preview (conditional on C), auth-gated Playwright flow (needs a dedicated test Supabase project), admin write actions (parked behind email-service decisions).

## 2026-04-16 — Post-modernization ship (Phase A + B)

Landed the "ship + verify" arc from `.claude/plans/cheeky-questing-tome.md`:

- **Phase A — durability.** Pushed `b08159a → cd52711` to `origin/main`. Applied `20260417000001_drone_share_links.sql` to the linked Supabase project via `supabase db query --linked --file` (routing around pre-existing local-vs-remote tracker drift). Verified the new table, six indexes, RLS policy, and the `(org_id, id)` uniqueness constraint on `drone_processing_outputs`. Confirmed three Ready Production deploys on Vercel matched the three push events; public smoke via WebFetch (`/`, `/sign-in`) confirmed live content on `aerial-intel-platform.vercel.app`. Full evidence in `docs/ops/2026-04-16-phase-a-b-ship-evidence.md`.
- **Phase B — plumbing.** Added the NodeODM poller cron (`/api/internal/nodeodm-poll` at `*/5 * * * *`) to `vercel.json`. Added a `web-e2e` GitHub Actions job gated to `push` on `main` (not PRs) that runs the Playwright public-showcase smoke under chromium and uploads the HTML report on failure. Synced `web/.env.example` with seven env vars referenced in code but missing from the example (`AERIAL_NODEODM_URL` / `AERIAL_NODEODM_TOKEN`, `CRON_SECRET`, `AERIAL_LOG_LEVEL`, the MapLibre style overrides). Added `supabase/.temp/` to `.gitignore` so CLI link-state no longer shows up as untracked dirt.

Deferred (unchanged): Phase C real NodeODM round-trip (needs local container + real dataset), Phase D showcase preview (conditional on C), auth-gated Playwright flow (needs a dedicated test Supabase project).

## 2026-04-16 — Post-modernization follow-up (Phase 3.4 + 4.1 / 4.2 / 4.4)

Four commits landed after the modernization pass to close deferred Phase 3.4 + Phase 4 slices without re-opening the primitives:

- **Phase 3.4 — Mission versioning (promote + inline snapshot).** Added `/missions/[missionId]/versions` with a version list, inline `<details>` payload viewer per row, and a **Promote v{N} to current** server action that copies `plan_payload` back into the mission summary + planning geometry and marks the promoted version `installed`. No job-events written — audit trail is the version row's own `status` + `updated_at`. Side-by-side diff remains deferred.
- **Phase 4.1 — Playwright E2E scaffold.** Added `@playwright/test`, `web/playwright.config.ts` (single chromium project, autostarts `npm run dev` unless `AERIAL_E2E_SKIP_SERVER=1`), and `web/tests/e2e/showcase.spec.ts` covering the public `/` hero + pricing + truth disclosure and the sign-in link routing to `/sign-in`. Auth-gated specs are deferred until a dedicated test Supabase project is wired — see `tests/e2e/README.md`.
- **Phase 4.2 — Signed-share artifact links.** Added `drone_artifact_share_links` (tenant-safe composite FK to `(org_id, id)` on `drone_processing_outputs`), `web/src/lib/sharing.ts` (token generation, validate with revoked > expired > exhausted precedence, parser guardrails), a public `/s/[token]` landing page with status-specific fallbacks, and `/s/[token]/download` that issues a 5-minute signed URL and increments `use_count`. Artifact detail grew a create-link form + revoke action gated behind non-viewer roles and `ready` status.
- **Phase 4.4 — Read-only admin / support console.** Added `/admin` gated by the `admin.support` action (owner + admin). Shows summary cards (members, active entitlements, recent jobs, in-flight jobs) and tables for memberships, entitlements, recent jobs (linked to `/jobs/[id]`), and recent events. Write actions (invite / pause / resume) deferred. Dashboard overview grew an "Admin console" link visible only to eligible roles.

## 2026-04-16 — Modernization pass (Phases 1–5)

**Scope:** decompose monolithic pages, add map-first UX, add NodeODM-direct dispatch, add install-bundle export, add structured logging, add public showcase, refresh agent handoff docs.

- **Phase 1 — Foundation refactor.** Created `web/src/components/ui/` primitives (`status-pill`, `section-card`, `datetime`, `empty-state`, `callout`, `metric`) and `web/src/lib/ui/` helpers (`tones`, `labels`, `datetime`, `bytes`). Mission / job / artifact / dataset / workspace pages all now import shared primitives instead of redefining `formatDateTime` + `statusClass` inline. Consolidated the blocked-access support diagnostics from 30+ copy buttons into a 4-tab `SupportDiagnosticsPanel` (Summary / Email draft / JSON / Markdown). Added action-matrix RBAC (`web/src/lib/auth/actions.ts`).
- **Phase 2 — Map / GIS surface.** Added MapLibre GL JS (OSM fallback style; `NEXT_PUBLIC_MAPLIBRE_STYLE_URL` / `NEXT_PUBLIC_MAPLIBRE_SATELLITE_URL` overrides). Added `web/src/components/map/` (`map-view`, `map-legend`, `geometry-preview-map`, `coverage-comparison-map`). Added `web/src/lib/geo/` helpers (`validation`, `bbox`, `area`, `serialization`) with WGS84 + turf-backed unit tests. Wired interactive maps into mission + dataset detail pages alongside existing text previews.
- **Phase 3 — Real compute path.** Added typed NodeODM client at `web/src/lib/nodeodm/` (`client`, `contracts`, `presets`, `errors`, `config`). Added direct-dispatch adapter `web/src/lib/dispatch-adapter-nodeodm.ts` (three presets: fast-ortho, balanced, high-quality-3d). Added cron route `/api/internal/nodeodm-poll` that advances managed jobs from `nodeodm.taskUuid` cursors on status-code transitions (20→processing, 30→failed, 40→awaiting_output_import). Added install-bundle export (`buildInstallBundle` + `GET /api/missions/[missionId]/install-bundle`) using `fflate`. NodeODM integration is additive — the `aerial-dispatch-adapter.v1` webhook path remains the default.
- **Phase 4 — Delivery + observability.** Added `web/src/lib/logging.ts` structured JSON logger (`createLogger(namespace, baseFields)` + `extractRequestId`); wired into dispatch callback, proving heartbeat, nodeodm poll, and install-bundle routes. Added public showcase at `/` (hero, how-it-works, capabilities matrix, pricing tiers, truthful status disclosure, footer CTA).
- **Phase 5 — Handoff.** Added repo-root `AGENTS.md` with covenant, plane separation, code boundaries, UI system, map + NodeODM + logging conventions, and "don't do" list. Refreshed `README.md`, `docs/ROADMAP.md`, `docs/ARCHITECTURE.md`.

**Deferred (explicit non-goals this pass):** mission-versioning UI (Phase 3.4 in plan), Playwright E2E (Phase 4.1), signed-share links (Phase 4.2), admin console (Phase 4.4). The primitives and contracts are in place to add these without further refactor. _(All four were picked up in the same-day follow-up above.)_

- Extended the benchmark-import + delivery lane into a real managed-job closure slice: `scripts/import_odm_benchmark_run.mjs` can now attach imported ODM outputs onto an existing job (including the truthful `managed-processing-v1` request), optionally publish outputs/evidence/review bundles into protected Supabase Storage, and write delivery-package metadata back onto the job; mission, job, and artifact pages now surface signed download buttons only when those files actually exist in protected storage.
- Wired browser ZIP intake to a truthful direct-to-storage path: mission detail now requests a signed Supabase Storage upload URL, uploads the ZIP from the browser into the protected `drone-ops` bucket, then records an ingest session with durable storage evidence while explicitly keeping extraction, benchmarking, and ODM orchestration pending.

## Unreleased
- Added the first real dispatch adapter contract for `managed-processing-v1`: `/jobs/[jobId]` can now post a deterministic `aerial-dispatch-adapter.v1` launch payload to a configured webhook, persist adapter request/response metadata in job summary state, record accepted external run references as truthful dispatch handoffs, and keep failed or unconfigured launch attempts in intake review without pretending compute started. The managed lane now also blocks generic stage advancement at intake review until a real dispatch handoff exists.
- Added the first honest app-facing dispatch handoff for `managed-processing-v1`: `/jobs/[jobId]` now requires operators to record assigned host, optional worker/slot, external run reference, and dispatch notes before claiming the managed request was handed to real processing infrastructure; the job writes that metadata into summary state, persists the external run reference onto the job row, emits dispatch audit events, and surfaces the recorded handoff back in both mission and job detail views.
- Added a browser-based managed import lane on `/jobs/[jobId]`: operators can now upload a benchmark summary JSON, optional run log, optional review bundle ZIP, and optional real output files directly into protected storage from the job page, then attach that evidence to an existing `managed-processing-v1` job without using the shell-only benchmark import script. The job now records benchmark evidence, emits import audit events, and exposes a signed review-bundle download when one was uploaded.
- Replaced the old “standard refresh” mission queue path with a truthful managed-processing request lane: mission detail now creates a `managed-processing-v1` job without staging fake outputs, records an explicit operator-assisted intake/dispatch/QA/delivery contract in job summaries, and adds job-detail controls that only advance the request when the corresponding real-world handoff has actually happened. This materially closes the orchestration honesty gap while keeping output readiness tied to real imported/attached artifacts.
- Added honest mission-level ingest session tracking for the truthful ODM v1 lane: a new `drone_ingest_sessions` table plus mission-detail form/list now records ZIP evidence, extracted dataset paths, benchmark/run-log paths, review-bundle ZIP paths, truthful pass/fail posture, and operator notes without pretending browser upload already exists.
- Added a truthful local v1 ODM slice centered on `scripts/e2e_v1_slice.sh`: ZIP ingest now fans into a deterministic benchmark run folder, builds a download-first review bundle from only real emitted outputs, writes a machine-readable export manifest plus human review note, optionally imports the same summary into Supabase with explicit org/mission targeting, and exits non-zero when required outputs are missing instead of falsely claiming success.
- Hardened the proving-heartbeat audit trail so the cron route now writes a durable `system.worker_heartbeat` audit event onto the latest proving job per org even when it makes zero state changes. This closes the practical last-run gap for active orgs without waiting on a standalone heartbeat ledger table, lets the workspace heartbeat card show a true persisted signal after quiet cron passes, and adds route-test coverage for the recorded audit count.
- Added a proving-heartbeat health layer to the workspace UI: operators now see the cron route path, `* * * * *` schedule posture, auth posture, and the latest auditable proving-lane signal (durable worker-heartbeat event when present, otherwise an honest fallback to the latest proving-job activity) in the right-hand inspector. The internal `/api/internal/proving-heartbeat` route now also returns heartbeat metadata alongside reconciliation results, with dedicated route/unit tests covering unauthorized access, cron invocation, and CRON_SECRET enforcement.
- Added stateful artifact handoff controls on `/artifacts/[artifactId]` so ready outputs can now be marked reviewed, shared, and exported with audit events and delivery-timeline metadata instead of relying on copy-only packets, surfaced the current handoff stage back up into job, mission, and workspace output cards, added aggregate handoff counts on job/mission detail so delivery posture is visible before drilling into each artifact, introduced a workspace-level artifact handoff queue so pending review/share/export work is visible directly from the main ops shell, promoted handoff backlog/export counts into workspace stats, status chips, and next-action guidance, now allow operators to advance reviewed/shared/exported state directly from the main workspace queue, added copyable share/export packets there too so packaging can happen from the central ops shell, upgraded the workspace activity feed with lane/tone classification plus quick links back to the relevant mission/job context, added editable handoff notes/next-action overrides on artifact detail so reviewers can capture human delivery context instead of only status changes, surface those saved handoff notes back up into the workspace, mission, and job artifact cards, split the workspace handoff board into explicit Review / Share / Export lanes for clearer delivery triage, now support saving handoff notes directly from those workspace lanes too, carry saved note text into copied share/export packets plus note-update activity details, surface reviewed/shared/exported timestamps + actor emails across the workspace, mission, and job artifact cards for stronger auditability, add an explicit in-app v1 milestone bar tied to the execution-plan acceptance criteria, add a blunt go/no-go blocker panel so the product only calls itself solid v1 when the live data-backed path clears the acceptance bar, make the milestone/blocker cards actionable with deep links into the mission/job/artifact surfaces that clear each remaining acceptance step, include a one-click live-workspace bootstrap that creates a real project/site/mission/version chain so the app can move off fallback/demo state, add a mission-level proving-run seeder that creates a real dataset, queued job, events, and placeholder outputs on the live data path without pretending delivery is finished, add clearly labeled manual job-progression controls for proving runs so seeded live jobs can move into running/succeeded state and emit ready artifacts while the full async worker backend is still pending, add a mission-level proving-path helper that points operators at the next honest live-step (seed, queue, open proving job, or review ready artifacts), add a job-level proving-next-step helper so proving runs always advertise the fastest honest follow-through from queued job to ready artifact review, add a workspace-level proving-focus card that jumps directly into the active proving job or first ready artifact on the live path, then upgrade that lane so queued/running proving jobs auto-progress on a worker-heartbeat reconciliation pass during page loads while the old buttons remain available only as force-override controls, and surface the resulting proving posture/checkpoint status throughout workspace, mission, job, and artifact surfaces.
- Reframed the web app around an `Aerial Operations OS` mission-control shell so the product direction now visibly covers planning, ingest, processing, and delivery instead of stopping at auth.
- Rebuilt the `/missions` route into a richer operations workspace with a top command bar, left workspace rail, center mission lanes, right contextual inspector, and bottom job/activity console.
- Expanded the mission workspace snapshot model to include project context, operational status chips, datasets, jobs, output artifacts, and event history representing the next product slices.
- Added an execution-plan document (`docs/AERIAL_OPERATIONS_OS_EXECUTION_PLAN_2026-03-15.md`) that adapts the new master plan into the current repo, preserving prior good work while setting the next implementation order.
- Upgraded `docs/ROADMAP.md` and `docs/ARCHITECTURE.md` to reflect the broader aerial operations platform roadmap and the required separation between app, data, compute, raster delivery, and field-companion planes.
- Added a query-backed `/missions` data loader that reads real aerial-ops records from Supabase when the new tables are present and gracefully falls back to the built-in demo workspace otherwise.
- Added a seed script (`scripts/seed_aerial_ops_workspace.mjs`) plus a job-event table model so one org can be populated with project/site/mission/dataset/job/output/event records for immediate workspace verification.
- Created the dedicated Supabase project for `aerial-intel-platform`, applied the auth + aerial-ops schema migrations through Supabase MCP, and seeded the first real query-backed workspace path for the protected `/missions` route.
- Hardened the trigger helper functions by pinning `search_path` after Supabase advisor feedback.
- Added mission detail (`/missions/[missionId]`) and job detail (`/jobs/[jobId]`) routes so the seeded workspace can be explored through real database-backed entity pages instead of only the summary workspace shell.
- Added a protected artifact detail route (`/artifacts/[artifactId]`) so output records now have a first-class review/share/export surface instead of being stranded as summary-only cards.
- Expanded the authenticated write path so operators can draft a mission from the workspace, attach a dataset from mission detail, queue a processing job, and automatically seed placeholder output records for review/export flow development.
- Added copy-ready share summary and export packet actions on artifact detail so the first review/share/export loop is usable even before signed URLs and client portal delivery are wired.
- Added benchmark-summary parsing plus a new `scripts/import_odm_benchmark_run.mjs` import path so real ODM benchmark evidence can be written into jobs, outputs, and events instead of relying only on placeholder artifact state.
- Surfaced benchmark QA posture and benchmark-file evidence on job and artifact detail pages so reviewers can see actual run status, required-output gaps, file sizes, and run-log references.
- Added an install-bundle generation action on mission detail that stages a planner-side install job, emits install bundle + mission brief artifacts, and updates the latest mission version export summary for browser-first field handoff.
- Expanded mission detail with latest-version planner/install readiness so export targets, validation checks, and generated handoff outputs are visible in-product.
- Added capture-preflight metadata on dataset attachment plus a new `/datasets/[datasetId]` review page so flagged datasets can be inspected and explicitly promoted to ready before processing.
- Added job-detail operator controls for retry/cancel plus imported log-tail visibility so v1 better covers the “watch status and logs” milestone from the execution plan.
- Extended benchmark import to persist run-log path and recent log lines into the job record so imported benchmark jobs expose actionable log context in-product.
- Added mission-detail approval/install/delivery controls so the latest mission version can be approved, confirmed installed, and the mission itself marked delivered with delivery metadata captured in the mission summary.
- Added explainable GIS spatial-intelligence scoring on mission and dataset detail pages, using planning/GIS heuristics (capture density, CRS posture, overlap, GCPs, blockers/warnings, export readiness) to surface recommendations without fake certainty.
- Added GIS copilot brief generation on mission and dataset pages so users can copy structured plain-English spatial QA summaries and next actions into chat, docs, or delivery notes.
- Added geometry-aware AOI/footprint posture plus terrain-risk cards that use real GeoJSON geometry when available and degrade gracefully to summary-based heuristics when geometry is still missing.
- Added planned-vs-captured coverage comparison cards on mission and dataset pages so the app can estimate how much of the planned AOI footprint is represented by the current dataset footprint when both geometries are attached.
- Added a GIS overlay/constraint planning lane on mission detail, including explainable recommended layers (parcels, roads/ROW, utilities, terrain, flood/drainage, environmental constraints, etc.) and a copyable overlay checklist for planning/QA workflows.
- Added real GeoJSON attachment/editing flows for mission AOIs and dataset footprints so geometry-powered coverage, terrain, and overlay intelligence can be fed directly in-product instead of staying hypothetical.
- Added in-app geometry preview cards that render attached AOIs and dataset footprints as lightweight SVG map previews directly on mission and dataset detail pages.
- Added overlay-review tracking on mission detail so recommended GIS layers can be marked reviewed, counted, and saved as part of the mission’s planning QA state.
- Upgraded the in-app geometry preview into an interactive layer viewer with toggles for AOI and dataset footprint visibility, plus component-level tests for the preview behavior.
- Added a mission readiness tracker and copyable readiness checklist that roll up geometry, datasets, processing, outputs, install bundle, approval, overlay review, install confirmation, and delivery into one operational progress surface.
- Added multi-dataset comparison targeting on mission detail so operators can switch which attached dataset drives geometry preview and planned-vs-captured coverage analysis instead of being locked to the first dataset only.
- Added a mission-wide dataset coverage roster and copyable summary so all attached datasets can be ranked by planned-versus-captured coverage posture, not just the currently selected comparison target.
- Added sample GeoJSON helpers for mission AOIs and dataset footprints so demos/testing can load valid polygon/corridor/footprint geometry directly from the form without manual JSON authoring every time.
- Added live draft-geometry preview and validation inside the geometry forms so operators can see whether pasted/sample GeoJSON parses correctly before saving it to the mission or dataset.
- Added a visual mission dashboard that rolls up readiness, spatial score, terrain posture, overlay review, and best dataset coverage into progress-bar cards for faster at-a-glance review.
- Upgraded the `/missions` workspace mission cards with visual readiness strips and inline blockers/warnings/output-health stats so operators can spot weak missions before drilling into detail pages.
- Added a GIS triage board to the workspace overview so delivery-ready missions, fragile missions, QA-ready missions, and the current top-priority mission are visible before opening mission detail.
- Refactored the `/missions` workspace around a client-side mission board with search, stage filtering, risk filtering, sorting, ranked top-mission queue, and mission-lane filtering so the larger GIS/ops surface stays navigable.
- Upgraded the geometry preview into a more true interactive map-style viewer with fit/focus actions, zoom controls, and pan controls, plus component tests for the new viewer behavior.
- Added the first authenticated write path: queueing a processing job from the mission detail page now writes a real `drone_processing_jobs` row plus a `drone_processing_job_events` audit entry through a server-side action.
- Added an entitlement-protected `/missions` workspace route so DroneOps now has a real mission pipeline surface beyond the auth dashboard.
- Added a GIS/drone mission workspace snapshot model with AOI, capture, processing, CRS, and deliverable readiness metadata for the first workflow slice.
- Added mission workspace unit coverage for summary totals and stage/output label formatting.
- Added a blocked-access "Copy support diagnostics markdown table" action so operators can paste a markdown-ready diagnostics table into ticket systems, docs, and chat threads that render tabular markdown.
- Added a blocked-access "Copy support escalation line" action so operators can quickly paste a compact ref/snapshot/account/org/reason line into escalation chats and ticket comments.
- Added a blocked-access "Copy support ticket body" action so operators can paste a support-ready markdown body (header, reference/snapshot, triage summary, diagnostics) into ticket systems and escalation docs.
- Added a blocked-access "Copy support ticket header line" action so operators can paste a markdown-ready incident heading (reference, account, org) into ticket bodies and escalation docs.
- Added a blocked-access "Copy support call brief" action so operators can quickly paste a phone-ready opener (reference, account, org, reason, snapshot) into support call notes and live escalations.
- Added a blocked-access "Copy support diagnostics TSV block" action so operators can quickly paste tab-delimited diagnostics into spreadsheet columns and tab-friendly ticket fields.
- Added a blocked-access "Copy support diagnostics markdown block" action so operators can quickly paste markdown-ready diagnostics into ticket comments, docs, and chat threads.
- Added a blocked-access "Copy support ticket title" action so operators can quickly paste a support-ready case title (account, org, and reference) into ticket systems and escalation threads.
- Added a blocked-access "Copy support diagnostics key-value block" action so operators can quickly paste plain-text diagnostics into support chats and ticket fields that do not accept CSV or JSON.
- Added a blocked-access "Copy support reference + snapshot line" action so operators can quickly paste a compact ref/timestamp traceability line into ticket comments and handoff notes.
- Added a blocked-access "Copy support follow-up line" action so operators can paste a compact ref/account/org/reason summary into ticket comments and escalation chats.
- Added a blocked-access "Copy organization name" action so operators can quickly paste the org display name into support forms, ticket notes, and escalation chats.
- Added a blocked-access "Copy operator escalation packet" action so operators can copy a single support-ready packet (reference, links, triage summary, checklist, email draft, JSON diagnostics) into ticket threads and handoff docs.
- Added a blocked-access "Copy support Gmail compose link" action so operators can paste a prefilled Gmail compose URL into chat/docs when browser handoff is needed.
- Added a blocked-access "Open in Gmail" shortcut so operators can launch a prefilled support draft even when local `mailto:` handlers are unavailable.
- Added a blocked-access "Copy signed-in user ID" action so operators can quickly paste the authenticated user ID into support forms and ticket fields.
- Added a blocked-access "Copy organization slug" action so operators can quickly paste the org slug into support forms and internal org lookup workflows.
- Added a blocked-access "Copy blocked-access reason" action so operators can quickly paste the exact observed reason into support forms, ticket comments, and call notes.
- Added a blocked-access "Copy operator handoff checklist" action so operators can quickly paste a support-ready checklist with reference, inbox, subject, and follow-up steps.
- Added a blocked-access "Copy support triage summary" action so operators can paste a compact reference/account/org/reason handoff into chat, tickets, or call notes.
- Added a blocked-access "Copy signed-in account email" action so operators can quickly paste the authenticated user email into support forms and triage chats.
- Added a blocked-access "Copy support email link" action so operators can paste a prefilled mailto handoff into chat/docs when local email-client launch is unavailable.
- Added a blocked-access "Copy support context JSON" action so operators can paste structured diagnostics directly into ticket forms that support JSON.
- Added a blocked-access "Copy support snapshot timestamp" action so operators can quickly share the exact UTC support snapshot with support for case traceability.
- Added a blocked-access "Copy support email body" action so operators can quickly paste the prefilled email body into local mail clients or support ticket forms.
- Added a blocked-access "Copy support email address" action so operators can quickly paste the support inbox into local email clients when mailto handoff is unavailable.
- Added a blocked-access "Copy support email subject" action so operators can quickly paste the prefilled subject line into local email clients or support ticket forms.
- Added a blocked-access "Copy support reference" action so operators can quickly share the generated case reference in tickets, chat, or phone support workflows.
- Added a blocked-access "Copy support email draft" action so operators can manually paste full subject+body content when opening a local email client or when mailto handoff is unavailable.
- Prefilled blocked-access support emails with the generated support reference in the subject line for faster triage.
- Added a one-click copy control for blocked-access support context so operators can paste diagnostics into support channels without retyping.
- Added blocked-access support diagnostics to prefill support emails with role/membership/entitlement context.
- Expanded blocked-access diagnostics with user/org identifiers and organization fallback context when entitlement is inactive.
- Added support snapshot metadata (reference ID + UTC timestamp) to blocked-access support context to speed support triage.
- Added unit coverage for blocked-access support context formatting.
- Initialized project scaffold.
