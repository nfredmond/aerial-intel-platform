#!/usr/bin/env node
import { readFileSync } from "node:fs";

const prereqPath = "scripts/check_titiler_deploy_prereqs.sh";
const bootstrapPath = "scripts/bootstrap_titiler_gcp_wif.sh";
const setupPath = "scripts/configure_titiler_github_actions_prereqs.sh";
const wrapperPath = "scripts/run_titiler_cloud_run_workflow.sh";
const gcloudInstallPath = "scripts/install_gcloud_cli_verified.sh";
const liveStubCheckPath = "scripts/check_phase3_live_stub_bootstrap.mjs";
const liveStubCheckTestPath = "scripts/check_phase3_live_stub_bootstrap.test.mjs";
const workflowPath = ".github/workflows/deploy-titiler-cloud-run.yml";
const titilerSetupPath = "docs/ops/titiler-setup.md";
const releaseChecklistPath = "docs/RELEASE_CHECKLIST.md";
const liveStubBootstrapPath = "docs/ops/2026-04-24-phase-3-live-stub-bootstrap.md";

const prereq = readFileSync(prereqPath, "utf8");
const bootstrap = readFileSync(bootstrapPath, "utf8");
const setup = readFileSync(setupPath, "utf8");
const wrapper = readFileSync(wrapperPath, "utf8");
const gcloudInstall = readFileSync(gcloudInstallPath, "utf8");
const liveStubCheck = readFileSync(liveStubCheckPath, "utf8");
const liveStubCheckTest = readFileSync(liveStubCheckTestPath, "utf8");
const workflow = readFileSync(workflowPath, "utf8");
const titilerSetup = readFileSync(titilerSetupPath, "utf8");
const releaseChecklist = readFileSync(releaseChecklistPath, "utf8");
const liveStubBootstrap = readFileSync(liveStubBootstrapPath, "utf8");

const failures = [];

