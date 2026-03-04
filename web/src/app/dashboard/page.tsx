import { redirect } from "next/navigation";

import { getDroneOpsAccess } from "@/lib/auth/drone-ops-access";

import { SignOutForm } from "./sign-out-form";

export const dynamic = "force-dynamic";

function BlockedScreen({ reason }: { reason: string | null }) {
  return (
    <main className="page-shell center-screen">
      <section className="card stack-sm">
        <h1>Access blocked</h1>
        <p>Your account is signed in, but DroneOps access is not active yet.</p>
        {reason ? <p className="muted">{reason}</p> : null}
        <p className="muted">
          If you recently purchased, contact support at support@natfordplanning.com.
        </p>
        <SignOutForm />
      </section>
    </main>
  );
}

export default async function DashboardPage() {
  const access = await getDroneOpsAccess();

  if (!access.isAuthenticated) {
    redirect("/sign-in");
  }

  if (!access.hasMembership || !access.hasActiveEntitlement) {
    return <BlockedScreen reason={access.blockedReason} />;
  }

  return (
    <main className="page-shell">
      <section className="card stack-sm">
        <h1>DroneOps Dashboard</h1>
        <p className="muted">Authenticated and entitled for product_id=&quot;drone-ops&quot;.</p>

        <dl className="stack-xs">
          <div>
            <dt>User</dt>
            <dd>{access.user?.email}</dd>
          </div>
          <div>
            <dt>Organization</dt>
            <dd>{access.org?.name}</dd>
          </div>
          <div>
            <dt>Role</dt>
            <dd>{access.role}</dd>
          </div>
          <div>
            <dt>Tier</dt>
            <dd>{access.entitlement?.tier_id}</dd>
          </div>
        </dl>

        <SignOutForm />
      </section>
    </main>
  );
}
