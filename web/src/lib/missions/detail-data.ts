import type { DroneOpsAccessResult } from "@/lib/auth/drone-ops-access";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Database, Json } from "@/lib/supabase/types";

type ProjectRow = Database["public"]["Tables"]["drone_projects"]["Row"];
type SiteRow = Database["public"]["Tables"]["drone_sites"]["Row"];
type MissionRow = Database["public"]["Tables"]["drone_missions"]["Row"];
type MissionVersionRow = Database["public"]["Tables"]["drone_mission_versions"]["Row"];
type DatasetRow = Database["public"]["Tables"]["drone_datasets"]["Row"];
type JobRow = Database["public"]["Tables"]["drone_processing_jobs"]["Row"];
type OutputRow = Database["public"]["Tables"]["drone_processing_outputs"]["Row"];
type JobEventRow = Database["public"]["Tables"]["drone_processing_job_events"]["Row"];

type JsonRecord = Record<string, Json | undefined>;

export type MissionDetail = {
  mission: MissionRow;
  project: ProjectRow | null;
  site: SiteRow | null;
  versions: MissionVersionRow[];
  datasets: DatasetRow[];
  jobs: JobRow[];
  outputs: OutputRow[];
  events: JobEventRow[];
  summary: JsonRecord;
};

export type JobDetail = {
  job: JobRow;
  mission: MissionRow | null;
  project: ProjectRow | null;
  site: SiteRow | null;
  dataset: DatasetRow | null;
  outputs: OutputRow[];
  events: JobEventRow[];
  inputSummary: JsonRecord;
  outputSummary: JsonRecord;
};

export type ArtifactDetail = {
  output: OutputRow;
  job: JobRow | null;
  mission: MissionRow | null;
  project: ProjectRow | null;
  site: SiteRow | null;
  dataset: DatasetRow | null;
  events: JobEventRow[];
  metadata: JsonRecord;
  inputSummary: JsonRecord;
  outputSummary: JsonRecord;
};

export type DatasetDetail = {
  dataset: DatasetRow;
  mission: MissionRow | null;
  project: ProjectRow | null;
  site: SiteRow | null;
  jobs: JobRow[];
  outputs: OutputRow[];
  events: JobEventRow[];
  metadata: JsonRecord;
};

function asRecord(value: Json): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as JsonRecord;
}

export function getString(value: Json | undefined, fallback = "Not set") {
  return typeof value === "string" && value.trim() ? value : fallback;
}

