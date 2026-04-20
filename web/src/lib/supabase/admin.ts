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

export async function adminSelect<T>(path: string) {
  return adminRestRequest<T>(path, { method: "GET" });
}

export type ProjectInsert = {
  org_id: string;
  name: string;
  slug: string;
  status?: string;
  description?: string | null;
  created_by?: string | null;
};

export type SiteInsert = {
  org_id: string;
  project_id: string;
  name: string;
  slug: string;
  description?: string | null;
  boundary?: Json | null;
  center?: Json | null;
  site_notes?: Json;
  created_by?: string | null;
};

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

export type IngestSessionInsert = {
  org_id: string;
  mission_id: string;
  dataset_id?: string | null;
  session_label: string;
  source_type?: string;
  status?: string;
  source_filename?: string | null;
  source_zip_path?: string | null;
  extracted_dataset_path?: string | null;
  benchmark_summary_path?: string | null;
  run_log_path?: string | null;
  review_bundle_zip_path?: string | null;
  image_count?: number | null;
  file_size_bytes?: number | null;
  review_bundle_ready?: boolean;
  truthful_pass?: boolean | null;
  metadata?: Json;
  notes?: string | null;
  created_by?: string | null;
};

export type IngestSessionPatch = {
  status?: string;
  source_zip_path?: string | null;
  extracted_dataset_path?: string | null;
  benchmark_summary_path?: string | null;
  run_log_path?: string | null;
  review_bundle_zip_path?: string | null;
  image_count?: number | null;
  file_size_bytes?: number | null;
  review_bundle_ready?: boolean;
  truthful_pass?: boolean | null;
  metadata?: Json;
  notes?: string | null;
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

export type MissionPatch = {
  status?: string;
  objective?: string | null;
  planning_geometry?: Json | null;
  summary?: Json;
};

export type MissionVersionPatch = {
  status?: string;
  plan_payload?: Json;
  validation_summary?: Json;
  export_summary?: Json;
};

export type DatasetPatch = {
  status?: string;
  spatial_footprint?: Json | null;
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
  external_job_reference?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
};

export type ProcessingOutputPatch = {
  status?: string;
  storage_bucket?: string | null;
  storage_path?: string | null;
  metadata?: Json;
};

export async function insertProject(input: ProjectInsert) {
  const rows = await adminRestRequest<Array<{ id: string }>>(
    "drone_projects?select=id",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );

  return rows[0] ?? null;
}

export async function insertSite(input: SiteInsert) {
  const rows = await adminRestRequest<Array<{ id: string }>>(
    "drone_sites?select=id",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );

  return rows[0] ?? null;
}

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

export async function updateMission(id: string, patch: MissionPatch) {
  const rows = await adminRestRequest<Array<{ id: string }>>(
    `drone_missions?id=eq.${encodeURIComponent(id)}&select=id`,
    {
      method: "PATCH",
      body: JSON.stringify(patch),
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

export async function insertIngestSession(input: IngestSessionInsert) {
  const rows = await adminRestRequest<Array<{ id: string }>>(
    "drone_ingest_sessions?select=id",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );

  return rows[0] ?? null;
}

export async function updateIngestSession(id: string, patch: IngestSessionPatch) {
  const rows = await adminRestRequest<Array<{ id: string }>>(
    `drone_ingest_sessions?id=eq.${encodeURIComponent(id)}&select=id`,
    {
      method: "PATCH",
      body: JSON.stringify(patch),
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

export async function updateProcessingOutput(id: string, patch: ProcessingOutputPatch) {
  const rows = await adminRestRequest<Array<{ id: string }>>(
    `drone_processing_outputs?id=eq.${encodeURIComponent(id)}&select=id`,
    {
      method: "PATCH",
      body: JSON.stringify(patch),
    },
  );

  return rows[0] ?? null;
}

export type ArtifactShareLinkInsert = {
  org_id: string;
  artifact_id: string;
  token: string;
  note?: string | null;
  max_uses?: number | null;
  expires_at?: string | null;
  created_by?: string | null;
};

export type ArtifactShareLinkPatch = {
  note?: string | null;
  max_uses?: number | null;
  expires_at?: string | null;
  revoked_at?: string | null;
  use_count?: number;
  last_used_at?: string | null;
};

export type ArtifactShareLinkRow = {
  id: string;
  org_id: string;
  artifact_id: string;
  token: string;
  note: string | null;
  max_uses: number | null;
  use_count: number;
  expires_at: string | null;
  revoked_at: string | null;
  last_used_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export async function insertArtifactShareLink(input: ArtifactShareLinkInsert) {
  const rows = await adminRestRequest<ArtifactShareLinkRow[]>(
    "drone_artifact_share_links?select=*",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
  return rows[0] ?? null;
}

export async function updateArtifactShareLink(id: string, patch: ArtifactShareLinkPatch) {
  const rows = await adminRestRequest<ArtifactShareLinkRow[]>(
    `drone_artifact_share_links?id=eq.${encodeURIComponent(id)}&select=*`,
    {
      method: "PATCH",
      body: JSON.stringify(patch),
    },
  );
  return rows[0] ?? null;
}

export async function selectArtifactShareLinksByArtifact(artifactId: string) {
  const query = `drone_artifact_share_links?artifact_id=eq.${encodeURIComponent(
    artifactId,
  )}&select=*&order=created_at.desc`;
  return adminRestRequest<ArtifactShareLinkRow[]>(query, { method: "GET" });
}

export async function selectArtifactShareLinkByToken(
  token: string,
): Promise<ArtifactShareLinkRow | null> {
  const rows = await adminRestRequest<ArtifactShareLinkRow[]>(
    `drone_artifact_share_links?token=eq.${encodeURIComponent(token)}&select=*`,
    { method: "GET" },
  );
  return rows[0] ?? null;
}

export async function selectTopShareLinksByUsage(orgId: string, limit: number) {
  const query =
    `drone_artifact_share_links?org_id=eq.${encodeURIComponent(orgId)}` +
    `&select=*&order=use_count.desc,last_used_at.desc.nullslast&limit=${limit}`;
  return adminRestRequest<ArtifactShareLinkRow[]>(query, { method: "GET" });
}

export async function selectShareLinksNearExpiry(orgId: string, daysUntil: number) {
  const horizon = new Date(Date.now() + daysUntil * 86_400_000).toISOString();
  const query =
    `drone_artifact_share_links?org_id=eq.${encodeURIComponent(orgId)}` +
    `&expires_at=not.is.null&expires_at=lt.${encodeURIComponent(horizon)}` +
    `&revoked_at=is.null&select=*&order=expires_at.asc`;
  return adminRestRequest<ArtifactShareLinkRow[]>(query, { method: "GET" });
}

export type ProcessingOutputPublicRow = {
  id: string;
  org_id: string;
  kind: string;
  status: string;
  storage_bucket: string | null;
  storage_path: string | null;
  metadata: Json;
  mission_id: string | null;
  created_at: string;
};

export async function selectProcessingOutputById(
  id: string,
): Promise<ProcessingOutputPublicRow | null> {
  const rows = await adminRestRequest<ProcessingOutputPublicRow[]>(
    `drone_processing_outputs?id=eq.${encodeURIComponent(
      id,
    )}&select=id,org_id,kind,status,storage_bucket,storage_path,metadata,mission_id,created_at`,
    { method: "GET" },
  );
  return rows[0] ?? null;
}

export type MembershipAdminRow = {
  org_id: string;
  user_id: string;
  role: string;
  status: "active" | "suspended";
  created_at: string;
};

export type MembershipInsert = {
  org_id: string;
  user_id: string;
  role: string;
  status?: "active" | "suspended";
};

export async function selectMembershipsForOrg(orgId: string) {
  return adminRestRequest<MembershipAdminRow[]>(
    `drone_memberships?org_id=eq.${encodeURIComponent(orgId)}&select=*&order=created_at.asc`,
    { method: "GET" },
  );
}

export async function selectMembershipByOrgUser(orgId: string, userId: string) {
  const rows = await adminRestRequest<MembershipAdminRow[]>(
    `drone_memberships?org_id=eq.${encodeURIComponent(
      orgId,
    )}&user_id=eq.${encodeURIComponent(userId)}&select=*`,
    { method: "GET" },
  );
  return rows[0] ?? null;
}

export async function insertMembership(input: MembershipInsert) {
  const rows = await adminRestRequest<MembershipAdminRow[]>(
    "drone_memberships?select=*",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
  return rows[0] ?? null;
}

export type MembershipStatusPatch = {
  status: "active" | "suspended";
};

export async function updateMembershipStatus(
  orgId: string,
  userId: string,
  patch: MembershipStatusPatch,
) {
  const rows = await adminRestRequest<MembershipAdminRow[]>(
    `drone_memberships?org_id=eq.${encodeURIComponent(
      orgId,
    )}&user_id=eq.${encodeURIComponent(userId)}&select=*`,
    {
      method: "PATCH",
      body: JSON.stringify(patch),
    },
  );
  return rows[0] ?? null;
}

export type InvitationRow = {
  id: string;
  org_id: string;
  email: string;
  role: "owner" | "admin" | "analyst" | "viewer";
  invited_by: string;
  status: "pending" | "accepted" | "revoked" | "expired";
  token: string;
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
  accepted_by: string | null;
};

export type InvitationInsert = {
  org_id: string;
  email: string;
  role: "owner" | "admin" | "analyst" | "viewer";
  invited_by: string;
  token: string;
  expires_at?: string;
};

export async function insertInvitation(input: InvitationInsert) {
  const rows = await adminRestRequest<InvitationRow[]>(
    "drone_invitations?select=*",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
  return rows[0] ?? null;
}

export async function selectInvitationsForOrg(orgId: string) {
  return adminRestRequest<InvitationRow[]>(
    `drone_invitations?org_id=eq.${encodeURIComponent(orgId)}&select=*&order=created_at.desc`,
    { method: "GET" },
  );
}

export async function selectInvitationByToken(token: string) {
  const rows = await adminRestRequest<InvitationRow[]>(
    `drone_invitations?token=eq.${encodeURIComponent(token)}&select=*`,
    { method: "GET" },
  );
  return rows[0] ?? null;
}

export type InvitationStatusPatch = {
  status: "pending" | "accepted" | "revoked" | "expired";
  accepted_at?: string | null;
  accepted_by?: string | null;
};

export async function updateInvitationStatus(
  id: string,
  orgId: string,
  patch: InvitationStatusPatch,
) {
  const rows = await adminRestRequest<InvitationRow[]>(
    `drone_invitations?id=eq.${encodeURIComponent(id)}&org_id=eq.${encodeURIComponent(orgId)}&select=*`,
    {
      method: "PATCH",
      body: JSON.stringify(patch),
    },
  );
  return rows[0] ?? null;
}

export type OrgEventInsert = {
  org_id: string;
  actor_user_id?: string | null;
  event_type: string;
  payload?: Json;
};

export async function insertOrgEvent(input: OrgEventInsert) {
  await adminRestRequest("drone_org_events", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export type OrgEventRow = {
  id: string;
  org_id: string;
  actor_user_id: string | null;
  event_type: string;
  payload: Json;
  created_at: string;
};

export async function selectRecentCopilotEventsForOrg(orgId: string, limit = 30) {
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 100);
  return adminRestRequest<OrgEventRow[]>(
    `drone_org_events?org_id=eq.${encodeURIComponent(
      orgId,
    )}&event_type=like.copilot.call.*&select=*&order=created_at.desc&limit=${safeLimit}`,
    { method: "GET" },
  );
}

export type EntitlementAdminRow = {
  id: string;
  org_id: string;
  product_id: string;
  tier_id: string;
  status: string;
  source: string;
  external_reference: string | null;
  created_at: string;
  updated_at: string;
};

export async function selectEntitlementsForOrg(orgId: string) {
  return adminRestRequest<EntitlementAdminRow[]>(
    `drone_entitlements?org_id=eq.${encodeURIComponent(orgId)}&select=*&order=updated_at.desc`,
    { method: "GET" },
  );
}

export type ProcessingJobAdminRow = {
  id: string;
  org_id: string;
  project_id: string | null;
  mission_id: string | null;
  engine: string;
  status: string;
  stage: string | null;
  progress: number | null;
  preset_id: string | null;
  external_job_reference: string | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
};

export async function selectRecentJobsForOrg(orgId: string, limit = 20) {
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 200);
  return adminRestRequest<ProcessingJobAdminRow[]>(
    `drone_processing_jobs?org_id=eq.${encodeURIComponent(
      orgId,
    )}&select=id,org_id,project_id,mission_id,engine,status,stage,progress,preset_id,external_job_reference,created_at,updated_at,started_at,completed_at&order=updated_at.desc&limit=${safeLimit}`,
    { method: "GET" },
  );
}

export type NodeOdmJobAdminRow = {
  id: string;
  org_id: string;
  mission_id: string | null;
  status: string;
  stage: string | null;
  updated_at: string;
  output_summary: Record<string, unknown> | null;
};

export async function selectNodeOdmJobsForOrg(orgId: string, limit = 20) {
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 200);
  return adminRestRequest<NodeOdmJobAdminRow[]>(
    `drone_processing_jobs?org_id=eq.${encodeURIComponent(
      orgId,
    )}&output_summary->nodeodm->>taskUuid=not.is.null&select=id,org_id,mission_id,status,stage,updated_at,output_summary&order=updated_at.desc&limit=${safeLimit}`,
    { method: "GET" },
  );
}

export type StaleInFlightJobAdminRow = {
  id: string;
  org_id: string;
  mission_id: string | null;
  engine: string;
  status: string;
  stage: string | null;
  progress: number | null;
  updated_at: string;
};

export async function selectStaleInFlightJobsForOrg(
  orgId: string,
  options: { minutesStale?: number; limit?: number } = {},
) {
  const { minutesStale = 60, limit = 20 } = options;
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 200);
  const safeMinutes = Math.max(1, Math.trunc(minutesStale));
  const cutoff = new Date(Date.now() - safeMinutes * 60_000).toISOString();
  return adminRestRequest<StaleInFlightJobAdminRow[]>(
    `drone_processing_jobs?org_id=eq.${encodeURIComponent(
      orgId,
    )}&status=in.(pending,queued,processing,awaiting_output_import)&updated_at=lt.${encodeURIComponent(
      cutoff,
    )}&select=id,org_id,mission_id,engine,status,stage,progress,updated_at&order=updated_at.asc&limit=${safeLimit}`,
    { method: "GET" },
  );
}

export type ProcessingJobEventAdminRow = {
  id: string;
  org_id: string;
  job_id: string;
  event_type: string;
  payload: Json;
  created_at: string;
};

export async function selectRecentEventsForOrg(orgId: string, limit = 30) {
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 200);
  return adminRestRequest<ProcessingJobEventAdminRow[]>(
    `drone_processing_job_events?org_id=eq.${encodeURIComponent(
      orgId,
    )}&select=*&order=created_at.desc&limit=${safeLimit}`,
    { method: "GET" },
  );
}

export type ArtifactCommentInsert = {
  org_id: string;
  artifact_id: string;
  parent_id?: string | null;
  author_user_id?: string | null;
  author_email?: string | null;
  body: string;
};

export type ArtifactCommentPatch = {
  body?: string;
  resolved_at?: string | null;
};

export type ArtifactCommentRow = {
  id: string;
  org_id: string;
  artifact_id: string;
  parent_id: string | null;
  author_user_id: string | null;
  author_email: string | null;
  body: string;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
};

export async function insertArtifactComment(input: ArtifactCommentInsert) {
  const rows = await adminRestRequest<ArtifactCommentRow[]>(
    "drone_artifact_comments?select=*",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
  return rows[0] ?? null;
}

export async function updateArtifactComment(input: {
  id: string;
  orgId: string;
  artifactId: string;
  patch: ArtifactCommentPatch;
}) {
  const rows = await adminRestRequest<ArtifactCommentRow[]>(
    `drone_artifact_comments?id=eq.${encodeURIComponent(
      input.id,
    )}&org_id=eq.${encodeURIComponent(input.orgId)}&artifact_id=eq.${encodeURIComponent(
      input.artifactId,
    )}&select=*`,
    {
      method: "PATCH",
      body: JSON.stringify(input.patch),
    },
  );
  return rows[0] ?? null;
}

export async function selectArtifactCommentsByArtifact(artifactId: string) {
  const query = `drone_artifact_comments?artifact_id=eq.${encodeURIComponent(
    artifactId,
  )}&select=*&order=created_at.asc`;
  return adminRestRequest<ArtifactCommentRow[]>(query, { method: "GET" });
}

export type ArtifactApprovalDecision = "approved" | "changes_requested";

export type ArtifactApprovalInsert = {
  org_id: string;
  artifact_id: string;
  reviewer_user_id?: string | null;
  reviewer_email?: string | null;
  decision: ArtifactApprovalDecision;
  note?: string | null;
};

export type ArtifactApprovalRow = {
  id: string;
  org_id: string;
  artifact_id: string;
  reviewer_user_id: string | null;
  reviewer_email: string | null;
  decision: ArtifactApprovalDecision;
  note: string | null;
  decided_at: string;
  created_at: string;
  updated_at: string;
};

export async function insertArtifactApproval(input: ArtifactApprovalInsert) {
  const rows = await adminRestRequest<ArtifactApprovalRow[]>(
    "drone_artifact_approvals?select=*",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
  return rows[0] ?? null;
}

export async function selectArtifactApprovalsByArtifact(artifactId: string) {
  const query = `drone_artifact_approvals?artifact_id=eq.${encodeURIComponent(
    artifactId,
  )}&select=*&order=decided_at.desc`;
  return adminRestRequest<ArtifactApprovalRow[]>(query, { method: "GET" });
}

export type CopilotQuotaRow = {
  id: string;
  org_id: string;
  period_month: string;
  spend_tenth_cents: number;
  cap_tenth_cents: number;
  last_call_at: string | null;
  created_at: string;
  updated_at: string;
};

export async function selectCopilotQuotaRowsForOrg(orgId: string, limit = 6) {
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 60);
  const query =
    `drone_org_ai_quota?org_id=eq.${encodeURIComponent(orgId)}` +
    `&select=*&order=period_month.desc&limit=${safeLimit}`;
  return adminRestRequest<CopilotQuotaRow[]>(query, { method: "GET" });
}

export type CopilotOrgSettingsRow = {
  org_id: string;
  copilot_enabled: boolean;
  created_at: string;
  updated_at: string;
};

export async function selectCopilotOrgSettings(orgId: string) {
  const query = `drone_org_settings?org_id=eq.${encodeURIComponent(
    orgId,
  )}&select=org_id,copilot_enabled,created_at,updated_at`;
  const rows = await adminRestRequest<CopilotOrgSettingsRow[]>(query, { method: "GET" });
  return rows[0] ?? null;
}
