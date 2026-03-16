import Link from "next/link";

import type { DroneOpsAccessResult } from "@/lib/auth/drone-ops-access";
import {
  formatEntitlementTier,
  getDashboardNextActions,
} from "@/lib/auth/access-insights";
import { DRONE_OPS_SUPPORT_EMAIL } from "@/lib/support";

import { SignOutForm } from "./sign-out-form";

type DashboardOverviewProps = {
  access: DroneOpsAccessResult;
};

function formatTimestamp(value: string | null | undefined) {
  if (!value) {
    return "Unavailable";
  }

  const timestamp = new Date(value);

  if (Number.isNaN(timestamp.getTime())) {
    return "Unavailable";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(timestamp);
}

export function DashboardOverview({ access }: DashboardOverviewProps) {
  const nextActions = getDashboardNextActions({
    role: access.role,
    tierId: access.entitlement?.tier_id,
  });

  return (
    <main className="app-shell">
      <section className="surface section-header">
        <div className="stack-sm">
          <p className="eyebrow">Aerial Operations OS</p>
          <h1>Mission dashboard</h1>
          <p className="muted">
            Your account is authenticated and has an active DroneOps entitlement.
            Use the mission workspace to move beyond auth-only access into planning,
            ingest, processing, and deliverable review.
          </p>
        </div>

        <div className="header-actions">
          <span className="status-pill status-pill--success">Access active</span>
          <Link href="/missions" className="button button-secondary">
            Open mission workspace
          </Link>
          <SignOutForm label="Sign out" variant="secondary" />
        </div>
      </section>

      <section className="grid-cards">
        <article className="surface info-card stack-sm">
          <h2>Account context</h2>
          <dl className="kv-grid">
            <div className="kv-row">
              <dt>Signed-in user</dt>
              <dd>{access.user?.email ?? "Unknown"}</dd>
            </div>
            <div className="kv-row">
              <dt>Organization</dt>
              <dd>{access.org?.name ?? "Unknown"}</dd>
            </div>
            <div className="kv-row">
              <dt>Role</dt>
              <dd>{access.role ?? "Unknown"}</dd>
            </div>
          </dl>
        </article>

        <article className="surface info-card stack-sm">
          <h2>Entitlement status</h2>
          <dl className="kv-grid">
            <div className="kv-row">
              <dt>Product</dt>
              <dd>drone-ops</dd>
            </div>
            <div className="kv-row">
              <dt>Tier</dt>
              <dd>{formatEntitlementTier(access.entitlement?.tier_id)}</dd>
            </div>
            <div className="kv-row">
              <dt>Source</dt>
              <dd>{access.entitlement?.source ?? "Unavailable"}</dd>
            </div>
            <div className="kv-row">
              <dt>Last updated</dt>
              <dd>{formatTimestamp(access.entitlement?.updated_at)}</dd>
            </div>
          </dl>
        </article>

        <article className="surface info-card stack-sm">
          <h2>Recommended next actions</h2>
          <ol className="stack-xs action-list">
            {nextActions.map((action) => (
              <li key={action}>{action}</li>
            ))}
          </ol>
        </article>

        <article className="surface info-card stack-sm">
          <h2>Need account help?</h2>
          <p className="muted">
            For provisioning, billing, or entitlement changes, contact {" "}
            <a href={`mailto:${DRONE_OPS_SUPPORT_EMAIL}`}>{DRONE_OPS_SUPPORT_EMAIL}</a>.
          </p>
          <p className="muted">
            Include your organization name and signed-in email to speed up support.
          </p>
        </article>
      </section>
    </main>
  );
}
