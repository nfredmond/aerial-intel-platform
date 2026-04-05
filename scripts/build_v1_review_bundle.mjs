#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";

function parseArgs(argv) {
  const args = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;

    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args[key] = "true";
      continue;
    }

    args[key] = next;
    index += 1;
  }

  return args;
}

function usage() {
  console.log(`
Build a truthful download-first review bundle from an ODM benchmark summary.

Usage:
  node scripts/build_v1_review_bundle.mjs \
    --summary <benchmark-summary.json> \
    --export-dir <directory> \
    --project-name <project-slug> \
    [--mission-name <display-name>]
`);
}

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function resolveMaybeRelative(basePath, candidate) {
  if (!candidate || typeof candidate !== "string") {
    return null;
  }

  if (path.isAbsolute(candidate)) {
    return candidate;
  }

  return path.resolve(path.dirname(basePath), candidate);
}

function inferBundleFileName(key, sourcePath) {
  const extension = path.extname(sourcePath || "");

  switch (key) {
    case "orthophoto":
      return `orthophoto${extension || ".tif"}`;
    case "dem":
      return `dem${extension || ".tif"}`;
    case "point_cloud":
      return `point-cloud${extension || ".laz"}`;
    case "mesh":
      return `mesh${extension || ".obj"}`;
    default:
      return `${key}${extension}`;
  }
}

