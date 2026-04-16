# Aerial Intel — end-to-end tests

Playwright-backed E2E tests for the web app.

## What's wired now

- `showcase.spec.ts` — hits the public `/` and `/sign-in` routes. No Supabase
  dependency; safe to run on any build.

## What's NOT wired yet

The full smoke flow from `docs/TEST_STRATEGY.md` (sign-in → create mission →
attach geometry → record v1 ingest → create managed job → record dispatch
handoff → import a fixture output → confirm artifact) requires:

1. A dedicated test Supabase project with the current migrations applied.
2. A seeded test user with an active DroneOps entitlement.
3. Env vars pointing Playwright + the Next.js server at that project.

Wire those up before writing auth-gated specs — otherwise they'll fail on the
first `await supabase.auth.getUser()` in `proxy.ts`.

## Local usage

```bash
cd web
npm install
npx playwright install --with-deps chromium   # first time only
npm run test:e2e
```

By default Playwright boots `npm run dev` on `http://127.0.0.1:3000`. To run
against an already-running server (e.g. a Vercel preview URL), set:

```bash
AERIAL_E2E_BASE_URL=https://aerial-preview.example.com \
AERIAL_E2E_SKIP_SERVER=1 \
  npm run test:e2e
```

## CI posture

Per the plan, E2E should run on non-PR `main` pushes only — PR CI stays fast
with lint + vitest + build. Add the E2E step behind a branch gate when you
wire it up.
