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
  --job-id <uuid>           Attach imported outputs/evidence to an existing job instead of creating a new one
  --job-name <name>         Override job display name
  --external-ref <value>    Override external job reference
  --publish-to-storage      Upload real outputs/evidence into protected Supabase Storage for signed delivery
  --storage-bucket <name>   Storage bucket to publish into (default: drone-ops)
  --publish-prefix <path>   Override storage prefix used for published evidence
  --review-bundle <path>    Optional export/review bundle ZIP to publish and record on the job
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

  async function updateMany(table, query, patch) {
    return request(`/rest/v1/${table}?${query}&select=*`, {
      method: "PATCH",
      headers: {
        Prefer: "return=representation",
      },
      body: patch,
    });
  }

  return { selectOne, selectMany, insertOne, insertMany, updateMany };
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

async function uploadFileToStorage({ supabaseUrl, serviceRoleKey, bucket, objectPath, filePath, contentType }) {
  const fileBuffer = await fs.readFile(filePath);
  const response = await fetch(`${supabaseUrl}/storage/v1/object/${bucket}/${objectPath}`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "x-upsert": "true",
      "content-type": contentType || "application/octet-stream",
    },
    body: fileBuffer,
  });

  if (!response.ok) {
    const payload = await safeJson(response);
    const message =
      typeof payload === "object" && payload && "message" in payload
        ? String(payload.message)
        : `Storage upload failed (${response.status})`;
    const error = new Error(message);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return {
    bucket,
    path: objectPath,
  };
}

function inferContentType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  switch (extension) {
    case ".zip":
      return "application/zip";
    case ".json":
      return "application/json";
    case ".log":
    case ".txt":
      return "text/plain; charset=utf-8";
    case ".tif":
    case ".tiff":
      return "image/tiff";
    case ".laz":
      return "application/octet-stream";
    case ".ply":
      return "application/octet-stream";
    case ".obj":
      return "text/plain; charset=utf-8";
    case ".pdf":
      return "application/pdf";
    default:
      return "application/octet-stream";
  }
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function resolveCandidatePath(basePath, candidate) {
  if (!candidate || typeof candidate !== "string") {
    return null;
  }

  if (path.isAbsolute(candidate)) {
    return candidate;
  }

  return path.resolve(path.dirname(basePath), candidate);
}

