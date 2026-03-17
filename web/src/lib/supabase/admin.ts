import { getSupabaseEnv } from "@/lib/supabase/env";
import type { Json } from "@/lib/supabase/types";

function getSupabaseAdminEnv() {
  const { url } = getSupabaseEnv();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRoleKey) {
    throw new Error(
      "Missing SUPABASE_SERVICE_ROLE_KEY. Set it for server-side mutation routes and actions.",
    );
  }

  return { url, serviceRoleKey };
}

async function adminRestRequest<T>(path: string, options: RequestInit = {}) {
  const { url, serviceRoleKey } = getSupabaseAdminEnv();
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(options.headers ?? {}),
    },
  });

  const payload = (await response.json().catch(() => null)) as T | { message?: string } | null;

  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "message" in payload && payload.message
        ? payload.message
        : `Supabase admin request failed (${response.status})`;
    throw new Error(message);
  }

  return payload as T;
}

export type MissionInsert = {
  org_id: string;
  project_id: string;
  site_id: string;
  name: string;
  slug: string;
  mission_type: string;
  status?: string;
  objective?: string | null;
  summary?: Json;
  created_by?: string | null;
};

export type MissionVersionInsert = {
  org_id: string;
  mission_id: string;
  version_number: number;
  source_format?: string;
  status?: string;
  plan_payload?: Json;
  validation_summary?: Json;
  export_summary?: Json;
  created_by?: string | null;
};

export type DatasetInsert = {
  org_id: string;
  project_id: string;
  site_id?: string | null;
  mission_id?: string | null;
  name: string;
  slug: string;
  kind: string;
  status?: string;
  captured_at?: string | null;
  metadata?: Json;
  created_by?: string | null;
};

export type ProcessingJobInsert = {
  org_id: string;
  project_id: string;
  site_id?: string | null;
  mission_id?: string | null;
  dataset_id?: string | null;
  engine?: string;
  preset_id?: string | null;
  status?: string;
  stage?: string;
  progress?: number;
  queue_position?: number | null;
  input_summary?: Json;
  output_summary?: Json;
  external_job_reference?: string | null;
  created_by?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
};

export type ProcessingOutputInsert = {
  org_id: string;
  job_id: string;
  mission_id?: string | null;
  dataset_id?: string | null;
  kind: string;
  status?: string;
  storage_bucket?: string | null;
  storage_path?: string | null;
  metadata?: Json;
};

export type JobEventInsert = {
  org_id: string;
  job_id: string;
  event_type: string;
  payload?: Json;
};

export type MissionVersionPatch = {
  status?: string;
  plan_payload?: Json;
  validation_summary?: Json;
  export_summary?: Json;
};

export type DatasetPatch = {
  status?: string;
  metadata?: Json;
  captured_at?: string | null;
};

export type ProcessingJobPatch = {
  status?: string;
  stage?: string;
  progress?: number;
  queue_position?: number | null;
  input_summary?: Json;
  output_summary?: Json;
  completed_at?: string | null;
};

export async function insertMission(input: MissionInsert) {
  const rows = await adminRestRequest<Array<{ id: string }>>(
    "drone_missions?select=id",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );

  return rows[0] ?? null;
}

export async function insertMissionVersion(input: MissionVersionInsert) {
  const rows = await adminRestRequest<Array<{ id: string }>>(
    "drone_mission_versions?select=id",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );

  return rows[0] ?? null;
}

export async function insertDataset(input: DatasetInsert) {
  const rows = await adminRestRequest<Array<{ id: string }>>(
    "drone_datasets?select=id",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );

  return rows[0] ?? null;
}

export async function insertProcessingJob(input: ProcessingJobInsert) {
  const rows = await adminRestRequest<Array<{ id: string }>>(
    "drone_processing_jobs?select=id",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );

  return rows[0] ?? null;
}

export async function insertProcessingOutputs(inputs: ProcessingOutputInsert[]) {
  if (inputs.length === 0) {
    return [] as Array<{ id: string }>;
  }

  return adminRestRequest<Array<{ id: string }>>(
    "drone_processing_outputs?select=id",
    {
      method: "POST",
      body: JSON.stringify(inputs),
    },
  );
}

export async function insertJobEvent(input: JobEventInsert) {
  await adminRestRequest("drone_processing_job_events", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateMissionVersion(id: string, patch: MissionVersionPatch) {
  const rows = await adminRestRequest<Array<{ id: string }>>(
    `drone_mission_versions?id=eq.${encodeURIComponent(id)}&select=id`,
    {
      method: "PATCH",
      body: JSON.stringify(patch),
    },
  );

  return rows[0] ?? null;
}

export async function updateDataset(id: string, patch: DatasetPatch) {
  const rows = await adminRestRequest<Array<{ id: string }>>(
    `drone_datasets?id=eq.${encodeURIComponent(id)}&select=id`,
    {
      method: "PATCH",
      body: JSON.stringify(patch),
    },
  );

  return rows[0] ?? null;
}

export async function updateProcessingJob(id: string, patch: ProcessingJobPatch) {
  const rows = await adminRestRequest<Array<{ id: string }>>(
    `drone_processing_jobs?id=eq.${encodeURIComponent(id)}&select=id`,
    {
      method: "PATCH",
      body: JSON.stringify(patch),
    },
  );

  return rows[0] ?? null;
}
