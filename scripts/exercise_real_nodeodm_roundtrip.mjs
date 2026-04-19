#!/usr/bin/env node
// Standalone R-3 exercise: feed a real ZIP of drone images to a running
// NodeODM container, wait for it to finish, download the output bundle,
// and run it through the real-output adapter. Emits evidence to stdout.
//
// This lives outside the Next.js app so we can prove the real-bundle
// branch of web/src/app/api/internal/nodeodm-poll/route.ts works on a
// genuine ODM zip without spinning up Supabase + the dev server.
//
// Usage:
//   node scripts/exercise_real_nodeodm_roundtrip.mjs <zip_file> [--name <label>] [--preset balanced]
//
// Env:
//   NODEODM_URL  (default: http://localhost:3101)

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { basename } from "node:path";
import { unzipSync, strFromU8 } from "../web/node_modules/fflate/esm/browser.js";

function parseArgs(argv) {
  const args = { preset: "balanced", name: undefined };
  const positional = [];
  for (let i = 0; i < argv.length; i += 1) {
    const tok = argv[i];
    if (tok === "--preset") { args.preset = argv[++i]; continue; }
    if (tok === "--name") { args.name = argv[++i]; continue; }
    if (tok.startsWith("--")) { continue; }
    positional.push(tok);
  }
  args.zip = positional[0];
  return args;
}

const PRESETS = {
  "fast-ortho": [
    { name: "orthophoto-resolution", value: 5 },
    { name: "feature-quality", value: "medium" },
    { name: "min-num-features", value: 8000 },
    { name: "fast-orthophoto", value: true },
  ],
  balanced: [
    { name: "orthophoto-resolution", value: 3 },
    { name: "dsm", value: true },
    { name: "feature-quality", value: "high" },
    { name: "min-num-features", value: 12000 },
  ],
};

const ORTHOPHOTO_PATHS = ["odm_orthophoto/odm_orthophoto.tif"];
const DSM_PATHS = ["odm_dem/dsm.tif"];
const DTM_PATHS = ["odm_dem/dtm.tif"];
const POINT_CLOUD_PATHS = [
  "odm_georeferencing/odm_georeferenced_model.laz",
  "entwine_pointcloud/ept.json",
];
const MESH_PATHS = [
  "odm_texturing/odm_textured_model_geo.obj",
  "odm_texturing/odm_textured_model.obj",
];

function firstMatch(entries, candidates) {
  for (const path of candidates) {
    const bytes = entries[path];
    if (bytes) return { path, sizeBytes: bytes.length };
  }
  return null;
}

function inventoryNodeOdmBundle(entries) {
  return {
    hasBenchmarkSummary: Boolean(entries["benchmark_summary.json"]),
    orthophoto: firstMatch(entries, ORTHOPHOTO_PATHS),
    dsm: firstMatch(entries, DSM_PATHS),
    dtm: firstMatch(entries, DTM_PATHS),
    pointCloud: firstMatch(entries, POINT_CLOUD_PATHS),
    mesh: firstMatch(entries, MESH_PATHS),
    entryCount: Object.keys(entries).length,
  };
}

function slot(defaultPath, inv) {
  if (!inv) return { path: defaultPath, exists: false, non_zero_size: false, size_bytes: 0 };
  return { path: inv.path, exists: true, non_zero_size: inv.sizeBytes > 0, size_bytes: inv.sizeBytes };
}

