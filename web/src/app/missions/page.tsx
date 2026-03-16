import { redirect } from "next/navigation";

import { BlockedAccessView } from "@/app/dashboard/blocked-access-view";
import { getDroneOpsAccess } from "@/lib/auth/drone-ops-access";
import { getMissionWorkspaceSnapshot } from "@/lib/missions/workspace-data";
import { normalizeSlug } from "@/lib/slug";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { insertMission, insertMissionVersion } from "@/lib/supabase/admin";

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

function getCreateNotice(createState: string | undefined) {
  switch (createState) {
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
      return null;
  }
}

export default async function MissionsPage({
  searchParams,
}: {
  searchParams: Promise<{ create?: string }>;
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

  const { snapshot, source } = await getMissionWorkspaceSnapshot(access);
  const resolvedSearchParams = await searchParams;
  const notice = getCreateNotice(resolvedSearchParams.create);

  return (
    <MissionWorkspace
      snapshot={snapshot}
      source={source}
      canManageOperations={access.role !== "viewer"}
      createMissionAction={createMissionDraft}
      notice={notice}
    />
  );
}