function extractBashArray(source, name) {
  const match = source.match(new RegExp(`${name}=\\(\\n([\\s\\S]*?)\\n\\)`));
  if (!match) {
    failures.push(`${prereqPath}: missing ${name} array`);
    return [];
  }

  return match[1]
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"))
    .map((line) => line.replace(/^["']|["']$/g, ""));
}

const requiredVars = extractBashArray(prereq, "required_vars");
const requiredSecrets = extractBashArray(prereq, "required_secrets");

for (const name of requiredVars) {
  if (!workflow.includes(`${name}: \${{ vars.${name} }}`)) {
    failures.push(`${workflowPath}: missing env mapping for vars.${name}`);
  }

  if (!setup.includes(name)) {
    failures.push(`${setupPath}: missing prompt/write handling for variable ${name}`);
  }

  if (!bootstrap.includes(name)) {
    failures.push(`${bootstrapPath}: missing prompt/write handling for variable ${name}`);
  }
}

for (const name of requiredSecrets) {
  if (!workflow.includes(`${name}: \${{ secrets.${name} }}`)) {
    failures.push(`${workflowPath}: missing mapping for secrets.${name}`);
  }

  if (!setup.includes(name)) {
    failures.push(`${setupPath}: missing prompt/write handling for secret ${name}`);
  }

  if (!bootstrap.includes(name)) {
    failures.push(`${bootstrapPath}: missing write handling for secret ${name}`);
  }
}

if (!workflow.includes("scripts/check_titiler_deploy_prereqs.sh --env")) {
  failures.push(`${workflowPath}: must run deploy prereq check in --env mode before auth/deploy`);
}

if (!setup.includes("scripts/check_titiler_deploy_prereqs.sh --env")) {
  failures.push(`${setupPath}: must validate prompted values in --env mode before GitHub writes`);
}

if (!bootstrap.includes("scripts/check_titiler_deploy_prereqs.sh --env")) {
  failures.push(`${bootstrapPath}: must validate prompted values in --env mode before GCP/GitHub writes`);
}

if (!setup.includes('gh variable set "$name" --repo "$REPO"')) {
  failures.push(`${setupPath}: must write GitHub variables through gh`);
}

if (!bootstrap.includes('gh variable set "$name" --repo "$REPO"')) {
  failures.push(`${bootstrapPath}: must write GitHub variables through gh`);
}

if (!setup.includes('gh secret set "$name" --repo "$REPO"')) {
  failures.push(`${setupPath}: must write GitHub secrets through gh`);
}

if (!bootstrap.includes('gh secret set "$name" --repo "$REPO"')) {
  failures.push(`${bootstrapPath}: must write GitHub secrets through gh`);
}

if (!bootstrap.includes("gcloud iam workload-identity-pools providers create-oidc")) {
  failures.push(`${bootstrapPath}: must create the GitHub OIDC Workload Identity provider`);
}

if (!wrapper.includes(`WORKFLOW="deploy-titiler-cloud-run.yml"`)) {
  failures.push(`${wrapperPath}: must dispatch ${workflowPath}`);
}

if (!wrapper.includes('scripts/check_titiler_deploy_prereqs.sh --repo "$REPO"')) {
  failures.push(`${wrapperPath}: must run repository prereq check before workflow dispatch`);
}

if (!wrapper.includes('gh workflow run "$WORKFLOW"')) {
  failures.push(`${wrapperPath}: must dispatch the configured workflow through gh`);
}

if (!gcloudInstall.includes("GCLOUD_ARCHIVE_SHA256")) {
  failures.push(`${gcloudInstallPath}: must require GCLOUD_ARCHIVE_SHA256 / --sha256`);
}

if (!gcloudInstall.includes("sha256sum -c -")) {
  failures.push(`${gcloudInstallPath}: must verify the archive with sha256sum before extract/install`);
}

if (/curl\s+[^\\n|]*\|\s*(bash|sh)/.test(gcloudInstall)) {
  failures.push(`${gcloudInstallPath}: must not use curl-piped shell install patterns`);
}

if (gcloudInstall.includes("gcloud auth login") && !gcloudInstall.includes("Then authenticate intentionally")) {
  failures.push(`${gcloudInstallPath}: must not run gcloud auth as part of install`);
}

if (!titilerSetup.includes("scripts/install_gcloud_cli_verified.sh")) {
  failures.push(`${titilerSetupPath}: must document checksum-gated gcloud installation`);
}

if (!releaseChecklist.includes("scripts/install_gcloud_cli_verified.sh")) {
  failures.push(`${releaseChecklistPath}: must include checksum-gated gcloud installation`);
}

for (const name of [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "CRON_SECRET",
  "AERIAL_NODEODM_MODE",
]) {
  if (!liveStubCheck.includes(name)) {
    failures.push(`${liveStubCheckPath}: must check ${name}`);
  }
  if (!liveStubBootstrap.includes(name)) {
    failures.push(`${liveStubBootstrapPath}: must document ${name}`);
  }
}

if (!liveStubCheck.includes("--print-operator-loop")) {
  failures.push(`${liveStubCheckPath}: must keep the redacted operator-loop plan flag`);
}

if (!liveStubBootstrap.includes("--print-operator-loop")) {
  failures.push(`${liveStubBootstrapPath}: must document the redacted operator-loop plan`);
}

if (!liveStubBootstrap.includes("node --test scripts/check_phase3_live_stub_bootstrap.test.mjs")) {
  failures.push(`${liveStubBootstrapPath}: must document the live-stub bootstrap test`);
}

if (!liveStubCheckTest.includes("doesNotMatch") || !liveStubCheckTest.includes("local-cron-secret-value-that-is-long")) {
  failures.push(`${liveStubCheckTestPath}: must verify that secret-like values are not printed`);
}

if (!liveStubBootstrap.includes("No GCP writes were run")) {
  failures.push(`${liveStubBootstrapPath}: must explicitly document that setup inspection ran without GCP writes`);
}

if (failures.length > 0) {
  console.error("TiTiler ops pipeline drift detected:");
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }
  process.exit(1);
}

console.log("TiTiler ops pipeline checks passed.");
