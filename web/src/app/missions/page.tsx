import { redirect } from "next/navigation";

import { BlockedAccessView } from "@/app/dashboard/blocked-access-view";
import { getDroneOpsAccess } from "@/lib/auth/drone-ops-access";
import { getArtifactHandoff, updateArtifactHandoffMetadata } from "@/lib/artifact-handoff";
import { getJobDetail } from "@/lib/missions/detail-data";
import { getMissionWorkspaceSnapshot } from "@/lib/missions/workspace-data";
import { advanceManualProvingJob, isManualProvingJobDetail } from "@/lib/proving-runs";
import { normalizeSlug } from "@/lib/slug";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  insertJobEvent,
  insertMission,
  insertMissionVersion,
  insertProject,
  insertSite,
  updateProcessingOutput,
} from "@/lib/supabase/admin";

import { MissionWorkspace } from "./mission-workspace";

export const dynamic = "force-dynamic";

function getFormString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function getFormNumber(formData: FormData, key: string, fallback: number) {
  const value = Number(getFormString(formData, key));
  return Number.isFinite(value) ? value : fallback;
}

function getWorkspaceNotice(states: { create?: string; handoff?: string; proving?: string }) {
  switch (states.create) {
    case "denied":
      return {
        tone: "error" as const,
        message: "Viewer access cannot create missions. Ask an owner, admin, or analyst to draft the next mission.",
      };
    case "missing-site":
      return {
        tone: "warning" as const,
        message: "No site is available yet for this org. Seed or create a project/site first, then draft a mission.",
      };
    case "missing-name":
      return {
        tone: "warning" as const,
        message: "Mission name is required before a draft can be created.",
      };
    case "error":
      return {
        tone: "error" as const,
        message: "The mission draft could not be created. Check server configuration and try again.",
      };
    case "bootstrap-done":
      return {
        tone: "success" as const,
        message: "Live aerial-ops workspace bootstrapped. You now have a real project/site/mission/version chain in the protected data path.",
      };
    case "bootstrap-denied":
      return {
        tone: "error" as const,
        message: "Viewer access cannot bootstrap the live workspace.",
      };
    case "bootstrap-error":
      return {
        tone: "error" as const,
        message: "The live workspace bootstrap failed. Check Supabase configuration and try again.",
      };
    default:
      break;
  }

  switch (states.handoff) {
    case "reviewed":
      return {
        tone: "success" as const,
        message: "Artifact marked reviewed from the workspace queue.",
      };
    case "shared":
      return {
        tone: "success" as const,
        message: "Artifact marked shared from the workspace queue.",
      };
    case "exported":
      return {
        tone: "success" as const,
        message: "Artifact marked exported from the workspace queue.",
      };
    case "note-saved":
      return {
        tone: "success" as const,
        message: "Artifact handoff note saved from the workspace queue.",
      };
    case "denied":
      return {
        tone: "error" as const,
        message: "Viewer access cannot update artifact handoff state from the workspace.",
      };
    case "not-ready":
      return {
        tone: "warning" as const,
        message: "Only ready artifacts can advance through the workspace handoff queue.",
      };
    case "missing-artifact":
      return {
        tone: "warning" as const,
        message: "That artifact could not be found in the current org workspace.",
      };
    case "error":
      return {
        tone: "error" as const,
        message: "The artifact handoff update could not be completed. Check server configuration and try again.",
      };
    default:
      break;
  }

  switch (states.proving) {
    case "started":
      return {
        tone: "success" as const,
        message: "Proving job started from the workspace. The live run is now in active processing.",
      };
    case "completed":
      return {
        tone: "success" as const,
        message: "Proving job completed from the workspace. Ready artifacts are now waiting in the delivery lane.",
      };
    case "denied":
      return {
        tone: "error" as const,
        message: "Viewer access cannot advance proving jobs from the workspace.",
      };
    case "missing-job":
      return {
        tone: "warning" as const,
        message: "No active proving job was available to advance from the workspace.",
      };
    case "not-proving":
      return {
        tone: "warning" as const,
        message: "That workspace job is not marked as a proving run.",
      };
    case "noop":
      return {
        tone: "warning" as const,
        message: "This proving job does not have a next-step automation available right now.",
      };
    case "error":
      return {
        tone: "error" as const,
        message: "The workspace proving-step action failed. Check server configuration and try again.",
      };
    default:
      return null;
  }
}

