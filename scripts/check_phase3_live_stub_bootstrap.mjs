#!/usr/bin/env node
import { existsSync as fsExistsSync, readFileSync as fsReadFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const usage = `Usage: node scripts/check_phase3_live_stub_bootstrap.mjs [--env-file PATH] [--example] [--mode live-stub|real-nodeodm] [--print-operator-loop] [--print-evidence-template] [--app-url ORIGIN]

Checks the local Phase 3 / live-stub bootstrap environment without printing
secret values. --example validates that web/.env.example still documents the
required names; the default checks web/.env.local for an executable live-stub
round-trip posture.

--print-operator-loop emits redacted local curl/browser steps after the check
passes. --print-evidence-template emits a redacted proof-note template for the
operator to fill in after the browser/curl loop. Neither option executes
requests or prints CRON_SECRET. When prerequisites fail, the checker prints a
redacted local-env repair scaffold; it never generates or writes secret values.`;

const requiredBase = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "CRON_SECRET",
];

const requiredByMode = {
  "live-stub": ["AERIAL_NODEODM_MODE"],
  "real-nodeodm": ["AERIAL_NODEODM_URL"],
};

function formatLines(lines) {
  return lines.length > 0 ? `${lines.join("\n")}\n` : "";
}

function parseArgs(args) {
  let envFile = "web/.env.local";
  let allowExample = false;
  let mode = "live-stub";
  let printOperatorLoop = false;
  let printEvidenceTemplate = false;
  let appUrl = "http://localhost:3000";

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--env-file") {
      envFile = args[index + 1] ?? "";
      index += 1;
    } else if (arg === "--example") {
      envFile = "web/.env.example";
      allowExample = true;
    } else if (arg === "--mode") {
      mode = args[index + 1] ?? "";
      index += 1;
    } else if (arg === "--print-operator-loop") {
      printOperatorLoop = true;
    } else if (arg === "--print-evidence-template") {
      printEvidenceTemplate = true;
    } else if (arg === "--app-url") {
      appUrl = args[index + 1] ?? "";
      index += 1;
    } else if (arg === "-h" || arg === "--help") {
      return { ok: false, exitCode: 0, stdout: [usage], stderr: [] };
    } else {
      return { ok: false, exitCode: 2, stdout: [], stderr: [`unknown argument: ${arg}`] };
    }
  }

  return {
    ok: true,
    envFile,
    allowExample,
    mode,
    printOperatorLoop,
    printEvidenceTemplate,
    appUrl,
  };
}

export function parseEnvEntries(text) {
  const env = new Map();
  const lineNumbersByName = new Map();
  const lines = text.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index];
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const name = match[1];
    let value = match[2] ?? "";
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env.set(name, value);

    const lineNumbers = lineNumbersByName.get(name) ?? [];
    lineNumbers.push(index + 1);
    lineNumbersByName.set(name, lineNumbers);
  }

  return { env, lineNumbersByName };
}

export function parseEnv(text) {
  return parseEnvEntries(text).env;
}

function duplicateEnvFailures({ lineNumbersByName, names }) {
  const failures = [];
  for (const name of names) {
    const lineNumbers = lineNumbersByName.get(name) ?? [];
    if (lineNumbers.length > 1) {
      failures.push(
        `${name} is defined multiple times in local env (lines ${lineNumbers.join(", ")}); edit one existing line instead of appending a duplicate`,
      );
    }
  }
  return failures;
}

function createPlaceholderDetector(allowExample) {
  return function looksPlaceholder(name, value) {
    if (!value) return false;
    const lowered = value.toLowerCase();
    if (allowExample) return false;
    if (lowered.includes("your-project-ref")) return true;
    if (lowered.includes("your-anon-key")) return true;
    if (lowered.includes("your-service-role-key")) return true;
    if (lowered.includes("replace-with")) return true;
    if (lowered === "replace-me" || lowered.startsWith("replace-me-")) return true;
    if (name.endsWith("_URL") && lowered.includes("example.com")) return true;
    return false;
  };
}

