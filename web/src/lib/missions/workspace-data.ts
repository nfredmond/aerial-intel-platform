import { formatEntitlementTier } from "@/lib/auth/access-insights";
import type { DroneOpsAccessResult } from "@/lib/auth/drone-ops-access";
import { getArtifactHandoff, summarizeArtifactHandoffs } from "@/lib/artifact-handoff";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Database, Json } from "@/lib/supabase/types";

import {
  buildMissionWorkspaceSnapshot,
  type ActivityEventRecord,
  type DatasetRecord,
  type JobRecord,
  type MissionOutput,
  type MissionRecord,
  type MissionWorkspaceSnapshot,
  type OutputArtifactRecord,
  type StatusChip,
  type WorkspaceRailSection,
} from "./workspace";

type ProjectRow = Database["public"]["Tables"]["drone_projects"]["Row"];
type SiteRow = Database["public"]["Tables"]["drone_sites"]["Row"];
type MissionRow = Database["public"]["Tables"]["drone_missions"]["Row"];
type MissionVersionRow = Database["public"]["Tables"]["drone_mission_versions"]["Row"];
type DatasetRow = Database["public"]["Tables"]["drone_datasets"]["Row"];
type JobRow = Database["public"]["Tables"]["drone_processing_jobs"]["Row"];
type OutputRow = Database["public"]["Tables"]["drone_processing_outputs"]["Row"];
type JobEventRow = Database["public"]["Tables"]["drone_processing_job_events"]["Row"];

type JsonRecord = Record<string, Json | undefined>;

function asRecord(value: Json): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as JsonRecord;
}

