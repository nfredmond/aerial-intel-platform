import Link from "next/link";
import { redirect } from "next/navigation";

import { BlockedAccessView } from "@/app/dashboard/blocked-access-view";
import { SignOutForm } from "@/app/dashboard/sign-out-form";
import { canPerformDroneOpsAction } from "@/lib/auth/actions";
import { getDroneOpsAccess } from "@/lib/auth/drone-ops-access";
import {
  selectEntitlementsForOrg,
  selectMembershipsForOrg,
  selectRecentEventsForOrg,
  selectRecentJobsForOrg,
  type EntitlementAdminRow,
  type MembershipAdminRow,
  type ProcessingJobAdminRow,
  type ProcessingJobEventAdminRow,
} from "@/lib/supabase/admin";
import { formatDateTime } from "@/lib/ui/datetime";
import { statusPillClassName, type Tone } from "@/lib/ui/tones";

export const dynamic = "force-dynamic";

function roleTone(role: string): Tone {
  switch (role) {
    case "owner":
      return "success";
    case "admin":
      return "info";
    case "analyst":
      return "neutral";
    case "viewer":
      return "warning";
    default:
      return "neutral";
  }
}

function entitlementTone(status: string): Tone {
  switch (status) {
    case "active":
      return "success";
    case "past_due":
      return "warning";
    case "pending":
      return "info";
    case "canceled":
    case "refunded":
      return "danger";
    default:
      return "neutral";
  }
}

function jobStatusTone(status: string): Tone {
  switch (status) {
    case "succeeded":
      return "success";
    case "running":
    case "pending":
      return "info";
    case "failed":
    case "canceled":
      return "danger";
    default:
      return "warning";
  }
}