function buildReviewMarkdown({
  missionName,
  projectName,
  summary,
  includedArtifacts,
  missingArtifacts,
  bundleReady,
  summaryDestination,
  runLogDestination,
  manifestDestination,
}) {
  const lines = [
    `# V1 Review Bundle — ${missionName || projectName}`,
    "",
    `- Status: ${bundleReady ? "Ready for download-first review" : "Review required before calling this a v1 pass"}`,
    `- Project slug: ${projectName}`,
    `- Mission label: ${missionName || "Not provided"}`,
    `- ODM run status: ${summary.status ?? "unknown"}`,
    `- Minimum pass: ${summary.qa_gate?.minimum_pass === true ? "yes" : "no"}`,
    `- Required outputs present: ${summary.qa_gate?.required_outputs_present === true ? "yes" : "no"}`,
    `- Images processed: ${typeof summary.image_count === "number" ? summary.image_count : "unknown"}`,
    `- Duration (sec): ${typeof summary.duration_seconds === "number" ? summary.duration_seconds : "unknown"}`,
    `- ODM image: ${summary.odm_image ?? "unknown"}`,
    `- Summary file: ${summaryDestination}`,
    `- Run log: ${runLogDestination ?? "Not copied"}`,
    `- Manifest: ${manifestDestination}`,
    "",
    "## Included deliverables",
  ];

  if (includedArtifacts.length === 0) {
    lines.push("- No real deliverables were copied into this bundle.");
  } else {
    for (const artifact of includedArtifacts) {
      lines.push(`- ${artifact.key}: ${artifact.bundlePath} (${artifact.sizeBytes} bytes)`);
    }
  }

  lines.push("", "## Missing or flagged outputs");

  if (missingArtifacts.length === 0) {
    lines.push("- None.");
  } else {
    for (const artifact of missingArtifacts) {
      lines.push(`- ${artifact.key}: ${artifact.reason}`);
    }
  }

  lines.push(
    "",
    "## Truth notes",
    "- This bundle only contains files emitted by the actual ODM run referenced in `run_summary.json`.",
    "- Missing outputs stay missing; the bundle does not fabricate placeholders.",
    "- Browser upload/orchestration, NodeODM job dispatch, and signed-download delivery are still separate follow-on work.",
  );

  return `${lines.join("\n")}\n`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help === "true") {
    usage();
    process.exit(0);
  }

  const summaryPath = args.summary?.trim();
  const exportDir = args["export-dir"]?.trim();
  const projectName = args["project-name"]?.trim();
  const missionName = args["mission-name"]?.trim() || projectName || "Unnamed mission";

  if (!summaryPath || !exportDir || !projectName) {
    usage();
    throw new Error("--summary, --export-dir, and --project-name are required.");
  }

  const rawSummary = await fs.readFile(summaryPath, "utf8");
  const summary = JSON.parse(rawSummary);
  const outputs = asRecord(summary.outputs);

  await fs.mkdir(exportDir, { recursive: true });
  const deliverablesDir = path.join(exportDir, "deliverables");
  await fs.mkdir(deliverablesDir, { recursive: true });

  const summaryDestination = path.join(exportDir, "run_summary.json");
  await fs.copyFile(summaryPath, summaryDestination);

  const runLogSource = resolveMaybeRelative(summaryPath, summary.run_log);
  const runLogDestination = runLogSource && await fileExists(runLogSource)
    ? path.join(exportDir, "run.log")
    : null;

  if (runLogDestination && runLogSource) {
    await fs.copyFile(runLogSource, runLogDestination);
  }

  const artifactPlan = [
    { key: "orthophoto", required: true },
    { key: "dem", required: true },
    { key: "point_cloud", required: true },
    { key: "mesh", required: false },
  ];

  const includedArtifacts = [];
  const missingArtifacts = [];

  for (const item of artifactPlan) {
    const output = asRecord(outputs[item.key]);
    const sourcePath = resolveMaybeRelative(summaryPath, output.path);
    const existsOnSummary = output.exists === true && output.non_zero_size === true;
    const existsOnDisk = sourcePath ? await fileExists(sourcePath) : false;

    if (existsOnSummary && existsOnDisk && sourcePath) {
      const bundleFileName = inferBundleFileName(item.key, sourcePath);
      const bundlePath = path.join("deliverables", bundleFileName);
      const destination = path.join(exportDir, bundlePath);
      await fs.copyFile(sourcePath, destination);

      includedArtifacts.push({
        key: item.key,
        required: item.required,
        sourcePath,
        bundlePath,
        sizeBytes: typeof output.size_bytes === "number" ? output.size_bytes : 0,
      });
      continue;
    }

    const reason = !sourcePath
      ? "No source path recorded in summary.json."
      : existsOnSummary && !existsOnDisk
        ? `Summary reported a file, but it was not found on disk at ${sourcePath}.`
        : "Output was not emitted as a non-zero file by the ODM run.";

    missingArtifacts.push({
      key: item.key,
      required: item.required,
      reason,
    });
  }

  const requiredArtifacts = includedArtifacts.filter((artifact) => artifact.required);
  const bundleReady = summary.status === "success"
    && summary.qa_gate?.minimum_pass === true
    && requiredArtifacts.length === 3;

  const manifest = {
    generatedAt: new Date().toISOString(),
    projectName,
    missionName,
    sourceSummaryPath: path.resolve(summaryPath),
    sourceRunLogPath: runLogSource ? path.resolve(runLogSource) : null,
    summaryStatus: summary.status ?? "unknown",
    qaGate: {
      requiredOutputsPresent: summary.qa_gate?.required_outputs_present === true,
      minimumPass: summary.qa_gate?.minimum_pass === true,
      missingRequiredOutputs: Array.isArray(summary.qa_gate?.missing_required_outputs)
        ? summary.qa_gate.missing_required_outputs
        : [],
    },
    bundleReady,
    includedArtifacts,
    missingArtifacts,
  };

  const manifestDestination = path.join(exportDir, "EXPORT_MANIFEST.json");
  await fs.writeFile(manifestDestination, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  const reviewMarkdown = buildReviewMarkdown({
    missionName,
    projectName,
    summary,
    includedArtifacts,
    missingArtifacts,
    bundleReady,
    summaryDestination: path.basename(summaryDestination),
    runLogDestination: runLogDestination ? path.basename(runLogDestination) : null,
    manifestDestination: path.basename(manifestDestination),
  });
  await fs.writeFile(path.join(exportDir, "REVIEW.md"), reviewMarkdown, "utf8");

  console.log(JSON.stringify({
    bundleReady,
    exportDir: path.resolve(exportDir),
    manifestPath: path.resolve(manifestDestination),
    reviewPath: path.resolve(path.join(exportDir, "REVIEW.md")),
    includedArtifacts: includedArtifacts.length,
    missingArtifacts: missingArtifacts.length,
  }, null, 2));
}

main().catch((error) => {
  console.error("\n❌ Failed to build v1 review bundle");
  console.error(error.message);
  process.exit(1);
});
