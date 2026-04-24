#!/usr/bin/env node

const requiredEnv = [
  "AERIAL_E2E_BASE_URL",
  "AERIAL_E2E_OWNER_EMAIL",
  "AERIAL_E2E_OWNER_USER_ID",
  "AERIAL_E2E_ORG_ID",
  "AERIAL_E2E_RASTER_ARTIFACT_ID",
  "AERIAL_E2E_SECOND_ARTIFACT_ID",
  "AERIAL_E2E_SYNTHETIC_JOB_ID",
  "AERIAL_E2E_EXPECT_RASTER",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
];

const uuidEnv = [
  "AERIAL_E2E_OWNER_USER_ID",
  "AERIAL_E2E_ORG_ID",
  "AERIAL_E2E_RASTER_ARTIFACT_ID",
  "AERIAL_E2E_SECOND_ARTIFACT_ID",
  "AERIAL_E2E_SYNTHETIC_JOB_ID",
];

const productionHosts = new Set([
  "aerial-intel-platform.vercel.app",
  "aerial-intel-platform-natford.vercel.app",
]);

function readEnv(name) {
  return process.env[name]?.trim() ?? "";
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function hostnameFromUrl(name, raw) {
  try {
    return new URL(raw).hostname;
  } catch {
    failures.push(`${name} must be an absolute URL`);
    return null;
  }
}

const failures = [];

for (const name of requiredEnv) {
  if (!readEnv(name)) failures.push(`${name} is required`);
}

for (const name of uuidEnv) {
  const value = readEnv(name);
  if (value && !isUuid(value)) failures.push(`${name} must be a UUID`);
}

const expectRaster = readEnv("AERIAL_E2E_EXPECT_RASTER");
if (expectRaster && !["0", "1"].includes(expectRaster)) {
  failures.push("AERIAL_E2E_EXPECT_RASTER must be 0 or 1");
}

const baseUrl = readEnv("AERIAL_E2E_BASE_URL");
const baseHost = baseUrl ? hostnameFromUrl("AERIAL_E2E_BASE_URL", baseUrl) : null;
if (baseHost && productionHosts.has(baseHost)) {
  failures.push(
    "AERIAL_E2E_BASE_URL points at the production alias; authenticated smoke must target a dedicated test/preview deployment",
  );
}

const supabaseUrl = readEnv("NEXT_PUBLIC_SUPABASE_URL");
if (supabaseUrl) hostnameFromUrl("NEXT_PUBLIC_SUPABASE_URL", supabaseUrl);

if (readEnv("AERIAL_E2E_CONFIRMED_DEDICATED_PROJECT") !== "1") {
  failures.push(
    "AERIAL_E2E_CONFIRMED_DEDICATED_PROJECT=1 is required because this smoke creates temporary users/comments with service-role credentials",
  );
}

if (failures.length > 0) {
  console.error("Authenticated smoke prerequisites are incomplete:");
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log("Authenticated smoke prerequisites ok.");