export function getNumber(value: Json | undefined, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function getStringArray(value: Json | undefined) {
  if (!Array.isArray(value)) {
    return [] as string[];
  }

  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

export async function getMissionDetail(
  access: DroneOpsAccessResult,
  missionId: string,
): Promise<MissionDetail | null> {
  if (!access.org?.id) {
    return null;
  }

  const supabase = await createServerSupabaseClient();
  const orgId = access.org.id;

  const { data: mission, error: missionError } = await supabase
    .from("drone_missions")
    .select(
      "id, org_id, project_id, site_id, name, slug, mission_type, status, objective, planning_geometry, summary, created_by, created_at, updated_at, archived_at",
    )
    .eq("org_id", orgId)
    .eq("id", missionId)
    .maybeSingle();

  if (missionError || !mission) {
    return null;
  }

  const missionRow = mission as MissionRow;

  const [projectResult, siteResult, versionsResult, datasetsResult, jobsResult] = await Promise.all([
    supabase
      .from("drone_projects")
      .select("id, org_id, name, slug, status, description, created_by, created_at, updated_at, archived_at")
      .eq("org_id", orgId)
      .eq("id", missionRow.project_id)
      .maybeSingle(),
    supabase
      .from("drone_sites")
      .select("id, org_id, project_id, name, slug, description, boundary, center, site_notes, created_by, created_at, updated_at, archived_at")
      .eq("org_id", orgId)
      .eq("id", missionRow.site_id)
      .maybeSingle(),
    supabase
      .from("drone_mission_versions")
      .select("id, org_id, mission_id, version_number, source_format, status, plan_payload, validation_summary, export_summary, created_by, created_at")
      .eq("org_id", orgId)
      .eq("mission_id", missionRow.id)
      .order("version_number", { ascending: false }),
    supabase
      .from("drone_datasets")
      .select("id, org_id, project_id, site_id, mission_id, name, slug, kind, status, captured_at, spatial_footprint, metadata, created_by, created_at, updated_at, archived_at")
      .eq("org_id", orgId)
      .eq("mission_id", missionRow.id)
      .order("updated_at", { ascending: false }),
    supabase
      .from("drone_processing_jobs")
      .select("id, org_id, project_id, site_id, mission_id, dataset_id, engine, preset_id, status, stage, progress, queue_position, input_summary, output_summary, external_job_reference, created_by, created_at, updated_at, started_at, completed_at")
      .eq("org_id", orgId)
      .eq("mission_id", missionRow.id)
      .order("updated_at", { ascending: false }),
  ]);

  const jobs = (jobsResult.data ?? []) as JobRow[];
  const jobIds = jobs.map((job) => job.id);

  const [outputsResult, eventsResult] = jobIds.length
    ? await Promise.all([
        supabase
          .from("drone_processing_outputs")
          .select("id, org_id, job_id, mission_id, dataset_id, kind, status, storage_bucket, storage_path, metadata, created_at, updated_at")
          .eq("org_id", orgId)
          .in("job_id", jobIds)
          .order("updated_at", { ascending: false }),
        supabase
          .from("drone_processing_job_events")
          .select("id, org_id, job_id, event_type, payload, created_at")
          .eq("org_id", orgId)
          .in("job_id", jobIds)
          .order("created_at", { ascending: false }),
      ])
    : [{ data: [] as OutputRow[] }, { data: [] as JobEventRow[] }];

  return {
    mission: missionRow,
    project: (projectResult.data as ProjectRow | null) ?? null,
    site: (siteResult.data as SiteRow | null) ?? null,
    versions: (versionsResult.data ?? []) as MissionVersionRow[],
    datasets: (datasetsResult.data ?? []) as DatasetRow[],
    jobs,
    outputs: (outputsResult.data ?? []) as OutputRow[],
    events: (eventsResult.data ?? []) as JobEventRow[],
    summary: asRecord(missionRow.summary),
  };
}

export async function getJobDetail(
  access: DroneOpsAccessResult,
  jobId: string,
): Promise<JobDetail | null> {
  if (!access.org?.id) {
    return null;
  }

  const supabase = await createServerSupabaseClient();
  const orgId = access.org.id;

  const { data: job, error: jobError } = await supabase
    .from("drone_processing_jobs")
    .select(
      "id, org_id, project_id, site_id, mission_id, dataset_id, engine, preset_id, status, stage, progress, queue_position, input_summary, output_summary, external_job_reference, created_by, created_at, updated_at, started_at, completed_at",
    )
    .eq("org_id", orgId)
    .eq("id", jobId)
    .maybeSingle();

  if (jobError || !job) {
    return null;
  }

  const jobRow = job as JobRow;

  const [missionResult, projectResult, siteResult, datasetResult, outputsResult, eventsResult] = await Promise.all([
    jobRow.mission_id
      ? supabase
          .from("drone_missions")
          .select("id, org_id, project_id, site_id, name, slug, mission_type, status, objective, planning_geometry, summary, created_by, created_at, updated_at, archived_at")
          .eq("org_id", orgId)
          .eq("id", jobRow.mission_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("drone_projects")
      .select("id, org_id, name, slug, status, description, created_by, created_at, updated_at, archived_at")
      .eq("org_id", orgId)
      .eq("id", jobRow.project_id)
      .maybeSingle(),
    jobRow.site_id
      ? supabase
          .from("drone_sites")
          .select("id, org_id, project_id, name, slug, description, boundary, center, site_notes, created_by, created_at, updated_at, archived_at")
          .eq("org_id", orgId)
          .eq("id", jobRow.site_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    jobRow.dataset_id
      ? supabase
          .from("drone_datasets")
          .select("id, org_id, project_id, site_id, mission_id, name, slug, kind, status, captured_at, spatial_footprint, metadata, created_by, created_at, updated_at, archived_at")
          .eq("org_id", orgId)
          .eq("id", jobRow.dataset_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("drone_processing_outputs")
      .select("id, org_id, job_id, mission_id, dataset_id, kind, status, storage_bucket, storage_path, metadata, created_at, updated_at")
      .eq("org_id", orgId)
      .eq("job_id", jobRow.id)
      .order("updated_at", { ascending: false }),
    supabase
      .from("drone_processing_job_events")
      .select("id, org_id, job_id, event_type, payload, created_at")
      .eq("org_id", orgId)
      .eq("job_id", jobRow.id)
      .order("created_at", { ascending: false }),
  ]);

  return {
    job: jobRow,
    mission: (missionResult.data as MissionRow | null) ?? null,
    project: (projectResult.data as ProjectRow | null) ?? null,
    site: (siteResult.data as SiteRow | null) ?? null,
    dataset: (datasetResult.data as DatasetRow | null) ?? null,
    outputs: (outputsResult.data ?? []) as OutputRow[],
    events: (eventsResult.data ?? []) as JobEventRow[],
    inputSummary: asRecord(jobRow.input_summary),
    outputSummary: asRecord(jobRow.output_summary),
  };
}

export async function getDatasetDetail(
  access: DroneOpsAccessResult,
  datasetId: string,
): Promise<DatasetDetail | null> {
  if (!access.org?.id) {
    return null;
  }

  const supabase = await createServerSupabaseClient();
  const orgId = access.org.id;

  const { data: dataset, error: datasetError } = await supabase
    .from("drone_datasets")
    .select(
      "id, org_id, project_id, site_id, mission_id, name, slug, kind, status, captured_at, spatial_footprint, metadata, created_by, created_at, updated_at, archived_at",
    )
    .eq("org_id", orgId)
    .eq("id", datasetId)
    .maybeSingle();

  if (datasetError || !dataset) {
    return null;
  }

  const datasetRow = dataset as DatasetRow;

  const [missionResult, projectResult, siteResult, jobsResult] = await Promise.all([
    datasetRow.mission_id
      ? supabase
          .from("drone_missions")
          .select("id, org_id, project_id, site_id, name, slug, mission_type, status, objective, planning_geometry, summary, created_by, created_at, updated_at, archived_at")
          .eq("org_id", orgId)
          .eq("id", datasetRow.mission_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("drone_projects")
      .select("id, org_id, name, slug, status, description, created_by, created_at, updated_at, archived_at")
      .eq("org_id", orgId)
      .eq("id", datasetRow.project_id)
      .maybeSingle(),
    datasetRow.site_id
      ? supabase
          .from("drone_sites")
          .select("id, org_id, project_id, name, slug, description, boundary, center, site_notes, created_by, created_at, updated_at, archived_at")
          .eq("org_id", orgId)
          .eq("id", datasetRow.site_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("drone_processing_jobs")
      .select("id, org_id, project_id, site_id, mission_id, dataset_id, engine, preset_id, status, stage, progress, queue_position, input_summary, output_summary, external_job_reference, created_by, created_at, updated_at, started_at, completed_at")
      .eq("org_id", orgId)
      .eq("dataset_id", datasetRow.id)
      .order("updated_at", { ascending: false }),
  ]);

  const jobs = (jobsResult.data ?? []) as JobRow[];
  const jobIds = jobs.map((job) => job.id);

  const [outputsResult, eventsResult] = jobIds.length
    ? await Promise.all([
        supabase
          .from("drone_processing_outputs")
          .select("id, org_id, job_id, mission_id, dataset_id, kind, status, storage_bucket, storage_path, metadata, created_at, updated_at")
          .eq("org_id", orgId)
          .in("job_id", jobIds)
          .order("updated_at", { ascending: false }),
        supabase
          .from("drone_processing_job_events")
          .select("id, org_id, job_id, event_type, payload, created_at")
          .eq("org_id", orgId)
          .in("job_id", jobIds)
          .order("created_at", { ascending: false }),
      ])
    : [{ data: [] as OutputRow[] }, { data: [] as JobEventRow[] }];

  return {
    dataset: datasetRow,
    mission: (missionResult.data as MissionRow | null) ?? null,
    project: (projectResult.data as ProjectRow | null) ?? null,
    site: (siteResult.data as SiteRow | null) ?? null,
    jobs,
    outputs: (outputsResult.data ?? []) as OutputRow[],
    events: (eventsResult.data ?? []) as JobEventRow[],
    metadata: asRecord(datasetRow.metadata),
  };
}

export async function getArtifactDetail(
  access: DroneOpsAccessResult,
  artifactId: string,
): Promise<ArtifactDetail | null> {
  if (!access.org?.id) {
    return null;
  }

  const supabase = await createServerSupabaseClient();
  const orgId = access.org.id;

  const { data: output, error: outputError } = await supabase
    .from("drone_processing_outputs")
    .select(
      "id, org_id, job_id, mission_id, dataset_id, kind, status, storage_bucket, storage_path, metadata, created_at, updated_at",
    )
    .eq("org_id", orgId)
    .eq("id", artifactId)
    .maybeSingle();

  if (outputError || !output) {
    return null;
  }

  const outputRow = output as OutputRow;

  const { data: job } = await supabase
    .from("drone_processing_jobs")
    .select(
      "id, org_id, project_id, site_id, mission_id, dataset_id, engine, preset_id, status, stage, progress, queue_position, input_summary, output_summary, external_job_reference, created_by, created_at, updated_at, started_at, completed_at",
    )
    .eq("org_id", orgId)
    .eq("id", outputRow.job_id)
    .maybeSingle();

  const jobRow = (job as JobRow | null) ?? null;

  const [missionResult, datasetResult, projectResult, siteResult, eventsResult] = await Promise.all([
    outputRow.mission_id
      ? supabase
          .from("drone_missions")
          .select("id, org_id, project_id, site_id, name, slug, mission_type, status, objective, planning_geometry, summary, created_by, created_at, updated_at, archived_at")
          .eq("org_id", orgId)
          .eq("id", outputRow.mission_id)
          .maybeSingle()
      : jobRow?.mission_id
        ? supabase
            .from("drone_missions")
            .select("id, org_id, project_id, site_id, name, slug, mission_type, status, objective, planning_geometry, summary, created_by, created_at, updated_at, archived_at")
            .eq("org_id", orgId)
            .eq("id", jobRow.mission_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    outputRow.dataset_id
      ? supabase
          .from("drone_datasets")
          .select("id, org_id, project_id, site_id, mission_id, name, slug, kind, status, captured_at, spatial_footprint, metadata, created_by, created_at, updated_at, archived_at")
          .eq("org_id", orgId)
          .eq("id", outputRow.dataset_id)
          .maybeSingle()
      : jobRow?.dataset_id
        ? supabase
            .from("drone_datasets")
            .select("id, org_id, project_id, site_id, mission_id, name, slug, kind, status, captured_at, spatial_footprint, metadata, created_by, created_at, updated_at, archived_at")
            .eq("org_id", orgId)
            .eq("id", jobRow.dataset_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    jobRow?.project_id
      ? supabase
          .from("drone_projects")
          .select("id, org_id, name, slug, status, description, created_by, created_at, updated_at, archived_at")
          .eq("org_id", orgId)
          .eq("id", jobRow.project_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    jobRow?.site_id
      ? supabase
          .from("drone_sites")
          .select("id, org_id, project_id, name, slug, description, boundary, center, site_notes, created_by, created_at, updated_at, archived_at")
          .eq("org_id", orgId)
          .eq("id", jobRow.site_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("drone_processing_job_events")
      .select("id, org_id, job_id, event_type, payload, created_at")
      .eq("org_id", orgId)
      .eq("job_id", outputRow.job_id)
      .order("created_at", { ascending: false }),
  ]);

  return {
    output: outputRow,
    job: jobRow,
    mission: (missionResult.data as MissionRow | null) ?? null,
    project: (projectResult.data as ProjectRow | null) ?? null,
    site: (siteResult.data as SiteRow | null) ?? null,
    dataset: (datasetResult.data as DatasetRow | null) ?? null,
    events: (eventsResult.data ?? []) as JobEventRow[],
    metadata: asRecord(outputRow.metadata),
    inputSummary: asRecord(jobRow?.input_summary ?? null),
    outputSummary: asRecord(jobRow?.output_summary ?? null),
  };
}
