# Artifact report-summary slice - 2026-04-20

This note records the artifact report-summary Copilot slice added after the admin support assistant.

## What shipped

- New `Aerial Copilot - Report Summary` panel on `/artifacts/[artifactId]`.
- Fact builder from real artifact context: artifact status, protected storage path, mission/project/dataset linkage, source job status, latest checkpoint, benchmark QA/output evidence, handoff stage, approvals, comments, and recent events.
- Haiku-backed report summary generation with the same citation-gated renderer used by the other Copilot skills.
- Existing gates reused: authenticated DroneOps access, `copilot.generate`, org opt-in, env kill-switch, AI Gateway credentials, monthly quota, and 45-second model timeout.
- Authenticated Preview smoke now clicks the artifact report-summary panel and verifies visible `[fact:*]` citations.

## Scope boundary

This is a draft/report-assist surface. It does not write the generated text back to the database and does not mark delivery complete. Operators must still review the summary before sending it externally.

## Verification

Run from `web/`:

```bash
npm run test -- src/lib/copilot/report-summary.test.ts
npm run lint -- --quiet
npm run test
npm run build
```

Live Preview smoke should use the opt-in authenticated spec:

```bash
AERIAL_E2E_AUTH_SMOKE=1 ... AERIAL_E2E_EXPECT_RASTER=1 \
  npm run test:e2e -- authenticated-ops.spec.ts
```

Result against `https://aerial-intel-platform-7v7k1pafw-natford.vercel.app`: pass, 1 test in 59.2 seconds. The smoke signs in as the owner fixture, opens the Toledo COG artifact, verifies raster tile loading, clicks `Generate report summary`, and checks for visible `[fact:*]` citations plus a kept-sentence count.
