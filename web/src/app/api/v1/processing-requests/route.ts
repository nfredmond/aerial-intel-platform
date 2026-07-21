import { NextRequest, NextResponse } from "next/server";

import {
  buildProcessingCallback,
  CONTRACT_PRESET_TO_NODEODM,
  parseProcessingRequest,
  type ExternalProcessingRequest,
} from "@/lib/external-processing";
import { checkExternalProcessingAuth } from "@/lib/internal-route-auth";
import { createLogger, extractRequestId } from "@/lib/logging";
import { normalizeSlug } from "@/lib/slug";
import {
  adminSelect,
  insertDataset,
  insertExternalProcessingRequest,
  insertIngestSession,
  insertJobEvent,
  insertMission,
  insertProcessingJob,
  insertProject,
  insertSite,
  selectExternalProcessingRequestByRequestId,
  updateExternalProcessingRequest,
  type ExternalProcessingRequestRow,
} from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

type OrgRow = { id: string; slug: string };

async function resolveExternalProcessingOrg(): Promise<OrgRow | null> {
  const slug = process.env.AERIAL_EXTERNAL_PROCESSING_ORG_SLUG?.trim();
  if (!slug) return null;
  const rows = await adminSelect<OrgRow[]>(
    `drone_orgs?slug=eq.${encodeURIComponent(slug)}&select=id,slug`,
  );
  return rows[0] ?? null;
}

function acceptedResponse(requestId: string, jobReference: string, replayed: boolean) {
  return NextResponse.json(
    buildProcessingCallback({
      requestId,
      jobReference,
      status: "accepted",
      message: replayed
        ? "Duplicate requestId; returning the previously accepted job."
        : "Processing request accepted; imagery ingest is queued.",
    }),
    { status: replayed ? 200 : 202 },
  );
}

function slugSuffix(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 6);
}

async function findOrCreateProject(orgId: string, system: string): Promise<{ id: string }> {
  const slug = `external-${normalizeSlug(system) || "consumer"}`;
  const existing = await adminSelect<Array<{ id: string }>>(
    `drone_projects?org_id=eq.${encodeURIComponent(orgId)}&slug=eq.${encodeURIComponent(slug)}&select=id`,
  );
  if (existing[0]) return existing[0];
  const inserted = await insertProject({
    org_id: orgId,
    name: `External missions · ${system}`,
    slug,
    status: "active",
    description: `Missions submitted by ${system} through the natford-aerial-processing.v1 contract.`,
  });
  if (!inserted?.id) throw new Error("could not create the external consumer project");
  return inserted;
}

async function findOrCreateSite(orgId: string, projectId: string, system: string): Promise<{ id: string }> {
  const slug = `external-${normalizeSlug(system) || "consumer"}-intake`;
  const existing = await adminSelect<Array<{ id: string }>>(
    `drone_sites?project_id=eq.${encodeURIComponent(projectId)}&slug=eq.${encodeURIComponent(slug)}&select=id`,
  );
  if (existing[0]) return existing[0];
  const inserted = await insertSite({
    org_id: orgId,
    project_id: projectId,
    name: `${system} intake`,
    slug,
    description: `Container site for externally submitted ${system} missions; geography lives on the consumer side.`,
  });
  if (!inserted?.id) throw new Error("could not create the external consumer site");
  return inserted;
}

async function createEntitiesForRequest(
  org: OrgRow,
  row: ExternalProcessingRequestRow,
  request: ExternalProcessingRequest,
): Promise<{ jobId: string }> {
  const system = request.externalRef.system;
  const project = await findOrCreateProject(org.id, system);
  const site = await findOrCreateSite(org.id, project.id, system);

  const missionSlug = `${(normalizeSlug(request.missionTitle) || "external-mission").slice(0, 40)}-${slugSuffix()}`;
  const mission = await insertMission({
    org_id: org.id,
    project_id: project.id,
    site_id: site.id,
    name: request.missionTitle,
    slug: missionSlug,
    mission_type: "external_processing",
    status: "queued",
    objective: request.notes ?? null,
    summary: {
      source: "external_processing",
      requestId: request.requestId,
      consumer: request.externalRef,
    } as Json,
  });
  if (!mission?.id) throw new Error("could not create the mission for the external request");

  const dataset = await insertDataset({
    org_id: org.id,
    project_id: project.id,
    site_id: site.id,
    mission_id: mission.id,
    name: `${request.missionTitle} imagery`,
    slug: `${missionSlug}-imagery`,
    kind: "image",
    status: "uploading",
    metadata: {
      source: "external_zip_url",
      requestId: request.requestId,
      imageCount: request.imagery.imageCount ?? null,
      sizeBytes: request.imagery.sizeBytes ?? null,
    } as Json,
  });
  if (!dataset?.id) throw new Error("could not create the dataset for the external request");

  const session = await insertIngestSession({
    org_id: org.id,
    mission_id: mission.id,
    dataset_id: dataset.id,
    session_label: `${request.missionTitle} external intake`,
    source_type: "external_zip",
    status: "zip_received",
    image_count: request.imagery.imageCount ?? null,
    file_size_bytes: request.imagery.sizeBytes ?? null,
    metadata: {
      source: "external_processing",
      requestId: request.requestId,
      consumerSystem: system,
    } as Json,
    notes: `Imagery arrives from a consumer-signed ZIP URL pulled by the external-ingest cron; no operator upload happens for this session.`,
  });
  if (!session?.id) throw new Error("could not create the ingest session for the external request");

  const job = await insertProcessingJob({
    org_id: org.id,
    project_id: project.id,
    site_id: site.id,
    mission_id: mission.id,
    dataset_id: dataset.id,
    engine: "odm",
    preset_id: CONTRACT_PRESET_TO_NODEODM[request.presetId],
    status: "queued",
    stage: "queued",
    progress: 0,
    input_summary: {
      name: `${request.missionTitle} external processing`,
      source: "external-processing-request",
      requestId: request.requestId,
      consumer: request.externalRef,
      contractPresetId: request.presetId,
    } as Json,
    output_summary: {
      external: {
        system,
        requestId: request.requestId,
      },
      eta: "Awaiting imagery ingest from the consumer ZIP URL",
      latestCheckpoint: "External request accepted; imagery ingest pending",
      logTail: [
        `ProcessingRequest ${request.requestId} accepted from ${system}.`,
        "Imagery ingest and NodeODM launch run on the external-ingest cron.",
      ],
    } as Json,
    external_job_reference: request.requestId,
  });
  if (!job?.id) throw new Error("could not create the processing job for the external request");

  await updateExternalProcessingRequest(row.id, org.id, {
    mission_id: mission.id,
    dataset_id: dataset.id,
    ingest_session_id: session.id,
    job_id: job.id,
  });

  await insertJobEvent({
    org_id: org.id,
    job_id: job.id,
    event_type: "external.request.accepted",
    payload: {
      requestId: request.requestId,
      consumerSystem: system,
      consumerMissionId: request.externalRef.missionId,
      presetId: request.presetId,
    } as Json,
  });

  return { jobId: job.id };
}