async function discoverReviewBundlePath(summaryPath, explicitPath) {
  const explicitCandidate = resolveCandidatePath(summaryPath, explicitPath);
  if (explicitCandidate && await fileExists(explicitCandidate)) {
    return explicitCandidate;
  }

  const basename = path.basename(summaryPath);
  if (basename !== "summary.json") {
    return null;
  }

  const benchmarkDir = path.dirname(summaryPath);
  const repoRoot = process.cwd();
  const relativeBenchmarkDir = path.relative(path.join(repoRoot, "benchmark"), benchmarkDir);
  if (relativeBenchmarkDir.startsWith("..") || relativeBenchmarkDir === "") {
    return null;
  }

  const dataDir = path.join(repoRoot, ".data");
  let entries;
  try {
    entries = await fs.readdir(dataDir, { withFileTypes: true });
  } catch {
    return null;
  }

  const candidateName = `export_bundle_${relativeBenchmarkDir.split("_").slice(1).join("_")}.zip`;
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith("v1_slice_")) {
      continue;
    }

    const candidate = path.join(dataDir, entry.name, candidateName);
    if (await fileExists(candidate)) {
      return candidate;
    }
  }

  return null;
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
  const requestedJobId = args["job-id"]?.trim() || null;
  const publishToStorage = args["publish-to-storage"] === "true";
  const storageBucket = args["storage-bucket"]?.trim() || "drone-ops";
  const resolvedReviewBundlePath = await discoverReviewBundlePath(summaryPath, args["review-bundle"]?.trim() || null);

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

  let existingJob = null;
  if (requestedJobId) {
    existingJob = await client.selectOne(
      "drone_processing_jobs",
      `org_id=eq.${org.id}&id=eq.${requestedJobId}&select=id,org_id,project_id,site_id,mission_id,dataset_id,engine,preset_id,status,stage,progress,queue_position,input_summary,output_summary,external_job_reference,created_by,created_at,updated_at,started_at,completed_at`,
    );

    if (!existingJob?.id) {
      throw new Error(`Job not found for id: ${requestedJobId}`);
    }

    if (existingJob.mission_id !== mission.id) {
      throw new Error(`Job ${requestedJobId} does not belong to mission ${mission.id}`);
    }

    if (existingJob.dataset_id && dataset.id !== existingJob.dataset_id) {
      const matchedDataset = await client.selectOne(
        "drone_datasets",
        `org_id=eq.${org.id}&id=eq.${existingJob.dataset_id}&select=id,org_id,project_id,site_id,mission_id,name,slug,status`,
      );
      if (matchedDataset?.id) {
        dataset = matchedDataset;
      }
    }
  }

  const externalRef = args["external-ref"]?.trim()
    || `benchmark-${mission.id}-${String(summary.timestamp_utc || "import").replace(/[^0-9]/g, "")}`;

  const now = new Date().toISOString();
  const existingOutputSummary = existingJob?.output_summary && typeof existingJob.output_summary === "object" && !Array.isArray(existingJob.output_summary)
    ? existingJob.output_summary
    : {};
  const existingInputSummary = existingJob?.input_summary && typeof existingJob.input_summary === "object" && !Array.isArray(existingJob.input_summary)
    ? existingJob.input_summary
    : {};

  let job;
  if (existingJob) {
    const updatedJobs = await client.updateMany(
      "drone_processing_jobs",
      `org_id=eq.${org.id}&id=eq.${existingJob.id}`,
      {
        dataset_id: existingJob.dataset_id ?? dataset.id,
        engine: existingJob.engine ?? "odm",
        status: mapJobStatus(summary),
        stage: mapJobStage(summary),
        progress: 100,
        queue_position: null,
        external_job_reference: existingJob.external_job_reference ?? externalRef,
        started_at: existingJob.started_at ?? summary.timestamp_utc ?? now,
        completed_at: summary.end_timestamp_utc ?? summary.timestamp_utc ?? now,
        input_summary: {
          ...existingInputSummary,
          attachedBenchmarkImport: {
            summaryPath,
            importedAt: now,
          },
        },
        output_summary: {
          ...existingOutputSummary,
          eta: "Complete",
          notes: existingJob.preset_id === "managed-processing-v1"
            ? "Real outputs imported from ODM benchmark evidence and attached to the managed processing request."
            : "Imported from ODM benchmark summary.",
          benchmarkSummary: summary,
          runLogPath,
          logTail,
          latestCheckpoint: existingJob.preset_id === "managed-processing-v1"
            ? "Real benchmark outputs attached/imported"
            : "Benchmark summary imported",
        },
      },
    );

    if (!Array.isArray(updatedJobs) || !updatedJobs[0]) {
      throw new Error(`Could not update job ${existingJob.id}`);
    }

    job = updatedJobs[0];
  } else {
    job = await client.insertOne("drone_processing_jobs", {
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
        importedAt: now,
      },
      output_summary: {
        eta: "Complete",
        notes: "Imported from ODM benchmark summary.",
        benchmarkSummary: summary,
        runLogPath,
        logTail,
        latestCheckpoint: "Benchmark summary imported",
      },
      external_job_reference: externalRef,
      started_at: summary.timestamp_utc ?? null,
      completed_at: summary.end_timestamp_utc ?? summary.timestamp_utc ?? null,
    });
  }

  const publishPrefix = args["publish-prefix"]?.trim()
    || `${org.slug}/missions/${mission.id}/jobs/${job.id}`;

  const publishedEvidence = {};
  if (publishToStorage) {
    const summaryObject = await uploadFileToStorage({
      supabaseUrl,
      serviceRoleKey,
      bucket: storageBucket,
      objectPath: `${publishPrefix}/evidence/${path.basename(summaryPath)}`,
      filePath: summaryPath,
      contentType: inferContentType(summaryPath),
    });
    publishedEvidence.benchmarkSummary = {
      bucket: summaryObject.bucket,
      path: summaryObject.path,
      sourcePath: summaryPath,
    };

    if (runLogPath && await fileExists(runLogPath)) {
      const runLogObject = await uploadFileToStorage({
        supabaseUrl,
        serviceRoleKey,
        bucket: storageBucket,
        objectPath: `${publishPrefix}/evidence/${path.basename(runLogPath)}`,
        filePath: runLogPath,
        contentType: inferContentType(runLogPath),
      });
      publishedEvidence.runLog = {
        bucket: runLogObject.bucket,
        path: runLogObject.path,
        sourcePath: runLogPath,
      };
    }

    if (resolvedReviewBundlePath && await fileExists(resolvedReviewBundlePath)) {
      const reviewBundleObject = await uploadFileToStorage({
        supabaseUrl,
        serviceRoleKey,
        bucket: storageBucket,
        objectPath: `${publishPrefix}/delivery/${path.basename(resolvedReviewBundlePath)}`,
        filePath: resolvedReviewBundlePath,
        contentType: inferContentType(resolvedReviewBundlePath),
      });
      publishedEvidence.reviewBundle = {
        bucket: reviewBundleObject.bucket,
        path: reviewBundleObject.path,
        sourcePath: resolvedReviewBundlePath,
      };
    }

    const updatedJobs = await client.updateMany(
      "drone_processing_jobs",
      `org_id=eq.${org.id}&id=eq.${job.id}`,
      {
        output_summary: {
          ...((job.output_summary && typeof job.output_summary === "object" && !Array.isArray(job.output_summary)) ? job.output_summary : {}),
          deliveryPackage: {
            publishedToStorage: true,
            bucket: storageBucket,
            ...publishedEvidence,
          },
        },
      },
    );
    if (Array.isArray(updatedJobs) && updatedJobs[0]) {
      job = updatedJobs[0];
    }
  }

  const existingOutputs = await client.selectMany(
    "drone_processing_outputs",
    `org_id=eq.${org.id}&job_id=eq.${job.id}&select=id,kind,storage_bucket,storage_path,metadata`,
  );

  const outputRows = (await Promise.all(
    Object.entries(summary.outputs ?? {}).map(([summaryKey, output]) => {
      const kind = mapOutputKind(summaryKey);
      if (!kind || !output || typeof output !== "object" || Array.isArray(output)) {
        return Promise.resolve(null);
      }

      const exists = output.exists === true;
      const nonZeroSize = output.non_zero_size === true;
      const filePath = typeof output.path === "string" ? output.path : null;
      const publishPromise = publishToStorage && exists && nonZeroSize && filePath
        ? uploadFileToStorage({
            supabaseUrl,
            serviceRoleKey,
            bucket: storageBucket,
            objectPath: `${publishPrefix}/outputs/${path.basename(filePath)}`,
            filePath,
            contentType: inferContentType(filePath),
          })
        : Promise.resolve(null);

      return publishPromise.then((publishedObject) => ({
        kind,
        exists,
        nonZeroSize,
        filePath,
        row: {
          org_id: org.id,
          job_id: job.id,
          mission_id: mission.id,
          dataset_id: dataset.id,
          kind,
          status: exists && nonZeroSize ? "ready" : "failed",
          storage_bucket: publishedObject?.bucket ?? (publishToStorage ? storageBucket : "benchmark-import"),
          storage_path: publishedObject?.path ?? filePath,
          metadata: {
            name: `${mission.name} ${kind.replaceAll("_", " ")}`,
            format: inferOutputFormat(summaryKey, filePath ?? ""),
            delivery: publishedObject ? "Protected download ready" : "Imported benchmark evidence",
            benchmark: {
              key: summaryKey,
              exists,
              nonZeroSize,
              sizeBytes: typeof output.size_bytes === "number" ? output.size_bytes : 0,
              sourcePath: filePath,
            },
            storagePublication: publishedObject
              ? {
                  published: true,
                  bucket: publishedObject.bucket,
                  path: publishedObject.path,
                  publishedAt: now,
                }
              : {
                  published: false,
                },
          },
        },
      }));
    }),
  )).filter(Boolean);

  const outputsToInsert = [];
  for (const outputEntry of outputRows) {
    const existingOutput = existingOutputs.find((item) => item.kind === outputEntry.kind);
    if (existingOutput?.id) {
      await client.updateMany(
        "drone_processing_outputs",
        `org_id=eq.${org.id}&id=eq.${existingOutput.id}`,
        outputEntry.row,
      );
    } else {
      outputsToInsert.push(outputEntry.row);
    }
  }

  await client.insertMany("drone_processing_outputs", outputsToInsert);

  await client.insertMany("drone_processing_job_events", [
    {
      org_id: org.id,
      job_id: job.id,
      event_type: existingJob ? "benchmark.outputs.attached" : "benchmark.imported",
      payload: {
        title: existingJob ? "Benchmark outputs attached" : "Benchmark summary imported",
        detail: existingJob
          ? `Imported ODM benchmark evidence and attached real outputs to existing job ${job.id} for ${mission.name}.`
          : `Imported ODM benchmark summary for ${mission.name}.`,
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

  if (publishToStorage) {
    await client.insertMany("drone_processing_job_events", [
      {
        org_id: org.id,
        job_id: job.id,
        event_type: "delivery.package.published",
        payload: {
          title: "Protected delivery package published",
          detail: resolvedReviewBundlePath
            ? "Outputs and available evidence were published into protected storage for signed download delivery."
            : "Outputs and benchmark evidence were published into protected storage for signed download delivery.",
          bucket: storageBucket,
          prefix: publishPrefix,
        },
      },
    ]);
  }

  console.log("\n✅ Imported ODM benchmark summary\n");
  console.log(JSON.stringify({
    org: { id: org.id, slug: org.slug },
    mission: { id: mission.id, name: mission.name },
    dataset: { id: dataset.id, name: dataset.name },
    job: { id: job.id, status: job.status, stage: job.stage },
    summaryPath,
    attachedToExistingJob: Boolean(existingJob),
    publishedToStorage: publishToStorage,
    storageBucket: publishToStorage ? storageBucket : null,
    publishPrefix: publishToStorage ? publishPrefix : null,
    reviewBundlePath: resolvedReviewBundlePath,
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