function synthesizeBenchmarkSummary(inv, { taskUuid, importedAt }) {
  const orthophotoPresent = Boolean(inv.orthophoto && inv.orthophoto.sizeBytes > 0);
  const dsmPresent = Boolean(inv.dsm && inv.dsm.sizeBytes > 0);
  const requiredOutputsPresent = orthophotoPresent && dsmPresent;
  const missing = [];
  if (!orthophotoPresent) missing.push("orthophoto");
  if (!dsmPresent) missing.push("dem");
  return {
    timestamp_utc: importedAt,
    end_timestamp_utc: importedAt,
    project_name: `nodeodm-${taskUuid.slice(0, 8)}`,
    dataset_root: "managed-by-nodeodm",
    image_count: 0,
    duration_seconds: 0,
    odm_image: "managed-by-nodeodm",
    odm_args: "",
    docker_version: "managed-by-nodeodm",
    host: "managed-by-nodeodm",
    run_log: "",
    status: requiredOutputsPresent ? "success" : "partial",
    run_exit_code: 0,
    outputs: {
      orthophoto: slot("odm_orthophoto/odm_orthophoto.tif", inv.orthophoto),
      dem: slot("odm_dem/dsm.tif", inv.dsm),
      point_cloud: slot("odm_georeferencing/odm_georeferenced_model.laz", inv.pointCloud),
      mesh: slot("odm_texturing/odm_textured_model_geo.obj", inv.mesh),
    },
    qa_gate: {
      required_outputs_present: requiredOutputsPresent,
      minimum_pass: requiredOutputsPresent,
      missing_required_outputs: missing,
    },
    source: "nodeodm-real-bundle",
    task_uuid: taskUuid,
  };
}

