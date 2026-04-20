#!/usr/bin/env node

import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

const DEFAULTS = {
  ownerEmail: "test.drone.owner@natfordplanning.test",
  orgName: "Nat Ford Drone Lab",
  orgSlug: "nat-ford-drone-lab",
  projectSlug: "downtown-corridor",
  siteSlug: "grass-valley-downtown",
  missionSlug: "downtown-corridor-baseline",
  datasetSlug: "downtown-imagery-batch",
  rasterBucket: "drone-ops",
  rasterStoragePath: "nat-ford-drone-lab/e2e/orthomosaic.cog.tif",
  rasterArtifactId: "22222222-2222-4222-8222-222222222222",
  secondArtifactId: "33333333-3333-4333-8333-333333333333",
  successfulJobId: "44444444-4444-4444-8444-444444444444",
  syntheticJobId: "11111111-1111-4111-8111-111111111111",
};

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
Provision deterministic Supabase fixtures for the authenticated Playwright smoke.

This script expects a dedicated Supabase project that already has all
supabase/migrations applied. It creates or refreshes the auth user, org,
membership, entitlement, copilot settings, ready artifacts, and synthetic failed
job consumed by web/tests/e2e/authenticated-ops.spec.ts.

Required environment variables:
  SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY

Optional environment variables:
  SUPABASE_ANON_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY
  AERIAL_E2E_BASE_URL
  AERIAL_E2E_OWNER_EMAIL
  AERIAL_E2E_OWNER_USER_ID
  AERIAL_E2E_ORG_NAME
  AERIAL_E2E_ORG_SLUG
  AERIAL_E2E_COPILOT_ENABLED=1|0
  AERIAL_E2E_EXPECT_RASTER=1|0
  AERIAL_E2E_RASTER_FIXTURE_PATH=/absolute/path/to/fixture.cog.tif
  AERIAL_E2E_RASTER_BUCKET
  AERIAL_E2E_RASTER_STORAGE_PATH

Usage:
  SUPABASE_URL=https://PROJECT_REF.supabase.co \\
  SUPABASE_SERVICE_ROLE_KEY=... \\
    node scripts/provision_e2e_supabase_fixtures.mjs