function MembershipsPanel({ rows }: { rows: MembershipAdminRow[] }) {
  if (rows.length === 0) {
    return <p className="muted">No memberships on record.</p>;
  }
  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead>
          <tr>
            <th>User ID</th>
            <th>Role</th>
            <th>Member since</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.org_id}:${row.user_id}`}>
              <td className="admin-table__mono">{row.user_id}</td>
              <td>
                <span className={statusPillClassName(roleTone(row.role))}>{row.role}</span>
              </td>
              <td>{formatDateTime(row.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EntitlementsPanel({ rows }: { rows: EntitlementAdminRow[] }) {
  if (rows.length === 0) {
    return <p className="muted">No entitlements on record for this org.</p>;
  }
  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead>
          <tr>
            <th>Product</th>
            <th>Tier</th>
            <th>Status</th>
            <th>Source</th>
            <th>External ref</th>
            <th>Updated</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>{row.product_id}</td>
              <td>{row.tier_id}</td>
              <td>
                <span className={statusPillClassName(entitlementTone(row.status))}>{row.status}</span>
              </td>
              <td>{row.source}</td>
              <td className="admin-table__mono">{row.external_reference ?? "—"}</td>
              <td>{formatDateTime(row.updated_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function JobsPanel({ rows }: { rows: ProcessingJobAdminRow[] }) {
  if (rows.length === 0) {
    return <p className="muted">No jobs recorded yet.</p>;
  }
  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead>
          <tr>
            <th>Job</th>
            <th>Engine</th>
            <th>Status</th>
            <th>Stage</th>
            <th>Progress</th>
            <th>Mission</th>
            <th>Updated</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>
                <Link href={`/jobs/${row.id}`} className="admin-table__link">
                  {row.id.slice(0, 8)}…
                </Link>
              </td>
              <td>{row.engine}</td>
              <td>
                <span className={statusPillClassName(jobStatusTone(row.status))}>{row.status}</span>
              </td>
              <td>{row.stage ?? "—"}</td>
              <td>{row.progress === null ? "—" : `${Math.round(row.progress * 100)}%`}</td>
              <td className="admin-table__mono">{row.mission_id ? `${row.mission_id.slice(0, 8)}…` : "—"}</td>
              <td>{formatDateTime(row.updated_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EventsPanel({ rows }: { rows: ProcessingJobEventAdminRow[] }) {
  if (rows.length === 0) {
    return <p className="muted">No events recorded yet.</p>;
  }
  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead>
          <tr>
            <th>When</th>
            <th>Event</th>
            <th>Job</th>
            <th>Detail</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const payload = (row.payload ?? {}) as Record<string, unknown>;
            const detail =
              (typeof payload.detail === "string" && payload.detail) ||
              (typeof payload.title === "string" && payload.title) ||
              "";
            return (
              <tr key={row.id}>
                <td className="admin-table__mono">{formatDateTime(row.created_at)}</td>
                <td>{row.event_type}</td>
                <td>
                  <Link href={`/jobs/${row.job_id}`} className="admin-table__link">
                    {row.job_id.slice(0, 8)}…
                  </Link>
                </td>
                <td>{detail}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default async function AdminConsolePage() {
  const access = await getDroneOpsAccess();
  if (!access.user) redirect("/sign-in");

  if (!access.hasMembership || !access.hasActiveEntitlement) {
    return <BlockedAccessView access={access} />;
  }

  if (!canPerformDroneOpsAction(access, "admin.support")) {
    return (
      <main className="app-shell stack-md">
        <section className="surface stack-sm">
          <div className="stack-xs">
            <p className="eyebrow">Admin console</p>
            <h1>Access restricted</h1>
          </div>
          <p>The admin console is available to org owners and admins. Your current role is {access.role ?? "none"}.</p>
          <div className="header-actions">
            <Link href="/dashboard" className="button button-secondary">
              Back to dashboard
            </Link>
            <SignOutForm label="Sign out" variant="secondary" />
          </div>
        </section>
      </main>
    );
  }

  const orgId = access.org?.id;
  if (!orgId) {
    return (
      <main className="app-shell stack-md">
        <section className="surface stack-sm">
          <div className="stack-xs">
            <p className="eyebrow">Admin console</p>
            <h1>No org context</h1>
          </div>
          <p>This account is not linked to an org yet. Contact support to finish provisioning.</p>
        </section>
      </main>
    );
  }

  const [memberships, entitlements, jobs, events] = await Promise.all([
    selectMembershipsForOrg(orgId).catch(() => [] as MembershipAdminRow[]),
    selectEntitlementsForOrg(orgId).catch(() => [] as EntitlementAdminRow[]),
    selectRecentJobsForOrg(orgId, 20).catch(() => [] as ProcessingJobAdminRow[]),
    selectRecentEventsForOrg(orgId, 30).catch(() => [] as ProcessingJobEventAdminRow[]),
  ]);

  const activeEntitlements = entitlements.filter((row) => row.status === "active").length;
  const activeJobs = jobs.filter((row) => row.status === "pending" || row.status === "running").length;

  return (
    <main className="app-shell stack-md">
      <section className="surface section-header">
        <div className="stack-sm">
          <p className="eyebrow">Admin console</p>
          <h1>Org support triage</h1>
          <p className="muted">
            Read-only view of org-wide state for support work. Writes still happen inside the individual mission
            / job / artifact pages so audit trails stay anchored to the right record.
          </p>
        </div>
        <div className="header-actions">
          <Link href="/dashboard" className="button button-secondary">
            Back to dashboard
          </Link>
          <Link href="/missions" className="button button-secondary">
            Missions
          </Link>
          <SignOutForm label="Sign out" variant="secondary" />
        </div>
      </section>

      <section className="admin-summary">
        <div className="admin-summary__card">
          <span className="muted">Members</span>
          <strong>{memberships.length}</strong>
        </div>
        <div className="admin-summary__card">
          <span className="muted">Active entitlements</span>
          <strong>{activeEntitlements}</strong>
        </div>
        <div className="admin-summary__card">
          <span className="muted">Recent jobs</span>
          <strong>{jobs.length}</strong>
        </div>
        <div className="admin-summary__card">
          <span className="muted">Jobs in flight</span>
          <strong>{activeJobs}</strong>
        </div>
      </section>

      <section className="surface stack-sm">
        <div className="stack-xs">
          <p className="eyebrow">Team</p>
          <h2>Memberships</h2>
        </div>
        <MembershipsPanel rows={memberships} />
      </section>

      <section className="surface stack-sm">
        <div className="stack-xs">
          <p className="eyebrow">Billing</p>
          <h2>Entitlements</h2>
        </div>
        <EntitlementsPanel rows={entitlements} />
      </section>

      <section className="surface stack-sm">
        <div className="stack-xs">
          <p className="eyebrow">Compute</p>
          <h2>Recent processing jobs</h2>
        </div>
        <JobsPanel rows={jobs} />
      </section>

      <section className="surface stack-sm">
        <div className="stack-xs">
          <p className="eyebrow">Activity</p>
          <h2>Recent events</h2>
        </div>
        <EventsPanel rows={events} />
      </section>
    </main>
  );
}