function asString(value: Json | undefined, fallback: string) {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function asNumber(value: Json | undefined, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asStringArray(value: Json | undefined) {
  if (!Array.isArray(value)) {
    return [] as string[];
  }

  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function mapMissionStatusToStage(
  status: MissionRow["status"],
): MissionRecord["stage"] {
  if (status === "ready_for_review" || status === "delivered") {
    return "ready-for-qa";
  }

  if (status === "processing" || status === "queued" || status === "uploaded") {
    return "processing";
  }

  return "capture-planned";
}

function mapDatasetStatus(status: DatasetRow["status"]): DatasetRecord["status"] {
  if (status === "ready") {
    return "ready";
  }

  if (status === "uploading" || status === "uploaded" || status === "processing") {
    return "uploading";
  }

  return "flagged";
}

function mapJobStatus(status: JobRow["status"]): JobRecord["status"] {
  if (status === "running") {
    return "running";
  }

  if (status === "queued") {
    return "queued";
  }

  if (status === "succeeded") {
    return "completed";
  }

  return "needs_review";
}

function mapOutputStatus(status: OutputRow["status"]): OutputArtifactRecord["status"] {
  if (status === "ready") {
    return "ready";
  }

  if (status === "pending") {
    return "processing";
  }

  return "draft";
}

function buildMissionOutputs(outputs: OutputRow[]): MissionOutput[] {
  const outputMap = new Map(outputs.map((output) => [output.kind, output]));

  return [
    {
      key: "orthomosaic",
      label: "Orthomosaic",
      status: outputMap.get("orthomosaic")?.status === "ready" ? "ready" : outputMap.get("orthomosaic") ? "processing" : "missing",
      format: "COG",
    },
    {
      key: "surface-model",
      label: "Surface model",
      status:
        outputMap.get("dsm")?.status === "ready" || outputMap.get("dem")?.status === "ready"
          ? "ready"
          : outputMap.get("dsm") || outputMap.get("dem")
            ? "processing"
            : "missing",
      format: "COG",
    },
    {
      key: "point-cloud",
      label: "Point cloud",
      status: outputMap.get("point_cloud")?.status === "ready" ? "ready" : outputMap.get("point_cloud") ? "processing" : "missing",
      format: "LAZ",
    },
    {
      key: "mesh",
      label: "Mesh",
      status:
        outputMap.get("mesh")?.status === "ready" || outputMap.get("tiles_3d")?.status === "ready"
          ? "ready"
          : outputMap.get("mesh") || outputMap.get("tiles_3d")
            ? "processing"
            : "missing",
      format: "3D Tiles",
    },
  ];
}

function buildRail(options: {
  projectName: string;
  missionCount: number;
  datasetCount: number;
  jobCount: number;
  outputCount: number;
  sites: SiteRow[];
}): WorkspaceRailSection[] {
  return [
    {
      label: "Projects",
      items: [{ label: options.projectName, meta: "Active workspace", active: true }],
    },
    {
      label: "Sites",
      items: options.sites.slice(0, 4).map((site) => ({
        label: site.name,
        meta: site.description ?? "Tracked site",
      })),
    },
    {
      label: "Operations",
      items: [
        { label: "Missions", meta: `${options.missionCount} active`, active: true },
        { label: "Datasets", meta: `${options.datasetCount} tracked` },
        { label: "Jobs", meta: `${options.jobCount} live` },
        { label: "Outputs", meta: `${options.outputCount} surfaced` },
      ],
    },
  ];
}

function buildStatusChips(options: {
  missionsNeedingAttention: number;
  runningJobs: number;
  queuedJobs: number;
  readyOutputs: number;
  draftOutputs: number;
}): StatusChip[] {
  return [
    {
      label: "Mission health",
      value: `${options.missionsNeedingAttention} need attention`,
      tone: options.missionsNeedingAttention > 0 ? "warning" : "success",
    },
    {
      label: "Processing lane",
      value: `${options.runningJobs} running · ${options.queuedJobs} queued`,
      tone: options.runningJobs > 0 ? "info" : "warning",
    },
    {
      label: "Deliverables",
      value: `${options.readyOutputs} ready · ${options.draftOutputs} pending`,
      tone: options.readyOutputs > 0 ? "success" : "warning",
    },
    {
      label: "Data posture",
      value: "Supabase-backed workspace",
      tone: "info",
    },
  ];
}

function buildActivity(
  events: JobEventRow[],
  jobsById: Map<string, JobRow>,
  missionsById: Map<string, MissionRow>,
): ActivityEventRecord[] {
  return events.slice(0, 8).map((event) => {
    const job = jobsById.get(event.job_id);
    const mission = job?.mission_id ? missionsById.get(job.mission_id) : null;
    const payload = asRecord(event.payload);

    return {
      id: event.id,
      at: event.created_at,
      type: event.event_type,
      title: asString(payload.title, `${job?.engine?.toUpperCase() ?? "Job"} ${event.event_type}`),
      detail: asString(
        payload.detail,
        mission?.name
          ? `${mission.name} · stage ${job?.stage ?? "unknown"}`
          : `Job stage ${job?.stage ?? "unknown"}`,
      ),
    };
  });
}

function buildWorkspaceFromRows(params: {
  access: DroneOpsAccessResult;
  projects: ProjectRow[];
  sites: SiteRow[];
  missions: MissionRow[];
  missionVersions: MissionVersionRow[];
  datasets: DatasetRow[];
  jobs: JobRow[];
  outputs: OutputRow[];
  events: JobEventRow[];
}): MissionWorkspaceSnapshot {
  const { access, projects, sites, missions, missionVersions, datasets, jobs, outputs, events } = params;

  const primaryProject = projects[0];
  const sitesById = new Map(sites.map((site) => [site.id, site]));
  const latestVersionByMissionId = new Map<string, MissionVersionRow>();
  for (const version of missionVersions) {
    const existing = latestVersionByMissionId.get(version.mission_id);
    if (!existing || version.version_number > existing.version_number) {
      latestVersionByMissionId.set(version.mission_id, version);
    }
  }

  const outputsByMissionId = new Map<string, OutputRow[]>();
  for (const output of outputs) {
    if (!output.mission_id) continue;
    const group = outputsByMissionId.get(output.mission_id) ?? [];
    group.push(output);
    outputsByMissionId.set(output.mission_id, group);
  }

  const outputsByJobId = new Map<string, OutputRow[]>();
  for (const output of outputs) {
    const group = outputsByJobId.get(output.job_id) ?? [];
    group.push(output);
    outputsByJobId.set(output.job_id, group);
  }

  const missionRows: MissionRecord[] = missions.map((mission) => {
    const summary = asRecord(mission.summary);
    const version = latestVersionByMissionId.get(mission.id);
    const site = sitesById.get(mission.site_id);
    const missionOutputs = outputsByMissionId.get(mission.id) ?? [];
    const blockers = asStringArray(summary.blockers);
    const warnings = asStringArray(summary.warnings);
    const handoffCounts = summarizeArtifactHandoffs(missionOutputs.map((output) => asRecord(output.metadata)));
    const readyOutputCount = missionOutputs.filter((output) => output.status === "ready").length;

    if (readyOutputCount > 0 && handoffCounts.pendingReviewCount > 0) {
      warnings.push(`${handoffCounts.pendingReviewCount} artifact(s) still pending review in the handoff lane.`);
    }

    if (readyOutputCount > 0 && handoffCounts.sharedCount + handoffCounts.exportedCount === 0) {
      warnings.push("No artifacts have been shared or exported yet.");
    }

    return {
      id: mission.id,
      name: mission.name,
      missionType: mission.mission_type,
      siteName: site?.name ?? "Unknown site",
      captureDate: asString(summary.captureDate, mission.created_at),
      lastUpdated: mission.updated_at,
      versionLabel: version ? `v${version.version_number} ${version.status}` : "v1 draft",
      stage: mapMissionStatusToStage(mission.status),
      areaAcres: asNumber(summary.areaAcres, 0),
      imageCount: asNumber(summary.imageCount, 0),
      gsdCm: asNumber(summary.gsdCm, 0),
      coordinateSystem: asString(summary.coordinateSystem, "Unknown CRS"),
      processingProfile: asString(summary.processingProfile, "Processing profile not set"),
      targetDevice: asString(summary.targetDevice, "Target device not set"),
      batteryPlan: asString(summary.batteryPlan, "Battery plan not set"),
      compatibility: asString(summary.compatibility, "Compatibility not yet assessed"),
      healthScore: asNumber(summary.healthScore, 0),
      outputs: buildMissionOutputs(missionOutputs),
      blockers,
      warnings: Array.from(new Set(warnings)),
    };
  });

  const datasetRows: DatasetRecord[] = datasets.map((dataset) => {
    const metadata = asRecord(dataset.metadata);
    return {
      id: dataset.id,
      name: dataset.name,
      kind: dataset.kind,
      status: mapDatasetStatus(dataset.status),
      capturedAt: dataset.captured_at ?? dataset.created_at,
      imageCount: asNumber(metadata.imageCount, 0),
      footprint: asString(metadata.footprint, "Footprint pending"),
      finding: asString(metadata.finding, "No ingest findings recorded yet."),
    };
  });

  const jobsRows: JobRecord[] = jobs.map((job) => {
    const inputSummary = asRecord(job.input_summary);
    const outputSummary = asRecord(job.output_summary);

    return {
      id: job.id,
      name: asString(inputSummary.name, `${job.engine.toUpperCase()} job`),
      engine: job.engine,
      stage: job.stage,
      status: mapJobStatus(job.status),
      progress: job.progress,
      eta: asString(outputSummary.eta, job.status === "running" ? "Calculating" : "Pending"),
      queuePosition:
        typeof job.queue_position === "number" ? `Queue position ${job.queue_position}` : job.status === "running" ? "Running now" : "Queued",
      startedAt: job.started_at ?? job.created_at,
      notes: asString(outputSummary.notes, "No job notes recorded yet."),
    };
  });

  const outputRows: OutputArtifactRecord[] = outputs.map((output) => {
    const metadata = asRecord(output.metadata);
    const handoff = getArtifactHandoff(metadata);

    return {
      id: output.id,
      name: asString(metadata.name, output.kind.replaceAll("_", " ")),
      kind: output.kind.replaceAll("_", " "),
      status: mapOutputStatus(output.status),
      format: asString(metadata.format, output.kind === "orthomosaic" || output.kind === "dsm" || output.kind === "dem" ? "COG" : "Derived artifact"),
      delivery: asString(metadata.delivery, output.storage_path ?? "Storage path pending"),
      handoffStage: handoff.stage,
      handoffLabel: handoff.stageLabel,
      nextAction: handoff.nextAction,
      sourceJob: jobs.find((job) => job.id === output.job_id)?.engine ?? "Unknown job",
    };
  });

  const jobsById = new Map(jobs.map((job) => [job.id, job]));
  const missionsById = new Map(missions.map((mission) => [mission.id, mission]));
  const activity = buildActivity(events, jobsById, missionsById);

  const readyOutputCount = missionRows
    .flatMap((mission) => mission.outputs)
    .filter((output) => output.status === "ready").length;
  const outputsInProgressCount = missionRows
    .flatMap((mission) => mission.outputs)
    .filter((output) => output.status === "processing").length;
  const outputsMissingCount = missionRows
    .flatMap((mission) => mission.outputs)
    .filter((output) => output.status === "missing").length;
  const missionsNeedingAttention = missionRows.filter(
    (mission) => mission.stage !== "ready-for-qa" || mission.blockers.length > 0 || mission.warnings.length > 0,
  ).length;
  const runningJobs = jobs.filter((job) => job.status === "running").length;
  const queuedJobs = jobs.filter((job) => job.status === "queued").length;
  const draftOutputs = outputRows.filter((output) => output.status !== "ready").length;

  const projectName = primaryProject?.name ?? `${access.org?.name ?? "DroneOps"} aerial operations`;
  const currentSiteName = sites[0]?.name ?? "No site selected yet";

  return {
    workspaceLabel: access.org?.name?.trim() ? `${access.org.name} mission workspace` : "Mission workspace",
    entitlementLabel: formatEntitlementTier(access.entitlement?.tier_id),
    currentProject: {
      name: projectName,
      site: currentSiteName,
      objective:
        primaryProject?.description ??
        "Aerial operations workspace populated from durable Supabase project/site/mission/job records.",
      terrainSource: "Server-backed data model ready; terrain validation service still next",
      coordinateSystem: missionRows[0]?.coordinateSystem ?? "Unknown CRS",
      collaborationStatus: "Query-backed workspace; realtime collaboration still pending",
    },
    rail: buildRail({
      projectName,
      missionCount: missionRows.length,
      datasetCount: datasetRows.length,
      jobCount: jobsRows.length,
      outputCount: outputRows.length,
      sites,
    }),
    statusChips: buildStatusChips({
      missionsNeedingAttention,
      runningJobs,
      queuedJobs,
      readyOutputs: readyOutputCount,
      draftOutputs,
    }),
    missions: missionRows,
    datasets: datasetRows,
    jobs: jobsRows,
    outputArtifacts: outputRows,
    activity,
    totals: {
      missionCount: missionRows.length,
      totalAcres: missionRows.reduce((sum, mission) => sum + mission.areaAcres, 0),
      readyOutputCount,
      outputsInProgressCount,
      outputsMissingCount,
      missionsNeedingAttention,
      datasetCount: datasetRows.length,
      activeJobCount: jobsRows.filter((job) => job.status !== "completed").length,
    },
    nextActions: [
      "Replace fallback/demo data completely by applying the new migration and seeding at least one project/site/mission/job set.",
      "Wire job-event writes from processing orchestration so the activity console reflects real status transitions.",
      "Promote the first query-backed mission into a real output review flow with artifact detail pages and share/export actions.",
      access.role === "owner" || access.role === "admin"
        ? "Lock write policies and mutation routes once the schema is exercised with real planner and job flows."
        : "Escalate schema or data gaps to your org owner before promising operational readiness.",
    ],
  };
}

function isMissingRelationError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const maybeError = error as { code?: string; message?: string };
  return (
    maybeError.code === "42P01" ||
    maybeError.code === "PGRST205" ||
    maybeError.message?.toLowerCase().includes("does not exist") === true
  );
}

export async function getMissionWorkspaceSnapshot(
  access: DroneOpsAccessResult,
): Promise<{ snapshot: MissionWorkspaceSnapshot; source: "database" | "fallback" }> {
  if (!access.org?.id) {
    return {
      snapshot: buildMissionWorkspaceSnapshot({
        orgName: access.org?.name,
        tierId: access.entitlement?.tier_id,
        role: access.role,
      }),
      source: "fallback",
    };
  }

  const supabase = await createServerSupabaseClient();
  const orgId = access.org.id;

  try {
    const [projectsResult, sitesResult, missionsResult, missionVersionsResult, datasetsResult, jobsResult, outputsResult, eventsResult] = await Promise.all([
      supabase
        .from("drone_projects")
        .select("id, org_id, name, slug, status, description, created_by, created_at, updated_at, archived_at")
        .eq("org_id", orgId)
        .order("updated_at", { ascending: false })
        .limit(5),
      supabase
        .from("drone_sites")
        .select("id, org_id, project_id, name, slug, description, boundary, center, site_notes, created_by, created_at, updated_at, archived_at")
        .eq("org_id", orgId)
        .order("updated_at", { ascending: false })
        .limit(12),
      supabase
        .from("drone_missions")
        .select("id, org_id, project_id, site_id, name, slug, mission_type, status, objective, planning_geometry, summary, created_by, created_at, updated_at, archived_at")
        .eq("org_id", orgId)
        .order("updated_at", { ascending: false })
        .limit(12),
      supabase
        .from("drone_mission_versions")
        .select("id, org_id, mission_id, version_number, source_format, status, plan_payload, validation_summary, export_summary, created_by, created_at")
        .eq("org_id", orgId)
        .order("version_number", { ascending: false })
        .limit(30),
      supabase
        .from("drone_datasets")
        .select("id, org_id, project_id, site_id, mission_id, name, slug, kind, status, captured_at, spatial_footprint, metadata, created_by, created_at, updated_at, archived_at")
        .eq("org_id", orgId)
        .order("updated_at", { ascending: false })
        .limit(20),
      supabase
        .from("drone_processing_jobs")
        .select("id, org_id, project_id, site_id, mission_id, dataset_id, engine, preset_id, status, stage, progress, queue_position, input_summary, output_summary, external_job_reference, created_by, created_at, updated_at, started_at, completed_at")
        .eq("org_id", orgId)
        .order("updated_at", { ascending: false })
        .limit(20),
      supabase
        .from("drone_processing_outputs")
        .select("id, org_id, job_id, mission_id, dataset_id, kind, status, storage_bucket, storage_path, metadata, created_at, updated_at")
        .eq("org_id", orgId)
        .order("updated_at", { ascending: false })
        .limit(30),
      supabase
        .from("drone_processing_job_events")
        .select("id, org_id, job_id, event_type, payload, created_at")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false })
        .limit(30),
    ]);

    const results = [projectsResult, sitesResult, missionsResult, missionVersionsResult, datasetsResult, jobsResult, outputsResult, eventsResult];
    const queryError = results.find((result) => result.error)?.error;
    if (queryError) {
      throw queryError;
    }

    const projects = (projectsResult.data ?? []) as ProjectRow[];
    const sites = (sitesResult.data ?? []) as SiteRow[];
    const missions = (missionsResult.data ?? []) as MissionRow[];
    const missionVersions = (missionVersionsResult.data ?? []) as MissionVersionRow[];
    const datasets = (datasetsResult.data ?? []) as DatasetRow[];
    const jobs = (jobsResult.data ?? []) as JobRow[];
    const outputs = (outputsResult.data ?? []) as OutputRow[];
    const events = (eventsResult.data ?? []) as JobEventRow[];

    if (
      missions.length === 0 ||
      (projects.length === 0 && sites.length === 0 && missions.length === 0 && datasets.length === 0 && jobs.length === 0)
    ) {
      return {
        snapshot: buildMissionWorkspaceSnapshot({
          orgName: access.org.name,
          tierId: access.entitlement?.tier_id,
          role: access.role,
        }),
        source: "fallback",
      };
    }

    return {
      snapshot: buildWorkspaceFromRows({
        access,
        projects,
        sites,
        missions,
        missionVersions,
        datasets,
        jobs,
        outputs,
        events,
      }),
      source: "database",
    };
  } catch (error) {
    if (!isMissingRelationError(error)) {
      console.warn("Falling back to demo mission workspace due to aerial-ops query error", error);
    }

    return {
      snapshot: buildMissionWorkspaceSnapshot({
        orgName: access.org.name,
        tierId: access.entitlement?.tier_id,
        role: access.role,
      }),
      source: "fallback",
    };
  }
}