function buildOperatorLoopPlan({ appOrigin, envFile }) {
  return [
    "",
    "Local live-stub operator-loop plan (commands are redacted and not executed):",
    "1. Start the app from web/:",
    "   npm run dev",
    "2. In the browser, sign in, select a mission, extract a dataset, create a managed-processing request, start intake review, then launch the NodeODM task.",
    "3. Copy the task UUID from the job page or /admin, then keep only shell variable names in command history:",
    '   export TASK_UUID="<output_summary.nodeodm.taskUuid>"',
    `   export CRON_SECRET="<value from ${envFile}>"`,
    "4. Upload and commit extracted images to the in-memory stub:",
    `   curl -fsS -H "Authorization: Bearer $CRON_SECRET" "${appOrigin}/api/internal/nodeodm-upload"`,
    "5. If you need a deterministic first proof, advance the stub task to completed:",
    `   curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" "${appOrigin}/api/internal/dev/nodeodm-stub-advance?taskUuid=$TASK_UUID&to=completed"`,
    "6. Poll the task and import synthetic outputs:",
    `   curl -fsS -H "Authorization: Bearer $CRON_SECRET" "${appOrigin}/api/internal/nodeodm-poll"`,
    "Expected evidence: nodeodm.task.launched, nodeodm.task.committed, nodeodm.task.completed, nodeodm.task.imported; job status succeeded; ready outputs attached from the synthetic stub bundle.",
  ];
}

function buildEvidenceTemplate({ appOrigin, envFile, mode }) {
  const generatedAt = new Date().toISOString();
  return [
    "",
    "---",
    "# Phase 3 live-stub operator proof note",
    "",
    `Generated: ${generatedAt}`,
    `App origin tested: ${appOrigin}`,
    `Env file checked: ${envFile}`,
    `Mode: ${mode}`,
    "",
    "## Secret-handling rule",
    "",
    "Do not paste CRON_SECRET, Supabase keys, cookies, bearer tokens, or magic-link tokens into this note. Record only redacted command shapes, status codes, UUIDs, event types, and UI outcomes.",
    "",
    "## Preflight evidence",
    "",
    "- [ ] `node scripts/check_phase3_live_stub_bootstrap.mjs --print-operator-loop --print-evidence-template` exited 0.",
    "- [ ] Local app started from `web/` with `npm run dev`.",
    "- [ ] Signed in with a seeded local/test user; no production customer account used.",
    "- [ ] Mission selected:",
    "- [ ] Job selected:",
    "- [ ] Task UUID captured as `TASK_UUID` in shell only:",
    "",
    "## Operator loop results",
    "",
    "| Step | Expected | Observed | Evidence to record |",
    "| --- | --- | --- | --- |",
    "| Launch NodeODM task | `nodeodm.task.launched` event and task UUID |  | event id / task UUID only |",
    "| Upload extracted images | `nodeodm.task.committed` or upload retry/failure event |  | HTTP status + event type |",
    "| Advance stub task | dev route returns success for selected task |  | HTTP status + redacted response fields |",
    "| Poll/import outputs | job reaches `succeeded`; `nodeodm.task.completed` and `nodeodm.task.imported` events |  | event ids + output count |",
    "| UI verification | job page/admin surface shows ready synthetic outputs |  | visible labels, no screenshots with secrets |",
    "",
    "## Acceptance checklist",
    "",
    "- [ ] Synthetic orthophoto output attached.",
    "- [ ] Synthetic DEM output attached.",
    "- [ ] Synthetic point cloud output attached.",
    "- [ ] Synthetic mesh output attached.",
    "- [ ] No unauthorized response was accepted when `CRON_SECRET` was configured.",
    "- [ ] No production NodeODM, GCP, Vercel, GitHub, or Supabase schema writes were required for this proof.",
    "",
    "## Non-claims",
    "",
    "- This is a local live-stub proof, not a real NodeODM processing benchmark.",
    "- This does not prove production TiTiler raster delivery unless a controlled TiTiler URL is separately deployed, configured, and smoked.",
  ];
}