function log(msg) { console.log(`[${new Date().toISOString()}] ${msg}`); }

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.zip) { console.error("usage: exercise_real_nodeodm_roundtrip.mjs <zip>"); process.exit(1); }
  const baseUrl = (process.env.NODEODM_URL || "http://localhost:3101").replace(/\/+$/, "");
  const options = PRESETS[args.preset];
  if (!options) { console.error(`unknown preset: ${args.preset}`); process.exit(1); }

  log(`reading ${args.zip}`);
  const zipBytes = await readFile(args.zip);
  const entries = unzipSync(new Uint8Array(zipBytes));
  const imageNames = Object.keys(entries).filter((n) => !n.endsWith("/") && /\.(jpe?g|png|tif)$/i.test(n));
  log(`found ${imageNames.length} images in zip`);
  if (imageNames.length < 5) { console.error("refusing to run with fewer than 5 images"); process.exit(1); }

  const startMs = Date.now();

  log(`POST ${baseUrl}/task/new/init`);
  const initForm = new FormData();
  initForm.append("name", args.name || `toledo-${imageNames.length}-${new Date().toISOString()}`);
  initForm.append("options", JSON.stringify(options));
  const initResp = await fetch(`${baseUrl}/task/new/init`, { method: "POST", body: initForm });
  if (!initResp.ok) throw new Error(`init failed: ${initResp.status} ${await initResp.text()}`);
  const { uuid } = await initResp.json();
  log(`task uuid: ${uuid}`);

  let uploaded = 0;
  for (const name of imageNames) {
    const bytes = entries[name];
    const form = new FormData();
    form.append("images", new Blob([bytes]), basename(name));
    const resp = await fetch(`${baseUrl}/task/new/upload/${encodeURIComponent(uuid)}`, { method: "POST", body: form });
    if (!resp.ok) throw new Error(`upload failed for ${name}: ${resp.status} ${await resp.text()}`);
    uploaded += 1;
    if (uploaded % 5 === 0) log(`uploaded ${uploaded}/${imageNames.length}`);
  }
  log(`uploaded ${uploaded}/${imageNames.length}`);

  const commitForm = new FormData();
  const commitResp = await fetch(`${baseUrl}/task/new/commit/${encodeURIComponent(uuid)}`, { method: "POST", body: commitForm });
  if (!commitResp.ok) throw new Error(`commit failed: ${commitResp.status} ${await commitResp.text()}`);
  const commitMs = Date.now();
  log(`committed (upload+commit took ${Math.round((commitMs - startMs) / 1000)}s)`);

  let lastStatus = null;
  let lastProgress = null;
  let pollCount = 0;
  while (true) {
    pollCount += 1;
    await new Promise((r) => setTimeout(r, 30_000));
    const resp = await fetch(`${baseUrl}/task/${encodeURIComponent(uuid)}/info`);
    if (!resp.ok) { log(`info poll ${pollCount}: HTTP ${resp.status}`); continue; }
    const info = await resp.json();
    const code = info?.status?.code;
    const progress = typeof info?.progress === "number" ? info.progress : null;
    const changed = code !== lastStatus || progress !== lastProgress;
    if (changed) log(`poll ${pollCount}: status.code=${code}, progress=${progress}`);
    lastStatus = code;
    lastProgress = progress;
    if (code === 40 || code === 30 || code === 50) {
      log(`terminal status ${code} reached`);
      if (code !== 40) {
        console.error(`task did not complete successfully: ${JSON.stringify(info, null, 2)}`);
        process.exit(2);
      }
      break;
    }
  }
  const doneMs = Date.now();
  log(`processing took ${Math.round((doneMs - commitMs) / 1000)}s (~${Math.round((doneMs - commitMs) / 60000)} min)`);

  log(`GET ${baseUrl}/task/${uuid}/download/all.zip`);
  const dlResp = await fetch(`${baseUrl}/task/${encodeURIComponent(uuid)}/download/all.zip`);
  if (!dlResp.ok) throw new Error(`download failed: ${dlResp.status}`);
  const outBytes = new Uint8Array(await dlResp.arrayBuffer());
  log(`bundle bytes: ${outBytes.length}`);

  const evidenceRoot = `${process.env.HOME}/.openclaw/workspace/datasets/toledo-20-evidence`;
  await mkdir(evidenceRoot, { recursive: true });
  const bundlePath = `${evidenceRoot}/${uuid}.zip`;
  await writeFile(bundlePath, outBytes);
  log(`saved bundle: ${bundlePath}`);

  const outEntries = unzipSync(outBytes);
  const entryList = Object.keys(outEntries).sort();
  log(`bundle contains ${entryList.length} entries`);

  const hasBenchmarkSummary = Boolean(outEntries["benchmark_summary.json"]);
  log(`has benchmark_summary.json: ${hasBenchmarkSummary}`);

  const inv = inventoryNodeOdmBundle(outEntries);
  log(`inventory: ${JSON.stringify({
    orthophoto: inv.orthophoto,
    dsm: inv.dsm,
    dtm: inv.dtm,
    pointCloud: inv.pointCloud,
    mesh: inv.mesh,
    entryCount: inv.entryCount,
  }, null, 2)}`);

  const summary = synthesizeBenchmarkSummary(inv, { taskUuid: uuid, importedAt: new Date().toISOString() });
  log(`synthesized benchmarkSummary.status: ${summary.status}`);
  log(`synthesized qa_gate: ${JSON.stringify(summary.qa_gate)}`);
  log(`synthesized outputs: ${JSON.stringify(summary.outputs, null, 2)}`);

  // Write compact evidence manifest
  const manifest = {
    taskUuid: uuid,
    nodeodmUrl: baseUrl,
    preset: args.preset,
    options,
    imageCount: imageNames.length,
    commitToCompleteMs: doneMs - commitMs,
    uploadToCommitMs: commitMs - startMs,
    bundleBytes: outBytes.length,
    entryList: entryList.slice(0, 300),
    entryListTruncated: entryList.length > 300,
    hasBenchmarkSummary,
    inventory: inv,
    synthesizedSummary: summary,
    timestampUtc: new Date().toISOString(),
  };
  const manifestPath = `${evidenceRoot}/${uuid}.manifest.json`;
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  log(`evidence manifest: ${manifestPath}`);

  log(`status: ${summary.status === "success" ? "SUCCESS" : "PARTIAL"}`);
  if (summary.status !== "success") {
    console.error(`required outputs missing: ${summary.qa_gate.missing_required_outputs.join(", ")}`);
    process.exit(3);
  }
}

main().catch((err) => {
  console.error(`fatal: ${err.message}`);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