export async function POST(request: NextRequest) {
  const log = createLogger("api.v1.processing-requests", {
    requestId: extractRequestId(request),
  });

  const auth = checkExternalProcessingAuth(request);
  if (!auth.ok) {
    log.warn(auth.reason === "missing-secret" ? "blocked.token-missing" : "blocked.unauthorized");
    return NextResponse.json(
      auth.reason === "missing-secret"
        ? { ok: false, error: "external-processing-token-not-configured" }
        : { ok: false, error: "unauthorized" },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid-json" }, { status: 400 });
  }

  const parsed = parseProcessingRequest(body);
  if (!parsed.ok) {
    log.warn("blocked.invalid-payload", { errors: parsed.errors });
    return NextResponse.json(
      { ok: false, error: "invalid-processing-request", details: parsed.errors },
      { status: 400 },
    );
  }
  const processingRequest = parsed.request;

  try {
    const org = await resolveExternalProcessingOrg();
    if (!org) {
      log.error("blocked.org-unconfigured");
      return NextResponse.json(
        { ok: false, error: "external-processing-org-not-configured" },
        { status: 503 },
      );
    }

    const existing = await selectExternalProcessingRequestByRequestId(
      org.id,
      processingRequest.requestId,
    );
    if (existing?.job_id) {
      log.info("request.replayed", { requestId: processingRequest.requestId, jobId: existing.job_id });
      return acceptedResponse(processingRequest.requestId, existing.job_id, true);
    }

    let row = existing;
    if (!row) {
      try {
        row = await insertExternalProcessingRequest({
          org_id: org.id,
          request_id: processingRequest.requestId,
          consumer_system: processingRequest.externalRef.system,
          consumer_workspace_id: processingRequest.externalRef.workspaceId,
          consumer_mission_id: processingRequest.externalRef.missionId,
          consumer_project_id: processingRequest.externalRef.projectId ?? null,
          callback_url: processingRequest.callbackUrl,
          imagery_url: processingRequest.imagery.url,
          imagery_image_count: processingRequest.imagery.imageCount ?? null,
          imagery_size_bytes: processingRequest.imagery.sizeBytes ?? null,
          preset_id: processingRequest.presetId,
          notes: processingRequest.notes ?? null,
          // The 202 response below IS the accepted callback; record it as
          // delivered so the outbox never re-sends "accepted".
          last_callback_status: "accepted",
          last_callback_at: new Date().toISOString(),
        });
      } catch (error) {
        // Unique-violation race: another submission claimed this requestId
        // between our select and insert. Fall back to the winner's row.
        const raced = await selectExternalProcessingRequestByRequestId(
          org.id,
          processingRequest.requestId,
        );
        if (!raced) throw error;
        if (raced.job_id) {
          return acceptedResponse(processingRequest.requestId, raced.job_id, true);
        }
        log.warn("request.claim-race", { requestId: processingRequest.requestId });
        return NextResponse.json(
          { ok: false, error: "request-being-processed", retryable: true },
          { status: 409 },
        );
      }
    }
    if (!row) {
      throw new Error("external request row could not be created");
    }

    // row.job_id is null here: either a fresh claim or a crashed prior
    // attempt being repaired. The org-unique external_job_reference on the
    // job insert guards against double job creation if that prior attempt is
    // actually still in flight.
    let created: { jobId: string };
    try {
      created = await createEntitiesForRequest(org, row, processingRequest);
    } catch (error) {
      const raced = await selectExternalProcessingRequestByRequestId(
        org.id,
        processingRequest.requestId,
      );
      if (raced?.job_id) {
        return acceptedResponse(processingRequest.requestId, raced.job_id, true);
      }
      throw error;
    }

    log.info("request.accepted", {
      requestId: processingRequest.requestId,
      jobId: created.jobId,
      consumerSystem: processingRequest.externalRef.system,
    });
    return acceptedResponse(processingRequest.requestId, created.jobId, false);
  } catch (error) {
    log.error("request.failed", { error, requestId: processingRequest.requestId });
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "unknown-error" },
      { status: 500 },
    );
  }
}
