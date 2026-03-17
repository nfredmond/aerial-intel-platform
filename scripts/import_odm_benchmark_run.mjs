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
Import an ODM benchmark summary into the aerial-ops data model.

Usage:
  node scripts/import_odm_benchmark_run.mjs --org-slug <slug> --mission-id <uuid> --summary <path>

Required environment variables:
  SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY

Optional:
  --dataset-id <uuid>       Attach import to an existing dataset
  --dataset-name <name>     Create dataset with this name if dataset-id omitted and none exists
  --job-name <name>         Override job display name
  --external-ref <value>    Override external job reference
`);
}

async function safeJson(response) {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function createClient({ supabaseUrl, serviceRoleKey }) {
  async function request(apiPath, { method = "GET", body, headers } = {}) {
    const response = await fetch(`${supabaseUrl}${apiPath}`, {
      method,
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
        ...(headers ?? {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    const data = await safeJson(response);

    if (!response.ok) {
      const message =
        typeof data === "object" && data && "message" in data
          ? String(data.message)
          : `Request failed (${response.status})`;
      const error = new Error(message);
      error.status = response.status;
      error.payload = data;
      throw error;
    }

    return data;
  }

  async function selectOne(table, query) {
    const result = await request(`/rest/v1/${table}?${query}`);
    if (!Array.isArray(result) || !result[0]) {
      return null;
    }
    return result[0];
  }

  async function selectMany(table, query) {
    const result = await request(`/rest/v1/${table}?${query}`);
    return Array.isArray(result) ? result : [];
  }

  async function insertOne(table, row) {
    const rows = await request(`/rest/v1/${table}?select=*`, {
      method: "POST",
      headers: {
        Prefer: "return=representation",
      },
      body: row,
    });

    if (!Array.isArray(rows) || !rows[0]) {
      throw new Error(`Insert for ${table} returned no rows`);
    }

    return rows[0];
  }

  async function insertMany(table, rows) {
    if (rows.length === 0) return [];
    return request(`/rest/v1/${table}`, {
      method: "POST",
      headers: {
        Prefer: "return=representation",
      },
      body: rows,
    });
  }

  return { selectOne, selectMany, insertOne, insertMany };
}

function normalizeSlug(input) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function mapJobStatus(summary) {
  if (summary.status !== "success") {
    return "failed";
  }

  if (summary.qa_gate?.minimum_pass) {
    return "succeeded";
  }

  return "needs_review";
}

function mapJobStage(summary) {
  if (summary.status !== "success") {
    return "benchmark_failed";
  }

  if (summary.qa_gate?.minimum_pass) {
    return "benchmark_imported";
  }

  return "qa_review";
}

function mapOutputKind(summaryKey) {
  switch (summaryKey) {
    case "orthophoto":
      return "orthomosaic";
    case "dem":
      return "dem";
    case "point_cloud":
      return "point_cloud";
    case "mesh":
      return "mesh";
    default:
      return null;
  }
}

function inferOutputFormat(summaryKey, filePath) {
  if (summaryKey === "orthophoto" || summaryKey === "dem") {
    return "GeoTIFF";
  }

  if (summaryKey === "point_cloud") {
    return filePath.endsWith(".ply") ? "PLY" : "LAZ";
  }

  if (summaryKey === "mesh") {
    return path.extname(filePath).replace(".", "").toUpperCase() || "OBJ";
  }

  return "Derived artifact";
}

async function loadRunLogExcerpt(summaryPath, summary) {
  const runLog = typeof summary.run_log === "string" ? summary.run_log : "";
  if (!runLog) {
    return { runLogPath: null, logTail: [] };
  }

  const candidates = [
    path.isAbsolute(runLog) ? runLog : path.resolve(process.cwd(), runLog),
    path.isAbsolute(runLog) ? runLog : path.resolve(path.dirname(summaryPath), runLog),
    path.resolve(path.dirname(summaryPath), "run.log"),
  ];

  for (const candidate of candidates) {
    try {
      const logText = await fs.readFile(candidate, "utf8");
      const lines = logText.split(/\r?\n/).filter(Boolean);
      return {
        runLogPath: candidate,
        logTail: lines.slice(-40),
      };
    } catch {
      // try next candidate
    }
  }

  return { runLogPath: runLog, logTail: [] };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help === "true") {
    usage();
    process.exit(0);
  }

  const orgSlug = args["org-slug"]?.trim();
  const missionId = args["mission-id"]?.trim();
  const summaryPath = args.summary?.trim();

  if (!orgSlug || !missionId || !summaryPath) {
    usage();
    throw new Error("--org-slug, --mission-id, and --summary are required");
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  }

  const rawSummary = await fs.readFile(summaryPath, "utf8");
  const summary = JSON.parse(rawSummary);
  const { runLogPath, logTail } = await loadRunLogExcerpt(summaryPath, summary);

  const client = createClient({ supabaseUrl, serviceRoleKey });
  const org = await client.selectOne("drone_orgs", `slug=eq.${encodeURIComponent(orgSlug)}&select=id,name,slug`);
  if (!org?.id) {
    throw new Error(`Org not found for slug: ${orgSlug}`);
  }

  const mission = await client.selectOne(
    "drone_missions",
    `org_id=eq.${org.id}&id=eq.${missionId}&select=id,org_id,project_id,site_id,name,slug,status`,
  );
  if (!mission?.id) {
    throw new Error(`Mission not found for id: ${missionId}`);
  }

  let dataset = null;
  const requestedDatasetId = args["dataset-id"]?.trim();
  if (requestedDatasetId) {
    dataset = await client.selectOne(
      "drone_datasets",
      `org_id=eq.${org.id}&id=eq.${requestedDatasetId}&select=id,org_id,project_id,site_id,mission_id,name,slug,status`,
    );
  }

  if (!dataset) {
    dataset = await client.selectOne(
      "drone_datasets",
      `org_id=eq.${org.id}&mission_id=eq.${mission.id}&select=id,org_id,project_id,site_id,mission_id,name,slug,status&order=updated_at.desc&limit=1`,
    );
  }

  if (!dataset) {
    const datasetName = args["dataset-name"]?.trim() || `${mission.name} benchmark dataset`;
    dataset = await client.insertOne("drone_datasets", {
      org_id: org.id,
      project_id: mission.project_id,
      site_id: mission.site_id,
      mission_id: mission.id,
      name: datasetName,
      slug: `${normalizeSlug(datasetName) || "benchmark-dataset"}-${String(summary.timestamp_utc || "import").replace(/[^0-9]/g, "").slice(-8) || "1"}`,
      kind: "image",
      status: "ready",
      captured_at: summary.timestamp_utc ?? null,
      metadata: {
        imageCount: summary.image_count ?? 0,
        footprint: "Imported from benchmark summary",
        finding: "Dataset created automatically during benchmark import.",
        benchmarkSummaryPath: summaryPath,
      },
    });
  }

  const externalRef = args["external-ref"]?.trim()
    || `benchmark-${mission.id}-${String(summary.timestamp_utc || "import").replace(/[^0-9]/g, "")}`;

  const job = await client.insertOne("drone_processing_jobs", {
    org_id: org.id,
    project_id: mission.project_id,
    site_id: mission.site_id,
    mission_id: mission.id,
    dataset_id: dataset.id,
    engine: "odm",
    preset_id: "benchmark-import",
    status: mapJobStatus(summary),
    stage: mapJobStage(summary),
    progress: 100,
    queue_position: null,
    input_summary: {
      name: args["job-name"]?.trim() || `${mission.name} benchmark import`,
      source: "benchmark-import-script",
      importedSummaryPath: summaryPath,
      importedAt: new Date().toISOString(),
    },
    output_summary: {
      eta: "Complete",
      notes: "Imported from ODM benchmark summary.",
      benchmarkSummary: summary,
      runLogPath,
      logTail,
    },
    external_job_reference: externalRef,
    started_at: summary.timestamp_utc ?? null,
    completed_at: summary.end_timestamp_utc ?? summary.timestamp_utc ?? null,
  });

  const outputRows = Object.entries(summary.outputs ?? {})
    .map(([summaryKey, output]) => {
      const kind = mapOutputKind(summaryKey);
      if (!kind || !output || typeof output !== "object" || Array.isArray(output)) {
        return null;
      }

      const exists = output.exists === true;
      const nonZeroSize = output.non_zero_size === true;
      const filePath = typeof output.path === "string" ? output.path : null;

      return {
        org_id: org.id,
        job_id: job.id,
        mission_id: mission.id,
        dataset_id: dataset.id,
        kind,
        status: exists && nonZeroSize ? "ready" : "failed",
        storage_bucket: "benchmark-import",
        storage_path: filePath,
        metadata: {
          name: `${mission.name} ${kind.replaceAll("_", " ")}`,
          format: inferOutputFormat(summaryKey, filePath ?? ""),
          delivery: "Imported benchmark evidence",
          benchmark: {
            key: summaryKey,
            exists,
            nonZeroSize,
            sizeBytes: typeof output.size_bytes === "number" ? output.size_bytes : 0,
            sourcePath: filePath,
          },
        },
      };
    })
    .filter(Boolean);

  await client.insertMany("drone_processing_outputs", outputRows);

  await client.insertMany("drone_processing_job_events", [
    {
      org_id: org.id,
      job_id: job.id,
      event_type: "benchmark.imported",
      payload: {
        title: "Benchmark summary imported",
        detail: `Imported ODM benchmark summary for ${mission.name}.`,
        summaryPath,
      },
    },
    {
      org_id: org.id,
      job_id: job.id,
      event_type: "benchmark.qa_gate",
      payload: {
        title: summary.qa_gate?.minimum_pass ? "Benchmark minimum pass" : "Benchmark needs review",
        detail: summary.qa_gate?.minimum_pass
          ? "Required outputs are present and the benchmark achieved minimum pass."
          : `Missing required outputs: ${(summary.qa_gate?.missing_required_outputs ?? []).join(", ") || "none recorded"}`,
      },
    },
  ]);

  console.log("\n✅ Imported ODM benchmark summary\n");
  console.log(JSON.stringify({
    org: { id: org.id, slug: org.slug },
    mission: { id: mission.id, name: mission.name },
    dataset: { id: dataset.id, name: dataset.name },
    job: { id: job.id, status: job.status, stage: job.stage },
    summaryPath,
  }, null, 2));
}

main().catch((error) => {
  console.error("\n❌ Benchmark import failed");
  console.error(error.message);
  if (error.payload) {
    console.error(JSON.stringify(error.payload, null, 2));
  }
  process.exit(1);
});
