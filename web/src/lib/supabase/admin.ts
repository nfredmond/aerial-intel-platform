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

export type JobEventInsert = {
  org_id: string;
  job_id: string;
  event_type: string;
  payload?: Json;
};

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

export async function insertJobEvent(input: JobEventInsert) {
  await adminRestRequest("drone_processing_job_events", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