export default async function MissionsPage({
  searchParams,
}: {
  searchParams: Promise<{ create?: string; handoff?: string; proving?: string }>;
}) {
  const access = await getDroneOpsAccess();

  if (!access.isAuthenticated) {
    redirect("/sign-in");
  }

  if (!access.hasMembership || !access.hasActiveEntitlement) {
    return <BlockedAccessView access={access} />;
  }

  async function bootstrapLiveWorkspace() {
    "use server";

    const refreshedAccess = await getDroneOpsAccess();

    if (!refreshedAccess.user) {
      redirect("/sign-in");
    }

    if (!refreshedAccess.org?.id || !refreshedAccess.hasMembership || !refreshedAccess.hasActiveEntitlement) {
      redirect("/dashboard");
    }

    if (refreshedAccess.role === "viewer") {
      redirect("/missions?create=bootstrap-denied");
    }

    const supabase = await createServerSupabaseClient();

    try {
      const existingMissionResult = await supabase
        .from("drone_missions")
        .select("id")
        .eq("org_id", refreshedAccess.org.id)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const existingMission = (existingMissionResult.data as { id: string } | null) ?? null;

      if (existingMission?.id) {
        redirect(`/missions/${existingMission.id}?created=1`);
      }

      const existingProjectResult = await supabase
        .from("drone_projects")
        .select("id, name")
        .eq("org_id", refreshedAccess.org.id)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const existingProject = (existingProjectResult.data as { id: string; name: string } | null) ?? null;

      const projectName = `${refreshedAccess.org.name} aerial operations`;
      const projectId = existingProject?.id
        ? existingProject.id
        : (
            await insertProject({
              org_id: refreshedAccess.org.id,
              name: projectName,
              slug: normalizeSlug(projectName),
              status: "active",
              description: "Bootstrap project for the live aerial operations proving path.",
              created_by: refreshedAccess.user.id,
            })
          )?.id;

      if (!projectId) {
        redirect("/missions?create=bootstrap-error");
      }

      const existingSiteResult = await supabase
        .from("drone_sites")
        .select("id, project_id")
        .eq("org_id", refreshedAccess.org.id)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const existingSite = (existingSiteResult.data as { id: string; project_id: string } | null) ?? null;

      const siteName = "Live v1 proving ground";
      const siteId = existingSite?.id
        ? existingSite.id
        : (
            await insertSite({
              org_id: refreshedAccess.org.id,
              project_id: projectId,
              name: siteName,
              slug: normalizeSlug(siteName),
              description: "Bootstrap site for validating the live aerial-ops workflow.",
              site_notes: {
                bootstrap: true,
                purpose: "Switch workspace from fallback to real database-backed mission flow.",
              },
              created_by: refreshedAccess.user.id,
            })
          )?.id;

      if (!siteId) {
        redirect("/missions?create=bootstrap-error");
      }

      const missionName = "Live v1 proving mission";
      const insertedMissionId = (
        await insertMission({
          org_id: refreshedAccess.org.id,
          project_id: projectId,
          site_id: siteId,
          name: missionName,
          slug: normalizeSlug(missionName),
          mission_type: "corridor",
          status: "draft",
          objective: "Bootstrap the real data-backed aerial-ops path so dataset attach, job queueing, and delivery review can happen on live records.",
          summary: {
            captureDate: new Date().toISOString(),
            areaAcres: 12,
            imageCount: 0,
            gsdCm: 1.8,
            coordinateSystem: "EPSG:26910 / NAD83 UTM Zone 10N",
            processingProfile: "Bootstrap proving mission",
            targetDevice: "DJI Mavic 3 Enterprise / Pilot 2",
            batteryPlan: "TBD",
            compatibility: "Bootstrap flow",
            healthScore: 40,
            blockers: ["Attach the first dataset to move this live mission toward the v1 acceptance bar."],
            warnings: ["This record was bootstrapped to switch the workspace onto the live data path."],
          },
          created_by: refreshedAccess.user.id,
        })
      )?.id;

      if (!insertedMissionId) {
        redirect("/missions?create=bootstrap-error");
      }

      await insertMissionVersion({
        org_id: refreshedAccess.org.id,
        mission_id: insertedMissionId,
        version_number: 1,
        source_format: "bootstrap",
        status: "draft",
        plan_payload: {
          bootstrap: true,
          objective: "Create the first real mission/version pair in the protected aerial-ops workspace.",
        },
        validation_summary: {
          bootstrap: true,
          checks: [],
        },
        export_summary: {
          bootstrap: true,
          outputs: [],
        },
        created_by: refreshedAccess.user.id,
      });
    } catch {
      redirect("/missions?create=bootstrap-error");
    }

    redirect("/missions?create=bootstrap-done");
  }

  async function createMissionDraft(formData: FormData) {
    "use server";

    const refreshedAccess = await getDroneOpsAccess();

    if (!refreshedAccess.user) {
      redirect("/sign-in");
    }

    if (!refreshedAccess.org?.id || !refreshedAccess.hasMembership || !refreshedAccess.hasActiveEntitlement) {
      redirect("/dashboard");
    }

    if (refreshedAccess.role === "viewer") {
      redirect("/missions?create=denied");
    }

    const missionName = getFormString(formData, "missionName");
    if (!missionName) {
      redirect("/missions?create=missing-name");
    }

    const missionType = getFormString(formData, "missionType") || "corridor";
    const objective = getFormString(formData, "objective");
    const targetDevice = getFormString(formData, "targetDevice") || "DJI Mavic 3 Enterprise / Pilot 2";
    const gsdCm = getFormNumber(formData, "gsdCm", 2);

    const supabase = await createServerSupabaseClient();
    const siteResult = await supabase
      .from("drone_sites")
      .select("id, org_id, project_id, name, slug")
      .eq("org_id", refreshedAccess.org.id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const site = siteResult.data as
      | { id: string; project_id: string; name: string; slug: string; org_id: string }
      | null;

    if (!site?.id || !site.project_id) {
      redirect("/missions?create=missing-site");
    }

    const slugBase = normalizeSlug(missionName) || "mission-draft";
    const missionCountResult = await supabase
      .from("drone_missions")
      .select("id", { count: "exact", head: true })
      .eq("org_id", refreshedAccess.org.id)
      .eq("site_id", site.id);
    const missionSequence = (missionCountResult.count ?? 0) + 1;

    let insertedMissionId = "";

    try {
      const insertedMission = await insertMission({
        org_id: refreshedAccess.org.id,
        project_id: site.project_id,
        site_id: site.id,
        name: missionName,
        slug: `${slugBase}-${missionSequence}`,
        mission_type: missionType,
        status: "draft",
        objective: objective || null,
        summary: {
          captureDate: new Date().toISOString(),
          areaAcres: 0,
          imageCount: 0,
          gsdCm,
          coordinateSystem: "EPSG:4326 / mission draft",
          processingProfile: "Fast Map",
          targetDevice,
          batteryPlan: "Pending mission simulation",
          compatibility: "Validation pending",
          healthScore: 62,
          blockers: ["Attach a dataset before queueing processing."],
          warnings: [
            "Planner geometry, terrain validation, and compatibility checks are still pending.",
          ],
        },
        created_by: refreshedAccess.user.id,
      });

      if (!insertedMission?.id) {
        redirect("/missions?create=error");
      }

      insertedMissionId = insertedMission.id;

      await insertMissionVersion({
        org_id: refreshedAccess.org.id,
        mission_id: insertedMission.id,
        version_number: 1,
        source_format: "native",
        status: "draft",
        plan_payload: {
          missionType,
          targetDevice,
          createdFrom: "workspace-quick-create",
        },
        validation_summary: {
          status: "pending",
          checks: ["dataset-attached", "terrain-validated", "device-compatible"],
        },
        export_summary: {
          available: [],
        },
        created_by: refreshedAccess.user.id,
      });
    } catch {
      redirect("/missions?create=error");
    }

    redirect(`/missions/${insertedMissionId}?created=1`);
  }

  async function advanceArtifactHandoff(formData: FormData) {
    "use server";

    const refreshedAccess = await getDroneOpsAccess();

    if (!refreshedAccess.user) {
      redirect("/sign-in");
    }

    if (!refreshedAccess.org?.id || !refreshedAccess.hasMembership || !refreshedAccess.hasActiveEntitlement) {
      redirect("/dashboard");
    }

    if (refreshedAccess.role === "viewer") {
      redirect("/missions?handoff=denied");
    }

    const artifactId = getFormString(formData, "artifactId");
    const targetAction = getFormString(formData, "targetAction");

    if (!artifactId || !["reviewed", "shared", "exported"].includes(targetAction)) {
      redirect("/missions?handoff=error");
    }

    const supabase = await createServerSupabaseClient();
    const outputResult = await supabase
      .from("drone_processing_outputs")
      .select("id, org_id, job_id, kind, status, metadata")
      .eq("org_id", refreshedAccess.org.id)
      .eq("id", artifactId)
      .maybeSingle();

    const output = outputResult.data as
      | { id: string; org_id: string; job_id: string; kind: string; status: string; metadata: Record<string, unknown> | null }
      | null;

    if (!output?.id) {
      redirect("/missions?handoff=missing-artifact");
    }

    if (output.status !== "ready") {
      redirect("/missions?handoff=not-ready");
    }

    const currentHandoff = getArtifactHandoff((output.metadata as Record<string, never> | null) ?? {});
    const actorEmail = refreshedAccess.user.email ?? null;
    const now = new Date().toISOString();
    const artifactLabel = typeof output.metadata?.name === "string" && output.metadata.name.trim().length > 0
      ? output.metadata.name
      : output.kind.replaceAll("_", " ");

    const nextMetadata = updateArtifactHandoffMetadata((output.metadata as Record<string, never> | null) ?? {}, {
      reviewedAt: currentHandoff.reviewedAt ?? now,
      reviewedByEmail: currentHandoff.reviewedByEmail ?? actorEmail,
      sharedAt: targetAction === "shared" || targetAction === "exported" ? currentHandoff.sharedAt ?? now : undefined,
      sharedByEmail:
        targetAction === "shared" || targetAction === "exported"
          ? currentHandoff.sharedByEmail ?? actorEmail
          : undefined,
      exportedAt: targetAction === "exported" ? currentHandoff.exportedAt ?? now : undefined,
      exportedByEmail: targetAction === "exported" ? currentHandoff.exportedByEmail ?? actorEmail : undefined,
      note:
        targetAction === "exported"
          ? "Final export/delivery checkpoint recorded from the workspace handoff queue."
          : targetAction === "shared"
            ? "Artifact share checkpoint recorded from the workspace handoff queue."
            : "Artifact reviewed from the workspace handoff queue.",
    });

    try {
      await updateProcessingOutput(output.id, {
        metadata: nextMetadata,
      });

      await insertJobEvent({
        org_id: refreshedAccess.org.id,
        job_id: output.job_id,
        event_type:
          targetAction === "reviewed"
            ? "artifact.reviewed"
            : targetAction === "shared"
              ? "artifact.shared"
              : "artifact.exported",
        payload: {
          title:
            targetAction === "reviewed"
              ? "Artifact reviewed"
              : targetAction === "shared"
                ? "Artifact shared"
                : "Artifact exported",
          detail:
            targetAction === "reviewed"
              ? `${artifactLabel} was marked reviewed from the workspace handoff queue.`
              : targetAction === "shared"
                ? `${artifactLabel} was marked shared from the workspace handoff queue.`
                : `${artifactLabel} was marked exported from the workspace handoff queue.`,
        },
      });
    } catch {
      redirect("/missions?handoff=error");
    }

    redirect(`/missions?handoff=${targetAction}`);
  }

  async function advanceWorkspaceProvingJob(formData: FormData) {
    "use server";

    const refreshedAccess = await getDroneOpsAccess();

    if (!refreshedAccess.user) {
      redirect("/sign-in");
    }

    if (!refreshedAccess.org?.id || !refreshedAccess.hasMembership || !refreshedAccess.hasActiveEntitlement) {
      redirect("/dashboard");
    }

    if (refreshedAccess.role === "viewer") {
      redirect("/missions?proving=denied");
    }

    const jobId = getFormString(formData, "jobId");
    if (!jobId) {
      redirect("/missions?proving=missing-job");
    }

    const refreshedDetail = await getJobDetail(refreshedAccess, jobId);
    if (!refreshedDetail) {
      redirect("/missions?proving=missing-job");
    }

    if (!isManualProvingJobDetail(refreshedDetail)) {
      redirect("/missions?proving=not-proving");
    }

    try {
      const result = await advanceManualProvingJob({
        orgId: refreshedAccess.org.id,
        detail: refreshedDetail,
      });

      redirect(`/missions?proving=${result}`);
    } catch {
      redirect("/missions?proving=error");
    }
  }

  async function saveWorkspaceHandoffNote(formData: FormData) {
    "use server";

    const refreshedAccess = await getDroneOpsAccess();

    if (!refreshedAccess.user) {
      redirect("/sign-in");
    }

    if (!refreshedAccess.org?.id || !refreshedAccess.hasMembership || !refreshedAccess.hasActiveEntitlement) {
      redirect("/dashboard");
    }

    if (refreshedAccess.role === "viewer") {
      redirect("/missions?handoff=denied");
    }

    const artifactId = getFormString(formData, "artifactId");
    if (!artifactId) {
      redirect("/missions?handoff=error");
    }

    const supabase = await createServerSupabaseClient();
    const outputResult = await supabase
      .from("drone_processing_outputs")
      .select("id, org_id, job_id, kind, metadata")
      .eq("org_id", refreshedAccess.org.id)
      .eq("id", artifactId)
      .maybeSingle();

    const output = outputResult.data as
      | { id: string; org_id: string; job_id: string; kind: string; metadata: Record<string, unknown> | null }
      | null;

    if (!output?.id) {
      redirect("/missions?handoff=missing-artifact");
    }

    const noteValue = getFormString(formData, "handoffNote");
    const nextActionValue = getFormString(formData, "handoffNextAction");
    const handoffNote = noteValue || null;
    const handoffNextAction = nextActionValue || null;
    const artifactLabel = typeof output.metadata?.name === "string" && output.metadata.name.trim().length > 0
      ? output.metadata.name
      : output.kind.replaceAll("_", " ");

    const nextMetadata = updateArtifactHandoffMetadata((output.metadata as Record<string, never> | null) ?? {}, {
      note: handoffNote,
      nextAction: handoffNextAction,
    });

    try {
      await updateProcessingOutput(output.id, {
        metadata: nextMetadata,
      });

      await insertJobEvent({
        org_id: refreshedAccess.org.id,
        job_id: output.job_id,
        event_type: "artifact.note.updated",
        payload: {
          title: "Artifact handoff note updated",
          detail: handoffNote
            ? `${artifactLabel} handoff note updated from the workspace queue: ${handoffNote}`
            : `${artifactLabel} handoff note was cleared from the workspace queue.`,
        },
      });
    } catch {
      redirect("/missions?handoff=error");
    }

    redirect("/missions?handoff=note-saved");
  }

  const { snapshot, source } = await getMissionWorkspaceSnapshot(access);
  const resolvedSearchParams = await searchParams;
  const notice = getWorkspaceNotice({
    create: resolvedSearchParams.create,
    handoff: resolvedSearchParams.handoff,
    proving: resolvedSearchParams.proving,
  });

  return (
    <MissionWorkspace
      snapshot={snapshot}
      source={source}
      canManageOperations={access.role !== "viewer"}
      createMissionAction={createMissionDraft}
      bootstrapLiveWorkspaceAction={bootstrapLiveWorkspace}
      advanceArtifactHandoffAction={advanceArtifactHandoff}
      advanceWorkspaceProvingJobAction={advanceWorkspaceProvingJob}
      saveWorkspaceHandoffNoteAction={saveWorkspaceHandoffNote}
      notice={notice}
    />
  );
}
