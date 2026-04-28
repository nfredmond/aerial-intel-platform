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
      "--print-evidence-template",
      "--app-url",
      "http://127.0.0.1:3999/some/path",
    ]);

    assert.equal(result.exitCode, 0, result.stderr);
    assert.match(result.stdout, /Phase 3 bootstrap prerequisites ok/);
    assert.match(result.stdout, /Local live-stub operator-loop plan/);
    assert.match(result.stdout, /Phase 3 live-stub operator proof note/);
    assert.match(result.stdout, /Do not paste CRON_SECRET, Supabase keys, cookies, bearer tokens, or magic-link tokens/);
    assert.match(result.stdout, /App origin tested: http:\/\/127\.0\.0\.1:3999/);
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
      assert.match(result.stderr, /Local env repair hints/);
      assert.match(result.stderr, /AERIAL_NODEODM_MODE=stub/);
      assert.match(result.stderr, /Agent-safe local-only action: AERIAL_NODEODM_MODE=stub is non-secret/);
      assert.match(result.stderr, /do not generate, store, or append CRON_SECRET from an automation\/delegated proof run/);
      assert.match(result.stderr, /Human\/operator-only secret setup/);
      assert.match(result.stderr, /randomBytes\(32\)/);
      assert.match(result.stderr, /grep -nE '\^\(CRON_SECRET\|AERIAL_NODEODM_MODE\)='/);
      assert.match(result.stderr, /edit the existing line instead of appending a duplicate/);
      assert.doesNotMatch(result.stdout + result.stderr, /secret-service-role-value/);
      assert.doesNotMatch(result.stdout + result.stderr, /secret-anon-value/);
    },
  );
});

test("duplicate live-stub env entries fail without printing values", () => {
  withEnvFile(
    `${validLiveStubEnv}CRON_SECRET=second-local-secret-value-that-is-long
AERIAL_NODEODM_MODE=stub
`,
    (envFile) => {
      const result = runCheck(["--env-file", envFile]);

      assert.equal(result.exitCode, 1);
      assert.match(result.stderr, /CRON_SECRET is defined multiple times in local env \(lines 4, 7\)/);
      assert.match(result.stderr, /AERIAL_NODEODM_MODE is defined multiple times in local env \(lines 5, 8\)/);
      assert.match(result.stderr, /edit one existing line instead of appending a duplicate/);
      assert.doesNotMatch(result.stdout + result.stderr, /local-cron-secret-value-that-is-long/);
      assert.doesNotMatch(result.stdout + result.stderr, /second-local-secret-value-that-is-long/);
    },
  );
});

test("example-mode failures do not print local secret-generation repair commands", () => {
  const result = runCheck([
    "--env-file",
    "ignored.env",
    "--example",
    "--mode",
    "not-a-mode",
  ]);

  assert.equal(result.exitCode, 2);
  assert.doesNotMatch(result.stderr, /randomBytes\(32\)/);
});

test("example mode validates documented names but cannot print an operator-loop plan", () => {
  const exampleResult = runCheck(["--example"]);
  assert.equal(exampleResult.exitCode, 0, exampleResult.stderr);
  assert.match(exampleResult.stdout, /web\/\.env\.example/);

  const planResult = runCheck(["--example", "--print-operator-loop"]);
  assert.equal(planResult.exitCode, 2);
  assert.match(planResult.stderr, /requires a real local env file/);

  const evidenceResult = runCheck(["--example", "--print-evidence-template"]);
  assert.equal(evidenceResult.exitCode, 2);
  assert.match(evidenceResult.stderr, /requires a real local env file/);
});

test("evidence template is only available for live-stub mode", () => {
  withEnvFile(`${validLiveStubEnv}AERIAL_NODEODM_URL=http://localhost:3000\n`, (envFile) => {
    const result = runCheck(["--env-file", envFile, "--mode", "real-nodeodm", "--print-evidence-template"]);

    assert.equal(result.exitCode, 2);
    assert.match(result.stderr, /only supported with --mode live-stub/);
  });
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
