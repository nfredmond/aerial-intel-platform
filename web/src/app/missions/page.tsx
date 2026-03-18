import { redirect } from "next/navigation";

import { BlockedAccessView } from "@/app/dashboard/blocked-access-view";
import { getDroneOpsAccess } from "@/lib/auth/drone-ops-access";
import { getArtifactHandoff, updateArtifactHandoffMetadata } from "@/lib/artifact-handoff";
import { getMissionWorkspaceSnapshot } from "@/lib/missions/workspace-data";
import { normalizeSlug } from "@/lib/slug";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { insertJobEvent, insertMission, insertMissionVersion, updateProcessingOutput } from "@/lib/supabase/admin";

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

function getWorkspaceNotice(states: { create?: string; handoff?: string }) {
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
      return null;
  }
}

export default async function MissionsPage({
  searchParams,
}: {
  searchParams: Promise<{ create?: string; handoff?: string }>;
}) {
  const access = await getDroneOpsAccess();

  if (!access.isAuthenticated) {
    redirect("/sign-in");
  }

  if (!access.hasMembership || !access.hasActiveEntitlement) {
    return <BlockedAccessView access={access} />;
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
  });

  return (
    <MissionWorkspace
      snapshot={snapshot}
      source={source}
      canManageOperations={access.role !== "viewer"}
      createMissionAction={createMissionDraft}
      advanceArtifactHandoffAction={advanceArtifactHandoff}
      saveWorkspaceHandoffNoteAction={saveWorkspaceHandoffNote}
      notice={notice}
    />
  );
}
