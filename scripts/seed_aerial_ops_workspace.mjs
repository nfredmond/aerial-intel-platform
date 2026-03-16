#!/usr/bin/env node

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
Seed one org with a query-backed Aerial Operations workspace.

Usage:
  node scripts/seed_aerial_ops_workspace.mjs --org-slug <slug>

Required environment variables:
  SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY
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
  async function request(path, { method = "GET", body, headers } = {}) {
    const response = await fetch(`${supabaseUrl}${path}`, {
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

  async function upsertOne(table, conflictColumns, row) {
    const encodedConflict = encodeURIComponent(conflictColumns.join(","));
    const data = await request(`/rest/v1/${table}?on_conflict=${encodedConflict}&select=*`, {
      method: "POST",
      headers: {
        Prefer: "resolution=merge-duplicates,return=representation",
      },
      body: row,
    });

    if (!Array.isArray(data) || !data[0]) {
      throw new Error(`Upsert for ${table} returned no rows`);
    }

    return data[0];
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

  async function deleteWhere(table, query) {
    return request(`/rest/v1/${table}?${query}`, {
      method: "DELETE",
    });
  }

  return { request, selectOne, upsertOne, insertMany, deleteWhere };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help === "true") {
    usage();
    process.exit(0);
  }

  const orgSlug = args["org-slug"]?.trim();
  if (!orgSlug) {
    usage();
    throw new Error("--org-slug is required");
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  }

  const client = createClient({ supabaseUrl, serviceRoleKey });
  const org = await client.selectOne("drone_orgs", `slug=eq.${encodeURIComponent(orgSlug)}&select=id,name,slug`);
  if (!org?.id) {
    throw new Error(`Org not found for slug: ${orgSlug}`);
  }

  const project = await client.upsertOne("drone_projects", ["org_id", "slug"], {
    org_id: org.id,
    name: `${org.name} aerial operations`,
    slug: "aerial-ops",
    status: "active",
    description: "Query-backed workspace seeded for planning, ingest, processing, and delivery review.",
  });

  const site = await client.upsertOne("drone_sites", ["project_id", "slug"], {
    org_id: org.id,
    project_id: project.id,
    name: "Grass Valley downtown pilot",
    slug: "grass-valley-downtown",
    description: "Corridor mapping pilot site",
    site_notes: {
      terrainSource: "seeded-demo",
      caution: "Replace with real site notes once the planner is live.",
    },
  });

  const mission = await client.upsertOne("drone_missions", ["site_id", "slug"], {
    org_id: org.id,
    project_id: project.id,
    site_id: site.id,
    name: "Downtown corridor baseline",
    slug: "downtown-corridor-baseline",
    mission_type: "corridor",
    status: "processing",
    objective: "Seeded mission to verify the Supabase-backed operations workspace.",
    summary: {
      captureDate: "2026-03-15T20:00:00Z",
      areaAcres: 42,
      imageCount: 684,
      gsdCm: 1.8,
      coordinateSystem: "EPSG:26910 / NAD83 UTM Zone 10N",
      processingProfile: "Urban corridor orthomosaic + DSM",
      targetDevice: "DJI Mavic 3 Enterprise / Pilot 2",
      batteryPlan: "3 batteries · 2 split missions",
      compatibility: "KMZ/WPML export target",
      healthScore: 84,
      blockers: ["Review striping clarity before export approval."],
      warnings: ["Terrain-following validation still uses seeded placeholder values."],
    },
  });

  await client.upsertOne("drone_mission_versions", ["mission_id", "version_number"], {
    org_id: org.id,
    mission_id: mission.id,
    version_number: 1,
    source_format: "native",
    status: "validated",
    plan_payload: {
      type: "seeded",
      exportTargets: ["dji_kmz", "geojson", "pdf_brief"],
    },
    validation_summary: {
      status: "warning",
      checks: ["terrain-preview", "battery-split", "device-compatibility"],
    },
    export_summary: {
      available: ["kmz", "pdf"],
    },
  });

  const dataset = await client.upsertOne("drone_datasets", ["project_id", "slug"], {
    org_id: org.id,
    project_id: project.id,
    site_id: site.id,
    mission_id: mission.id,
    name: "Downtown imagery batch",
    slug: "downtown-imagery-batch",
    kind: "image",
    status: "ready",
    captured_at: "2026-03-15T20:15:00Z",
    metadata: {
      imageCount: 684,
      footprint: "42 acres / corridor coverage",
      finding: "EXIF and capture order reconstructed; ready for processing.",
    },
  });

  const job = await client.upsertOne("drone_processing_jobs", ["org_id", "external_job_reference"], {
    org_id: org.id,
    project_id: project.id,
    site_id: site.id,
    mission_id: mission.id,
    dataset_id: dataset.id,
    engine: "odm",
    preset_id: "fast-map",
    status: "running",
    stage: "point_cloud",
    progress: 68,
    queue_position: null,
    input_summary: {
      name: "Downtown corridor dense cloud refresh",
    },
    output_summary: {
      eta: "18 min",
      notes: "Orthomosaic and DSM outputs are ready; point cloud is still running.",
    },
    external_job_reference: `seed-${org.id}-downtown-corridor`,
    started_at: "2026-03-15T20:25:00Z",
  });

  await client.deleteWhere("drone_processing_outputs", `job_id=eq.${job.id}`);
  await client.insertMany("drone_processing_outputs", [
    {
      org_id: org.id,
      job_id: job.id,
      mission_id: mission.id,
      dataset_id: dataset.id,
      kind: "orthomosaic",
      status: "ready",
      storage_bucket: "drone-ops",
      storage_path: `${org.slug}/outputs/downtown/orthomosaic.tif`,
      metadata: {
        name: "Downtown corridor orthomosaic",
        format: "COG",
        delivery: "Internal QA share",
      },
    },
    {
      org_id: org.id,
      job_id: job.id,
      mission_id: mission.id,
      dataset_id: dataset.id,
      kind: "dsm",
      status: "ready",
      storage_bucket: "drone-ops",
      storage_path: `${org.slug}/outputs/downtown/dsm.tif`,
      metadata: {
        name: "Downtown surface model",
        format: "COG",
        delivery: "Ready for raster publishing",
      },
    },
    {
      org_id: org.id,
      job_id: job.id,
      mission_id: mission.id,
      dataset_id: dataset.id,
      kind: "point_cloud",
      status: "pending",
      storage_bucket: "drone-ops",
      storage_path: `${org.slug}/outputs/downtown/cloud.laz`,
      metadata: {
        name: "Downtown point cloud",
        format: "LAZ",
        delivery: "Hold for QA",
      },
    },
  ]);

  await client.deleteWhere("drone_processing_job_events", `job_id=eq.${job.id}`);
  await client.insertMany("drone_processing_job_events", [
    {
      org_id: org.id,
      job_id: job.id,
      event_type: "job.submitted",
      payload: {
        title: "Seeded job submitted",
        detail: "Initial workspace seed submitted an ODM processing run.",
      },
    },
    {
      org_id: org.id,
      job_id: job.id,
      event_type: "job.stage.changed",
      payload: {
        title: "Dense cloud stage active",
        detail: "Point cloud generation is underway in the seeded workspace.",
      },
    },
    {
      org_id: org.id,
      job_id: job.id,
      event_type: "artifact.generated",
      payload: {
        title: "Raster outputs ready",
        detail: "Orthomosaic and DSM artifacts are available for review.",
      },
    },
  ]);

  console.log("\n✅ Seeded Aerial Operations workspace\n");
  console.log(JSON.stringify({
    org: { id: org.id, name: org.name, slug: org.slug },
    project: { id: project.id, name: project.name },
    site: { id: site.id, name: site.name },
    mission: { id: mission.id, name: mission.name },
    dataset: { id: dataset.id, name: dataset.name },
    job: { id: job.id, engine: job.engine, status: job.status },
  }, null, 2));
}

main().catch((error) => {
  console.error("\n❌ Seed failed");
  console.error(error.message);
  if (error.payload) {
    console.error(JSON.stringify(error.payload, null, 2));
  }
  process.exit(1);
});