function buildLocalEnvRepairHints({ envFile, mode }) {
  const duplicateCheckPattern =
    mode === "live-stub"
      ? "CRON_SECRET|AERIAL_NODEODM_MODE"
      : "CRON_SECRET|AERIAL_NODEODM_MODE|AERIAL_NODEODM_URL";
  const lines = [
    "",
    "Local env repair hints (copy/edit only; no secret values printed):",
    `- Preserve any existing real values in ${envFile}. Do not paste Supabase keys or CRON_SECRET into docs, chat, screenshots, or commit history.`,
    "- Before appending a local env line, list existing entries without values:",
    `  grep -nE '^(${duplicateCheckPattern})=' ${envFile} | cut -d= -f1`,
    "- Agent-safe local-only action: AERIAL_NODEODM_MODE=stub is non-secret and may be added to local env when the operator has approved local env edits.",
    "- Secret action: do not generate, store, or append CRON_SECRET from an automation/delegated proof run unless an approved local secret location or existing value is already available.",
  ];

  if (mode === "live-stub") {
    lines.push(
      "- For the Phase 3 live-stub proof, make sure these local-only names exist:",
      "  AERIAL_NODEODM_MODE=stub",
      "  CRON_SECRET=<local random value, at least 24 characters>",
      "- Human/operator-only secret setup, run locally without this checker seeing or printing the value:",
      `  node -e 'process.stdout.write("CRON_SECRET="+require("node:crypto").randomBytes(32).toString("hex")+"\\n")' >> ${envFile}`,
      `- If ${envFile} already has CRON_SECRET or AERIAL_NODEODM_MODE, edit the existing line instead of appending a duplicate.`,
      "- Re-run: node scripts/check_phase3_live_stub_bootstrap.mjs --print-operator-loop --print-evidence-template",
    );
  } else {
    lines.push(
      "- For a real NodeODM proof, make sure these local-only names exist:",
      "  AERIAL_NODEODM_URL=http://localhost:3101",
      "  AERIAL_NODEODM_MODE=real",
      "  CRON_SECRET=<local random value, at least 24 characters>",
      "- Human/operator-only secret setup, run locally without this checker seeing or printing the value:",
      `  node -e 'process.stdout.write("CRON_SECRET="+require("node:crypto").randomBytes(32).toString("hex")+"\\n")' >> ${envFile}`,
      `- If ${envFile} already has any of those names, edit the existing line instead of appending a duplicate.`,
    );
  }

  return lines;
}

