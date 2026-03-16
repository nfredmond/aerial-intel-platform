import { redirect } from "next/navigation";

import { BlockedAccessView } from "@/app/dashboard/blocked-access-view";
import { getDroneOpsAccess } from "@/lib/auth/drone-ops-access";
import { getMissionWorkspaceSnapshot } from "@/lib/missions/workspace-data";

import { MissionWorkspace } from "./mission-workspace";

export const dynamic = "force-dynamic";

export default async function MissionsPage() {
  const access = await getDroneOpsAccess();

  if (!access.isAuthenticated) {
    redirect("/sign-in");
  }

  if (!access.hasMembership || !access.hasActiveEntitlement) {
    return <BlockedAccessView access={access} />;
  }

  const { snapshot, source } = await getMissionWorkspaceSnapshot(access);

  return <MissionWorkspace snapshot={snapshot} source={source} />;
}
