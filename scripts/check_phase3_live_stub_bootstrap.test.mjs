#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { runPhase3LiveStubBootstrapCheck } from "./check_phase3_live_stub_bootstrap.mjs";

function runCheck(args) {
  return runPhase3LiveStubBootstrapCheck(args);
}

function withEnvFile(text, callback) {
  const dir = mkdtempSync(join(tmpdir(), "phase3-live-stub-"));
  const path = join(dir, ".env.local");
  writeFileSync(path, text);
  try {
    return callback(path);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const validLiveStubEnv = `NEXT_PUBLIC_SUPABASE_URL=https://abc123.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_${"a".repeat(90)}
SUPABASE_SERVICE_ROLE_KEY=sb_secret_${"b".repeat(90)}
CRON_SECRET=local-cron-secret-value-that-is-long
AERIAL_NODEODM_MODE=stub
NODE_ENV=development
`;

test("valid live-stub env can print a redacted operator-loop plan", () => {
  withEnvFile(validLiveStubEnv, (envFile) => {
    const result = runCheck([
      "--env-file",
      envFile,
      "--print-operator-loop",
      "--app-url",
      "http://127.0.0.1:3999/some/path",
    ]);

    assert.equal(result.exitCode, 0, result.stderr);
    assert.match(result.stdout, /Phase 3 bootstrap prerequisites ok/);
    assert.match(result.stdout, /Local live-stub operator-loop plan/);
    assert.match(result.stdout, /Authorization: Bearer \$CRON_SECRET/);
    assert.match(result.stdout, /http:\/\/127\.0\.0\.1:3999\/api\/internal\/nodeodm-upload/);
    assert.doesNotMatch(result.stdout, /local-cron-secret-value-that-is-long/);
    assert.doesNotMatch(result.stdout, /sb_secret_/);
    assert.doesNotMatch(result.stdout, /sb_publishable_/);
  });
});

test("missing live-stub names fail without printing secret-like values", () => {
  withEnvFile(
    `NEXT_PUBLIC_SUPABASE_URL=https://abc123.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=secret-anon-value
SUPABASE_SERVICE_ROLE_KEY=secret-service-role-value
`,
    (envFile) => {
      const result = runCheck(["--env-file", envFile]);

      assert.equal(result.exitCode, 1);
      assert.match(result.stderr, /CRON_SECRET is missing or empty/);
      assert.match(result.stderr, /AERIAL_NODEODM_MODE is missing or empty/);
      assert.doesNotMatch(result.stdout + result.stderr, /secret-service-role-value/);
      assert.doesNotMatch(result.stdout + result.stderr, /secret-anon-value/);
    },
  );
});

test("example mode validates documented names but cannot print an operator-loop plan", () => {
  const exampleResult = runCheck(["--example"]);
  assert.equal(exampleResult.exitCode, 0, exampleResult.stderr);
  assert.match(exampleResult.stdout, /web\/\.env\.example/);

  const planResult = runCheck(["--example", "--print-operator-loop"]);
  assert.equal(planResult.exitCode, 2);
  assert.match(planResult.stderr, /requires a real local env file/);
});

test("live-stub mode rejects production NODE_ENV", () => {
  withEnvFile(validLiveStubEnv.replace("NODE_ENV=development", "NODE_ENV=production"), (envFile) => {
    const result = runCheck(["--env-file", envFile]);

    assert.equal(result.exitCode, 1);
    assert.match(result.stderr, /live-stub mode is disallowed when NODE_ENV=production/);
  });
});

test("real-nodeodm mode rejects an explicit stub mode", () => {
  withEnvFile(`${validLiveStubEnv}AERIAL_NODEODM_URL=http://localhost:3000\n`, (envFile) => {
    const result = runCheck(["--env-file", envFile, "--mode", "real-nodeodm"]);

    assert.equal(result.exitCode, 1);
    assert.match(result.stderr, /AERIAL_NODEODM_MODE must not be stub for real-nodeodm mode/);
  });
});
