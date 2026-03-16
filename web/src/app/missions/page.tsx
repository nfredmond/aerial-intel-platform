import { redirect } from "next/navigation";

import { BlockedAccessView } from "@/app/dashboard/blocked-access-view";
import { getDroneOpsAccess } from "@/lib/auth/drone-ops-access";

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

  return <MissionWorkspace access={access} />;
}