export function runPhase3LiveStubBootstrapCheck(args, options = {}) {
  const parsed = parseArgs(args);
  if (!parsed.ok) {
    return {
      exitCode: parsed.exitCode,
      stdout: formatLines(parsed.stdout),
      stderr: formatLines(parsed.stderr),
    };
  }

  const stdout = [];
  const stderr = [];
  const failures = [];
  const warnings = [];
  const existsSync = options.existsSync ?? fsExistsSync;
  const readFileSync = options.readFileSync ?? fsReadFileSync;

  if (!parsed.envFile) {
    stderr.push("--env-file requires a path.");
    return { exitCode: 2, stdout: "", stderr: formatLines(stderr) };
  }

  if (!parsed.appUrl) {
    stderr.push("--app-url requires an HTTP(S) origin.");
    return { exitCode: 2, stdout: "", stderr: formatLines(stderr) };
  }

  if (!["live-stub", "real-nodeodm"].includes(parsed.mode)) {
    stderr.push("--mode must be live-stub or real-nodeodm.");
    return { exitCode: 2, stdout: "", stderr: formatLines(stderr) };
  }

  let appOrigin;
  try {
    const parsedAppUrl = new URL(parsed.appUrl);
    if (!["http:", "https:"].includes(parsedAppUrl.protocol)) {
      throw new Error("unsupported protocol");
    }
    appOrigin = parsedAppUrl.origin;
  } catch {
    stderr.push("--app-url must be a valid HTTP(S) URL.");
    return { exitCode: 2, stdout: "", stderr: formatLines(stderr) };
  }

  if (parsed.printOperatorLoop && parsed.mode !== "live-stub") {
    stderr.push("--print-operator-loop is only supported with --mode live-stub.");
    return { exitCode: 2, stdout: "", stderr: formatLines(stderr) };
  }

  if (parsed.printOperatorLoop && parsed.allowExample) {
    stderr.push("--print-operator-loop requires a real local env file; --example only checks documented names.");
    return { exitCode: 2, stdout: "", stderr: formatLines(stderr) };
  }

  if (parsed.printEvidenceTemplate && parsed.mode !== "live-stub") {
    stderr.push("--print-evidence-template is only supported with --mode live-stub.");
    return { exitCode: 2, stdout: "", stderr: formatLines(stderr) };
  }

  if (parsed.printEvidenceTemplate && parsed.allowExample) {
    stderr.push("--print-evidence-template requires a real local env file; --example only checks documented names.");
    return { exitCode: 2, stdout: "", stderr: formatLines(stderr) };
  }

  const looksPlaceholder = createPlaceholderDetector(parsed.allowExample);
  const redactedStatus = (name, value) => {
    if (!value) return `${name}=missing`;
    if (looksPlaceholder(name, value)) return `${name}=placeholder`;
    return `${name}=set len=${value.length}`;
  };

  const addShortKeyWarning = (name, value) => {
    if (!value || parsed.allowExample || looksPlaceholder(name, value)) return;
    if (value.length < 80) {
      warnings.push(`${name} is set but shorter than a typical Supabase API key; verify it is a real local key before running the loop`);
    }
  };

  if (!existsSync(parsed.envFile)) {
    failures.push(`${parsed.envFile} does not exist`);
  } else {
    const { env, lineNumbersByName } = parseEnvEntries(readFileSync(parsed.envFile, "utf8"));
    const required = [...requiredBase, ...requiredByMode[parsed.mode]];
    const duplicateGuardNames =
      parsed.mode === "live-stub"
        ? [...required, "NODE_ENV"]
        : [...required, "AERIAL_NODEODM_MODE", "NODE_ENV"];
    failures.push(
      ...duplicateEnvFailures({
        lineNumbersByName,
        names: [...new Set(duplicateGuardNames)],
      }),
    );

    for (const name of required) {
      const value = env.get(name) ?? "";
      if (!value) {
        failures.push(`${name} is missing or empty`);
      } else if (looksPlaceholder(name, value)) {
        failures.push(`${name} still contains a placeholder value`);
      }
    }

    const supabaseUrl = env.get("NEXT_PUBLIC_SUPABASE_URL") ?? "";
    if (supabaseUrl && !parsed.allowExample && !/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(supabaseUrl)) {
      failures.push("NEXT_PUBLIC_SUPABASE_URL must be a hosted Supabase project URL");
    }

    const cronSecret = env.get("CRON_SECRET") ?? "";
    if (cronSecret && !parsed.allowExample && cronSecret.length < 24) {
      failures.push("CRON_SECRET must be at least 24 characters for live bootstrap use");
    }

    const anonKey = env.get("NEXT_PUBLIC_SUPABASE_ANON_KEY") ?? "";
    const serviceRoleKey = env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    addShortKeyWarning("NEXT_PUBLIC_SUPABASE_ANON_KEY", anonKey);
    addShortKeyWarning("SUPABASE_SERVICE_ROLE_KEY", serviceRoleKey);
    if (anonKey && serviceRoleKey && anonKey === serviceRoleKey && !parsed.allowExample) {
      failures.push("NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY must not be identical");
    }

    const nodeOdmMode = env.get("AERIAL_NODEODM_MODE") ?? "";
    if (parsed.mode === "live-stub" && nodeOdmMode && nodeOdmMode !== "stub" && !parsed.allowExample) {
      failures.push("AERIAL_NODEODM_MODE must be set to stub for live-stub round-trip testing");
    }

    if (parsed.mode === "live-stub" && env.get("NODE_ENV") === "production") {
      failures.push("live-stub mode is disallowed when NODE_ENV=production");
    }

    const nodeOdmUrl = env.get("AERIAL_NODEODM_URL") ?? "";
    if (parsed.mode === "live-stub" && nodeOdmUrl && !parsed.allowExample) {
      warnings.push("AERIAL_NODEODM_URL is set but ignored while AERIAL_NODEODM_MODE=stub");
    }
    if (parsed.mode === "real-nodeodm" && nodeOdmMode === "stub" && !parsed.allowExample) {
      failures.push("AERIAL_NODEODM_MODE must not be stub for real-nodeodm mode");
    }
    if (parsed.mode === "real-nodeodm" && nodeOdmUrl && !/^https?:\/\/[^/?#]+(?::[0-9]+)?$/.test(nodeOdmUrl)) {
      failures.push("AERIAL_NODEODM_URL must be a bare HTTP(S) origin");
    }

    stdout.push(`Phase 3 ${parsed.mode} bootstrap check for ${parsed.envFile}:`);
    for (const name of required) {
      stdout.push(`- ${redactedStatus(name, env.get(name) ?? "")}`);
    }
    if (warnings.length > 0) {
      stdout.push("Warnings:");
      for (const warning of warnings) {
        stdout.push(`  - ${warning}`);
      }
    }
  }

  if (failures.length > 0) {
    stderr.push("Phase 3 bootstrap prerequisites are incomplete:");
    for (const failure of failures) {
      stderr.push(`  - ${failure}`);
    }
    stderr.push("No secret values were printed.");
    if (!parsed.allowExample) {
      stderr.push(...buildLocalEnvRepairHints({ envFile: parsed.envFile, mode: parsed.mode }));
    }
    return {
      exitCode: 1,
      stdout: formatLines(stdout),
      stderr: formatLines(stderr),
    };
  }

  stdout.push("Phase 3 bootstrap prerequisites ok. No secret values were printed.");
  if (parsed.printOperatorLoop) {
    stdout.push(...buildOperatorLoopPlan({ appOrigin, envFile: parsed.envFile }));
  }
  if (parsed.printEvidenceTemplate) {
    stdout.push(...buildEvidenceTemplate({ appOrigin, envFile: parsed.envFile, mode: parsed.mode }));
  }

  return {
    exitCode: 0,
    stdout: formatLines(stdout),
    stderr: "",
  };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  const result = runPhase3LiveStubBootstrapCheck(process.argv.slice(2));
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  process.exitCode = result.exitCode;
}
