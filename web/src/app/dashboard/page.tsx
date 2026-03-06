import { redirect } from "next/navigation";

import { getDroneOpsAccess } from "@/lib/auth/drone-ops-access";

import { BlockedAccessView } from "./blocked-access-view";
import { DashboardOverview } from "./dashboard-overview";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const access = await getDroneOpsAccess();

  if (!access.isAuthenticated) {
    redirect("/sign-in");
  }

  if (!access.hasMembership || !access.hasActiveEntitlement) {
    return <BlockedAccessView access={access} />;
  }

  return <DashboardOverview access={access} />;
}
