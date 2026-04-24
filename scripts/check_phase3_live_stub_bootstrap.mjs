#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";

const args = process.argv.slice(2);
let envFile = "web/.env.local";
let allowExample = false;
let mode = "live-stub";

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
  } else if (arg === "-h" || arg === "--help") {
    console.log(`Usage: node scripts/check_phase3_live_stub_bootstrap.mjs [--env-file PATH] [--example] [--mode live-stub|real-nodeodm]

Checks the local Phase 3 / live-stub bootstrap environment without printing
secret values. --example validates that web/.env.example still documents the
required names; the default checks web/.env.local for an executable live-stub
round-trip posture.`);
    process.exit(0);
  } else {
    console.error(`unknown argument: ${arg}`);
    process.exit(2);
  }
}

if (!envFile) {
  console.error("--env-file requires a path.");
  process.exit(2);
}

if (!["live-stub", "real-nodeodm"].includes(mode)) {
  console.error("--mode must be live-stub or real-nodeodm.");
  process.exit(2);
}

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

function parseEnv(text) {
  const env = new Map();
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    let value = match[2] ?? "";
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env.set(match[1], value);
  }
  return env;
}

function looksPlaceholder(name, value) {
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
}

function redactedStatus(name, value) {
  if (!value) return `${name}=missing`;
  if (looksPlaceholder(name, value)) return `${name}=placeholder`;
  return `${name}=set len=${value.length}`;
}

const failures = [];

if (!existsSync(envFile)) {
  failures.push(`${envFile} does not exist`);
} else {
  const env = parseEnv(readFileSync(envFile, "utf8"));
  const required = [...requiredBase, ...requiredByMode[mode]];

  for (const name of required) {
    const value = env.get(name) ?? "";
    if (!value) {
      failures.push(`${name} is missing or empty`);
    } else if (looksPlaceholder(name, value)) {
      failures.push(`${name} still contains a placeholder value`);
    }
  }

  const supabaseUrl = env.get("NEXT_PUBLIC_SUPABASE_URL") ?? "";
  if (supabaseUrl && !allowExample && !/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(supabaseUrl)) {
    failures.push("NEXT_PUBLIC_SUPABASE_URL must be a hosted Supabase project URL");
  }

  const cronSecret = env.get("CRON_SECRET") ?? "";
  if (cronSecret && !allowExample && cronSecret.length < 24) {
    failures.push("CRON_SECRET must be at least 24 characters for live bootstrap use");
  }

  const nodeOdmMode = env.get("AERIAL_NODEODM_MODE") ?? "";
  if (mode === "live-stub" && nodeOdmMode && nodeOdmMode !== "stub" && !allowExample) {
    failures.push("AERIAL_NODEODM_MODE must be set to stub for live-stub round-trip testing");
  }

  if (mode === "live-stub" && env.get("NODE_ENV") === "production") {
    failures.push("live-stub mode is disallowed when NODE_ENV=production");
  }

  const nodeOdmUrl = env.get("AERIAL_NODEODM_URL") ?? "";
  if (mode === "real-nodeodm" && nodeOdmUrl && !/^https?:\/\/[^/?#]+(?::[0-9]+)?$/.test(nodeOdmUrl)) {
    failures.push("AERIAL_NODEODM_URL must be a bare HTTP(S) origin");
  }

  console.log(`Phase 3 ${mode} bootstrap check for ${envFile}:`);
  for (const name of required) {
    console.log(`- ${redactedStatus(name, env.get(name) ?? "")}`);
  }
}

if (failures.length > 0) {
  console.error("Phase 3 bootstrap prerequisites are incomplete:");
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }
  console.error("No secret values were printed.");
  process.exit(1);
}

console.log("Phase 3 bootstrap prerequisites ok. No secret values were printed.");
