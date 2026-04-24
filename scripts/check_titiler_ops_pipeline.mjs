#!/usr/bin/env node
import { readFileSync } from "node:fs";

const prereqPath = "scripts/check_titiler_deploy_prereqs.sh";
const wrapperPath = "scripts/run_titiler_cloud_run_workflow.sh";
const workflowPath = ".github/workflows/deploy-titiler-cloud-run.yml";

const prereq = readFileSync(prereqPath, "utf8");
const wrapper = readFileSync(wrapperPath, "utf8");
const workflow = readFileSync(workflowPath, "utf8");

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
}

for (const name of requiredSecrets) {
  if (!workflow.includes(`${name}: \${{ secrets.${name} }}`)) {
    failures.push(`${workflowPath}: missing mapping for secrets.${name}`);
  }
}

if (!workflow.includes("scripts/check_titiler_deploy_prereqs.sh --env")) {
  failures.push(`${workflowPath}: must run deploy prereq check in --env mode before auth/deploy`);
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

if (failures.length > 0) {
  console.error("TiTiler ops pipeline drift detected:");
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }
  process.exit(1);
}

console.log("TiTiler ops pipeline checks passed.");