`);
}

function readEnv(name, fallback = null) {
  const value = process.env[name]?.trim();
  return value ? value : fallback;
}

function readBool(name, fallback) {
  const raw = readEnv(name);
  if (raw === null) return fallback;
  return ["1", "true", "yes", "on"].includes(raw.toLowerCase());
}

function requireEnv(name) {
  const value = readEnv(name);
  if (!value) throw new Error(`Missing ${name}.`);
  return value;
}

function normalizeSupabaseUrl(value) {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function encodePathSegments(value) {
  return value
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
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

function errorMessageFromPayload(payload, fallback) {
  if (payload && typeof payload === "object") {
    if ("msg" in payload) return String(payload.msg);
    if ("message" in payload) return String(payload.message);
    if ("error_description" in payload) return String(payload.error_description);
    if ("error" in payload) return String(payload.error);
  }
  return fallback;
}

function createSupabaseAdminClient({ supabaseUrl, serviceRoleKey }) {
  async function request(pathname, { method = "GET", body, headers } = {}) {
    const response = await fetch(`${supabaseUrl}${pathname}`, {
      method,
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
        ...(headers ?? {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    const payload = await safeJson(response);

    if (!response.ok) {
      const error = new Error(
        errorMessageFromPayload(payload, `Request failed (${response.status})`),
      );
      error.status = response.status;
      error.payload = payload;
      throw error;
    }

    return payload;
  }

  async function rawRequest(pathname, { method = "GET", body, headers } = {}) {
    const response = await fetch(`${supabaseUrl}${pathname}`, {
      method,
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        ...(headers ?? {}),
      },
      body,
    });

    if (!response.ok) {
      const payload = await safeJson(response);
      const error = new Error(
        errorMessageFromPayload(payload, `Request failed (${response.status})`),
      );
      error.status = response.status;
      error.payload = payload;
      throw error;
    }

    return response;
  }

  async function selectOne(table, params) {
    const query = new URLSearchParams(params);
    const rows = await request(`/rest/v1/${table}?${query.toString()}`);
    if (!Array.isArray(rows)) {
      throw new Error(`Select for ${table} did not return an array.`);
    }
    return rows[0] ?? null;
  }

  async function upsertOne(table, conflictColumns, row) {
    const query = new URLSearchParams({
      on_conflict: conflictColumns.join(","),
      select: "*",
    });
    const rows = await request(`/rest/v1/${table}?${query.toString()}`, {
      method: "POST",
      headers: {
        Prefer: "resolution=merge-duplicates,return=representation",
      },
      body: row,
    });

    if (!Array.isArray(rows) || !rows[0]) {
      throw new Error(`Upsert for ${table} returned no rows.`);
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

  async function deleteWhere(table, params) {
    const query = new URLSearchParams(params);
    return request(`/rest/v1/${table}?${query.toString()}`, {
      method: "DELETE",
    });
  }

  async function ensureBucket(bucketName) {
    try {
      await request("/storage/v1/bucket", {
        method: "POST",
        body: {
          id: bucketName,
          name: bucketName,
          public: false,
        },
      });
      return "created";
    } catch (error) {
      if (
        error.status === 409 ||
        (error.status === 400 && /already|exist/i.test(error.message))
      ) {
        return "exists";
      }
      throw error;
    }
  }

  async function uploadStorageObject({ bucket, storagePath, fixturePath }) {
    const bytes = await readFile(fixturePath);
    const objectPath = encodePathSegments(storagePath);
    await rawRequest(`/storage/v1/object/${encodeURIComponent(bucket)}/${objectPath}`, {
      method: "POST",
      headers: {
        "Content-Type": "image/tiff",
        "x-upsert": "true",
      },
      body: bytes,
    });
  }

  return {
    request,
    selectOne,
    upsertOne,
    insertMany,
    deleteWhere,
    ensureBucket,
    uploadStorageObject,
  };
}

function extractUser(payload) {
  if (!payload || typeof payload !== "object") return null;
  if ("user" in payload && payload.user && typeof payload.user === "object") {
    return payload.user;
  }
  if ("id" in payload && "email" in payload) return payload;
  return null;
}

async function findAuthUserByEmail(client, email) {
  const normalizedEmail = email.toLowerCase();
  const perPage = 100;

  for (let page = 1; page <= 20; page += 1) {
    const payload = await client.request(
      `/auth/v1/admin/users?page=${page}&per_page=${perPage}`,
    );
    const users = Array.isArray(payload?.users)
      ? payload.users
      : Array.isArray(payload)
        ? payload
        : [];
    const match = users.find(
      (user) =>
        typeof user?.email === "string" &&
        user.email.toLowerCase() === normalizedEmail,
    );
    if (match) return match;
    if (users.length < perPage) break;
  }

  return null;
}

async function resolveOwnerUser(client, { email, explicitUserId }) {
  if (explicitUserId) {
    const payload = await client.request(
      `/auth/v1/admin/users/${encodeURIComponent(explicitUserId)}`,
    );
    const user = extractUser(payload);
    if (!user?.id) {
      throw new Error(`Auth user ${explicitUserId} was not returned by Supabase Auth.`);
    }
    if (typeof user.email === "string" && user.email.toLowerCase() !== email.toLowerCase()) {
      throw new Error(
        `AERIAL_E2E_OWNER_USER_ID belongs to ${user.email}, not ${email}.`,
      );
    }
    return { user, created: false };
  }

  const existing = await findAuthUserByEmail(client, email);
  if (existing?.id) return { user: existing, created: false };

  const password = `Codex-${randomBytes(18).toString("base64url")}1!`;
  const payload = await client.request("/auth/v1/admin/users", {
    method: "POST",
    body: {
      email,
      password,
      email_confirm: true,
      user_metadata: {
        fixture: "aerial-e2e-authenticated-smoke",
      },
    },
  });
  const user = extractUser(payload);
  if (!user?.id) throw new Error("Supabase Auth createUser returned no user id.");
  return { user, created: true };
}

function buildSuccessfulOutputSummary() {
  return {
    eta: "complete",
    notes: "Deterministic E2E fixture output with reviewer-ready raster artifacts.",
    benchmarkSummary: {
      run_exit_code: 0,
      image_count: 20,
      duration_seconds: 540,
      minimum_pass: true,
      required_outputs_present: true,
      missing_required_outputs: [],
      outputs: {
        "odm_orthophoto.tif": { exists: true, non_zero_size: true },
        "odm_dem.tif": { exists: true, non_zero_size: true },
        "odm_report.pdf": { exists: true, non_zero_size: true },
      },
    },
    stageChecklist: [
      { label: "Ingest", status: "complete" },
      { label: "Preflight", status: "complete" },
      { label: "Feature extraction", status: "complete" },
      { label: "Matching", status: "complete" },
      { label: "Reconstruction", status: "complete" },
      { label: "Orthomosaic", status: "complete" },
    ],
  };
}

function buildSyntheticFailedOutputSummary() {
  return {
    synthetic: true,
    syntheticSeedVersion: "2026-04-20-e2e-fixtures",
    latestCheckpoint: "odm:feature_extraction failed at 18%",
    benchmarkSummary: {
      run_exit_code: 137,
      image_count: 20,
      duration_seconds: 410,
      minimum_pass: false,
      required_outputs_present: false,
      missing_required_outputs: ["odm_orthophoto.tif", "odm_dem.tif"],
      odm_args: "--min-num-features 8000 --feature-quality high --matcher-type flann",
      outputs: {
        "odm_orthophoto.tif": { exists: false, non_zero_size: false },
        "odm_dem.tif": { exists: false, non_zero_size: false },
        "odm_report.pdf": { exists: false, non_zero_size: false },
      },
    },
    stageChecklist: [
      { label: "Ingest", status: "complete" },
      { label: "Preflight", status: "complete" },
      { label: "Feature extraction", status: "failed" },
      { label: "Matching", status: "pending" },
      { label: "Reconstruction", status: "pending" },
      { label: "Orthomosaic", status: "pending" },
    ],
    nodeodm: {
      taskUuid: "synthetic-task-0001",
    },
    logTail: [
      "[ingest] 20 images registered",
      "[preflight] EXIF + GPS present on 20/20",
      "[feature_extraction] OpenMVG compute_features start",
      "[feature_extraction] processing batch 1/4",
      "[feature_extraction] OOM killer signaled by host",
      "[feature_extraction] child exited with code 137 after 410s",
    ],
  };
}

async function provisionDatabaseFixtures(client, config) {
  const org = await client.upsertOne("drone_orgs", ["slug"], {
    name: config.orgName,
    slug: config.orgSlug,
  });

  await client.upsertOne("drone_memberships", ["org_id", "user_id"], {
    org_id: org.id,
    user_id: config.ownerUserId,
    role: "owner",
    status: "active",
  });

  await client.upsertOne("drone_entitlements", ["org_id", "product_id"], {
    org_id: org.id,
    product_id: "drone-ops",
    tier_id: "studio",
    status: "active",
    source: "e2e_fixture",
    external_reference: "aerial-e2e-authenticated-smoke",
  });

  await client.upsertOne("drone_org_settings", ["org_id"], {
    org_id: org.id,
    copilot_enabled: config.copilotEnabled,
  });

  const project = await client.upsertOne("drone_projects", ["org_id", "slug"], {
    org_id: org.id,
    name: "Downtown corridor",
    slug: config.projectSlug,
    status: "active",
    description: "Dedicated E2E fixture project for authenticated smoke coverage.",
    created_by: config.ownerUserId,
  });

  const site = await client.upsertOne("drone_sites", ["project_id", "slug"], {
    org_id: org.id,
    project_id: project.id,
    name: "Grass Valley downtown pilot",
    slug: config.siteSlug,
    description: "Fixture site for reviewer and raster smoke tests.",
    site_notes: {
      fixture: "aerial-e2e-authenticated-smoke",
      caution: "Synthetic planning context; do not present as a client deliverable.",
    },
    created_by: config.ownerUserId,
  });

  const mission = await client.upsertOne("drone_missions", ["site_id", "slug"], {
    org_id: org.id,
    project_id: project.id,
    site_id: site.id,
    name: "Downtown corridor baseline",
    slug: config.missionSlug,
    mission_type: "corridor",
    status: "ready_for_review",
    objective: "Fixture mission used to verify authenticated operational smoke coverage.",
    summary: {
      captureDate: "2026-03-15T20:00:00Z",
      areaAcres: 42,
      imageCount: 20,
      gsdCm: 1.8,
      coordinateSystem: "EPSG:26910 / NAD83 UTM Zone 10N",
      processingProfile: "Urban corridor orthomosaic + DSM",
      targetDevice: "DJI Mavic 3 Enterprise / Pilot 2",
      batteryPlan: "3 batteries / 2 split missions",
      compatibility: "KMZ/WPML export target",
      healthScore: 84,
      fixture: "aerial-e2e-authenticated-smoke",
      warnings: ["Synthetic E2E data; not a production deliverable."],
    },
    created_by: config.ownerUserId,
  });

  await client.upsertOne("drone_mission_versions", ["mission_id", "version_number"], {
    org_id: org.id,
    mission_id: mission.id,
    version_number: 1,
    source_format: "native",
    status: "validated",
    plan_payload: {
      type: "e2e-fixture",
      exportTargets: ["dji_kmz", "geojson", "pdf_brief"],
    },
    validation_summary: {
      status: "warning",
      checks: ["terrain-preview", "battery-split", "device-compatibility"],
    },
    export_summary: {
      available: ["kmz", "pdf"],
    },
    created_by: config.ownerUserId,
  });

  const dataset = await client.upsertOne("drone_datasets", ["project_id", "slug"], {
    org_id: org.id,
    project_id: project.id,
    site_id: site.id,
    mission_id: mission.id,
    name: "Downtown imagery batch",
    slug: config.datasetSlug,
    kind: "image",
    status: "ready",
    captured_at: "2026-03-15T20:15:00Z",
    metadata: {
      imageCount: 20,
      footprint: "42 acres / corridor coverage",
      finding: "Synthetic fixture batch for authenticated E2E smoke.",
    },
    created_by: config.ownerUserId,
  });

  const successfulJob = await client.upsertOne("drone_processing_jobs", ["id"], {
    id: DEFAULTS.successfulJobId,
    org_id: org.id,
    project_id: project.id,
    site_id: site.id,
    mission_id: mission.id,
    dataset_id: dataset.id,
    engine: "odm",
    preset_id: "fast-map",
    status: "succeeded",
    stage: "complete",
    progress: 100,
    queue_position: null,
    input_summary: {
      name: "Downtown corridor E2E fixture run",
      imageCount: 20,
      fixture: "aerial-e2e-authenticated-smoke",
    },
    output_summary: buildSuccessfulOutputSummary(),
    external_job_reference: "aerial-e2e-successful-fixture",
    created_by: config.ownerUserId,
    started_at: "2026-03-15T20:25:00Z",
    completed_at: "2026-03-15T20:34:00Z",
  });

  const rasterArtifact = await client.upsertOne("drone_processing_outputs", ["id"], {
    id: DEFAULTS.rasterArtifactId,
    org_id: org.id,
    job_id: successfulJob.id,
    mission_id: mission.id,
    dataset_id: dataset.id,
    kind: "orthomosaic",
    status: "ready",
    storage_bucket: config.rasterBucket,
    storage_path: config.rasterStoragePath,
    metadata: {
      name: "Downtown corridor orthomosaic",
      format: "COG",
      fixture: "aerial-e2e-authenticated-smoke",
      delivery: "Internal QA fixture",
    },
  });

  const secondArtifact = await client.upsertOne("drone_processing_outputs", ["id"], {
    id: DEFAULTS.secondArtifactId,
    org_id: org.id,
    job_id: successfulJob.id,
    mission_id: mission.id,
    dataset_id: dataset.id,
    kind: "dsm",
    status: "ready",
    storage_bucket: config.rasterBucket,
    storage_path: config.rasterStoragePath.replace(/orthomosaic/i, "dsm"),
    metadata: {
      name: "Downtown corridor surface model",
      format: "COG",
      fixture: "aerial-e2e-authenticated-smoke",
      delivery: "Cross-artifact comment scoping fixture",
    },
  });

  const syntheticJob = await client.upsertOne("drone_processing_jobs", ["id"], {
    id: DEFAULTS.syntheticJobId,
    org_id: org.id,
    project_id: project.id,
    site_id: site.id,
    mission_id: mission.id,
    dataset_id: dataset.id,
    engine: "nodeodm",
    preset_id: "nodeodm-baseline",
    status: "failed",
    stage: "odm:feature_extraction",
    progress: 18,
    queue_position: null,
    input_summary: {
      synthetic: true,
      imageCount: 20,
      datasetName: "Downtown imagery batch",
    },
    output_summary: buildSyntheticFailedOutputSummary(),
    external_job_reference: "synthetic-task-0001",
    created_by: config.ownerUserId,
    started_at: new Date(Date.now() - 110 * 60 * 1000).toISOString(),
    completed_at: new Date(Date.now() - 103 * 60 * 1000).toISOString(),
  });

  await client.deleteWhere("drone_processing_job_events", {
    job_id: `eq.${syntheticJob.id}`,
  });
  await client.insertMany("drone_processing_job_events", [
    {
      org_id: org.id,
      job_id: syntheticJob.id,
      event_type: "job.queued",
      payload: {
        title: "Synthetic NodeODM job queued",
        synthetic: true,
      },
      created_at: new Date(Date.now() - 115 * 60 * 1000).toISOString(),
    },
    {
      org_id: org.id,
      job_id: syntheticJob.id,
      event_type: "job.started",
      payload: {
        title: "Synthetic NodeODM job started",
        synthetic: true,
      },
      created_at: new Date(Date.now() - 110 * 60 * 1000).toISOString(),
    },
    {
      org_id: org.id,
      job_id: syntheticJob.id,
      event_type: "stage.entered",
      payload: {
        title: "Feature extraction started",
        stage: "odm:feature_extraction",
        synthetic: true,
      },
      created_at: new Date(Date.now() - 109 * 60 * 1000).toISOString(),
    },
    {
      org_id: org.id,
      job_id: syntheticJob.id,
      event_type: "job.failed",
      payload: {
        title: "Job failed at feature extraction (exit 137)",
        stage: "odm:feature_extraction",
        exit_code: 137,
        synthetic: true,
      },
      created_at: new Date(Date.now() - 103 * 60 * 1000).toISOString(),
    },
  ]);

  return {
    org,
    project,
    site,
    mission,
    dataset,
    successfulJob,
    syntheticJob,
    rasterArtifact,
    secondArtifact,
  };
}

function printGithubConfiguration(config, fixtures, storageResult) {
  const baseUrl = config.baseUrl ?? "<vercel-preview-or-production-url>";
  const anonKeySource = config.anonKeyEnvName
    ? `$${config.anonKeyEnvName}`
    : "<anon-key>";

  console.log("\nProvisioned Supabase E2E fixtures\n");
  console.log(
    JSON.stringify(
      {
        owner: {
          email: config.ownerEmail,
          userId: config.ownerUserId,
          authUserCreated: config.ownerUserCreated,
        },
        org: {
          id: fixtures.org.id,
          name: fixtures.org.name,
          slug: fixtures.org.slug,
        },
        project: { id: fixtures.project.id, slug: fixtures.project.slug },
        mission: { id: fixtures.mission.id, slug: fixtures.mission.slug },
        dataset: { id: fixtures.dataset.id, slug: fixtures.dataset.slug },
        artifacts: {
          raster: fixtures.rasterArtifact.id,
          second: fixtures.secondArtifact.id,
        },
        jobs: {
          successful: fixtures.successfulJob.id,
          syntheticFailed: fixtures.syntheticJob.id,
        },
        copilotEnabled: config.copilotEnabled,
        expectRaster: config.expectRaster,
        storage: storageResult,
      },
      null,
      2,
    ),
  );

  console.log("\nGitHub repository variables:\n");
  console.log(`gh variable set AERIAL_E2E_BASE_URL --body "${baseUrl}"`);
  console.log(`gh variable set AERIAL_E2E_OWNER_EMAIL --body "${config.ownerEmail}"`);
  console.log(`gh variable set AERIAL_E2E_OWNER_USER_ID --body "${config.ownerUserId}"`);
  console.log(`gh variable set AERIAL_E2E_ORG_ID --body "${fixtures.org.id}"`);
  console.log(
    `gh variable set AERIAL_E2E_RASTER_ARTIFACT_ID --body "${fixtures.rasterArtifact.id}"`,
  );
  console.log(
    `gh variable set AERIAL_E2E_SECOND_ARTIFACT_ID --body "${fixtures.secondArtifact.id}"`,
  );
  console.log(
    `gh variable set AERIAL_E2E_SYNTHETIC_JOB_ID --body "${fixtures.syntheticJob.id}"`,
  );
  console.log(
    `gh variable set AERIAL_E2E_EXPECT_RASTER --body "${config.expectRaster ? "1" : "0"}"`,
  );

  console.log("\nGitHub repository secrets:\n");
  console.log('gh secret set AERIAL_E2E_SUPABASE_URL --body "$SUPABASE_URL"');
  console.log(`gh secret set AERIAL_E2E_SUPABASE_ANON_KEY --body "${anonKeySource}"`);
  console.log(
    'gh secret set AERIAL_E2E_SUPABASE_SERVICE_ROLE_KEY --body "$SUPABASE_SERVICE_ROLE_KEY"',
  );

  console.log("\nEnable the main-branch authenticated smoke only after Preview env is stable:");
  console.log('gh variable set AERIAL_E2E_AUTH_SMOKE_ENABLED --body "1"');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help === "true") {
    usage();
    return;
  }

  const supabaseUrl = normalizeSupabaseUrl(requireEnv("SUPABASE_URL"));
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const anonKeyEnvName = readEnv("SUPABASE_ANON_KEY")
    ? "SUPABASE_ANON_KEY"
    : readEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
      ? "NEXT_PUBLIC_SUPABASE_ANON_KEY"
      : null;
  const anonKey = anonKeyEnvName ? readEnv(anonKeyEnvName) : null;
  const ownerEmail = readEnv("AERIAL_E2E_OWNER_EMAIL", DEFAULTS.ownerEmail);
  const ownerUserIdFromEnv = readEnv("AERIAL_E2E_OWNER_USER_ID");
  const orgName = readEnv("AERIAL_E2E_ORG_NAME", DEFAULTS.orgName);
  const orgSlug = readEnv("AERIAL_E2E_ORG_SLUG", DEFAULTS.orgSlug);
  const rasterBucket = readEnv("AERIAL_E2E_RASTER_BUCKET", DEFAULTS.rasterBucket);
  const rasterStoragePath = readEnv(
    "AERIAL_E2E_RASTER_STORAGE_PATH",
    DEFAULTS.rasterStoragePath.replace(DEFAULTS.orgSlug, orgSlug),
  );
  const rasterFixturePath = readEnv("AERIAL_E2E_RASTER_FIXTURE_PATH");
  const copilotEnabled = readBool("AERIAL_E2E_COPILOT_ENABLED", true);
  const expectRaster = readBool("AERIAL_E2E_EXPECT_RASTER", Boolean(rasterFixturePath));
  const baseUrl = readEnv("AERIAL_E2E_BASE_URL");

  if (rasterFixturePath && !path.isAbsolute(rasterFixturePath)) {
    throw new Error("AERIAL_E2E_RASTER_FIXTURE_PATH must be an absolute path.");
  }

  const client = createSupabaseAdminClient({ supabaseUrl, serviceRoleKey });
  const ownerResult = await resolveOwnerUser(client, {
    email: ownerEmail,
    explicitUserId: ownerUserIdFromEnv,
  });
  const ownerUserId = ownerResult.user.id;

  const config = {
    supabaseUrl,
    serviceRoleKey,
    anonKey,
    anonKeyEnvName,
    ownerEmail,
    ownerUserId,
    ownerUserCreated: ownerResult.created,
    orgName,
    orgSlug,
    projectSlug: DEFAULTS.projectSlug,
    siteSlug: DEFAULTS.siteSlug,
    missionSlug: DEFAULTS.missionSlug,
    datasetSlug: DEFAULTS.datasetSlug,
    rasterBucket,
    rasterStoragePath,
    rasterFixturePath,
    copilotEnabled,
    expectRaster,
    baseUrl,
  };

  let storageResult = {
    bucket: rasterBucket,
    path: rasterStoragePath,
    uploaded: false,
    note: "No raster fixture path was provided. Leave AERIAL_E2E_EXPECT_RASTER=0 unless this object already exists and TiTiler can read signed Supabase URLs.",
  };

  if (rasterFixturePath) {
    const bucketStatus = await client.ensureBucket(rasterBucket);
    await client.uploadStorageObject({
      bucket: rasterBucket,
      storagePath: rasterStoragePath,
      fixturePath: rasterFixturePath,
    });
    storageResult = {
      bucket: rasterBucket,
      path: rasterStoragePath,
      uploaded: true,
      note: `Bucket ${bucketStatus}; uploaded ${rasterFixturePath}.`,
    };
  }

  const fixtures = await provisionDatabaseFixtures(client, config);
  printGithubConfiguration(config, fixtures, storageResult);
}

main().catch((error) => {
  console.error("\nE2E fixture provisioning failed");
  console.error(error.message);
  if (error.payload) {
    console.error(JSON.stringify(error.payload, null, 2));
  }
  process.exit(1);
});
