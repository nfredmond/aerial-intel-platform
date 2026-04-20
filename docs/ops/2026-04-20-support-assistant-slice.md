# Admin support assistant slice - 2026-04-20

This note records the first support-assistant slice added after the review-hardening Preview smoke.

## What shipped

- New admin Copilot panel on `/admin/copilot` for internal ops/support questions.
- Curated support fact corpus in `web/src/lib/copilot/support-assistant.ts`.
- Lexical retrieval over that corpus before model invocation.
- Haiku-backed answer generation with the same citation-gated rendering contract as the other Copilot skills.
- Existing org opt-in, env kill-switch, AI Gateway credential, action-matrix, and monthly quota gates.

## Scope boundary

The corpus is intentionally bundled in code rather than read from `/docs` at runtime. That keeps Vercel serverless tracing predictable and avoids claiming a full document-indexing/RAG plane before one exists.

The assistant can answer operational questions covered by the curated facts: truthful posture, plane separation, service-role write boundaries, active-membership RLS, TiTiler raster setup, NodeODM verification, dispatch contract versioning, share links, admin console posture, Copilot grounding, E2E posture, and deferred enterprise scope.

## Verification

Run from `web/`:

```bash
npm run test -- src/lib/copilot/support-assistant.test.ts
```

Result: 1 file / 4 tests passed.

Live Preview smoke:

```bash
AERIAL_E2E_AUTH_SMOKE=1 ... AERIAL_E2E_EXPECT_RASTER=1 \
  npm run test:e2e -- authenticated-ops.spec.ts
```

Result against `https://aerial-intel-platform-jzetgtoon-natford.vercel.app`: pass. The smoke signs in as the owner fixture, opens `/admin/copilot`, asks what still blocks the production raster claim, and verifies a visible `[fact:support:*]` answer plus cited support sources.

Broader verification should run before merge:

```bash
npm run lint -- --quiet
npm run test
npm run build
```

## Next step

Replace the curated in-code support corpus with a real indexed docs plane only after the support questions show enough volume to justify ingestion, chunking, and freshness controls.
