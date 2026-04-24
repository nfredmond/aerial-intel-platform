#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const webDir = resolve(repoRoot, "web");

const requiredProductionEnv = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "CRON_SECRET",
  "AERIAL_TITILER_URL",
  "AERIAL_COPILOT_ENABLED",
  "AERIAL_COPILOT_DEFAULT_CAP_TENTH_CENTS",
];

function parseArgs(argv) {
  const options = {
    scope: process.env.VERCEL_SCOPE ?? "natford",
    project: process.env.VERCEL_PROJECT ?? "aerial-intel-platform",
    environment: process.env.VERCEL_ENVIRONMENT ?? "production",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--scope") {
      options.scope = argv[index + 1] ?? "";
      index += 1;
    } else if (arg === "--project") {
      options.project = argv[index + 1] ?? "";
      index += 1;
    } else if (arg === "--environment") {
      options.environment = argv[index + 1] ?? "";
      index += 1;
    } else if (arg === "--help" || arg === "-h") {
      console.log(
        "Usage: scripts/check_vercel_production_env_names.mjs [--scope natford] [--project aerial-intel-platform] [--environment production]",
      );
      process.exit(0);
    } else {
      console.error(`unknown argument: ${arg}`);
      process.exit(2);
    }
  }

  if (!options.scope || !options.project || !options.environment) {
    console.error("--scope, --project, and --environment must be non-empty.");
    process.exit(2);
  }

  return options;
}

function parseVercelJson(stdout) {
  const jsonStart = stdout.indexOf("{");
  if (jsonStart === -1) {
    throw new Error("vercel env ls did not return JSON.");
  }
  return JSON.parse(stdout.slice(jsonStart));
}

const options = parseArgs(process.argv.slice(2));
const stdout = execFileSync(
  "vercel",
  [
    "env",
    "ls",
    options.environment,
    "--scope",
    options.scope,
    "--format=json",
    "--guidance=false",
  ],
  { cwd: webDir, encoding: "utf8" },
);

const payload = parseVercelJson(stdout);
const names = new Set((payload.envs ?? []).map((env) => env.key));
const missing = requiredProductionEnv.filter((name) => !names.has(name));

if (missing.length > 0) {
  console.error(
    `Vercel ${options.environment} env-name prerequisites are incomplete for ${options.scope}/${options.project}.`,
  );
  console.error("Missing names:");
  for (const name of missing) console.error(`  - ${name}`);
  console.error("No secret values were requested or printed.");
  process.exit(1);
}

console.log(
  `Vercel ${options.environment} env-name prerequisites ok for ${options.scope}/${options.project}.`,
);
