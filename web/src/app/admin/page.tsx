import Link from "next/link";
import { redirect } from "next/navigation";

import { BlockedAccessView } from "@/app/dashboard/blocked-access-view";
import { SignOutForm } from "@/app/dashboard/sign-out-form";
import { canPerformDroneOpsAction } from "@/lib/auth/actions";
import { getDroneOpsAccess } from "@/lib/auth/drone-ops-access";
import {
  selectEntitlementsForOrg,
  selectMembershipsForOrg,
  selectNodeOdmJobsForOrg,
  selectRecentEventsForOrg,
  selectRecentJobsForOrg,
  selectShareLinksNearExpiry,
  selectStaleInFlightJobsForOrg,
  selectTopShareLinksByUsage,
  type ArtifactShareLinkRow,
  type EntitlementAdminRow,
  type MembershipAdminRow,
  type NodeOdmJobAdminRow,
  type ProcessingJobAdminRow,
  type ProcessingJobEventAdminRow,
  type StaleInFlightJobAdminRow,
} from "@/lib/supabase/admin";
import { shareLinkStatus } from "@/lib/sharing";
import { formatDateTime, formatRelativeTime } from "@/lib/ui/datetime";
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

function nodeOdmStatusTone(statusName: string): Tone {
  switch (statusName) {
    case "completed":
      return "success";
    case "running":
    case "processing":
      return "info";
    case "queued":
      return "warning";
    case "failed":
    case "canceled":
      return "danger";
    default:
      return "neutral";
  }
}

function shareLinkStatusTone(status: ReturnType<typeof shareLinkStatus>): Tone {
  switch (status) {
    case "active":
      return "success";
    case "revoked":
      return "danger";
    case "expired":
      return "warning";
    case "exhausted":
      return "warning";
    default:
      return "neutral";
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

function NodeOdmJobsPanel({ rows }: { rows: NodeOdmJobAdminRow[] }) {
  if (rows.length === 0) {
    return <p className="muted">No NodeODM tasks in flight.</p>;
  }
  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead>
          <tr>
            <th>Job</th>
            <th>Task UUID</th>
            <th>NodeODM status</th>
            <th>Progress</th>
            <th>Mission</th>
            <th>Last polled</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const summary = (row.output_summary ?? {}) as { nodeodm?: Record<string, unknown> };
            const nodeodm = summary.nodeodm ?? {};
            const taskUuid = typeof nodeodm.taskUuid === "string" ? nodeodm.taskUuid : null;
            const statusName =
              typeof nodeodm.statusName === "string" && nodeodm.statusName.length > 0
                ? nodeodm.statusName
                : row.status;
            const progressValue = typeof nodeodm.progress === "number" ? nodeodm.progress : null;
            const lastPolledAt =
              typeof nodeodm.lastPolledAt === "string" ? nodeodm.lastPolledAt : null;
            return (
              <tr key={row.id}>
                <td>
                  <Link href={`/jobs/${row.id}`} className="admin-table__link">
                    {row.id.slice(0, 8)}…
                  </Link>
                </td>
                <td className="admin-table__mono">{taskUuid ? `${taskUuid.slice(0, 8)}…` : "—"}</td>
                <td>
                  <span className={statusPillClassName(nodeOdmStatusTone(statusName))}>{statusName}</span>
                </td>
                <td>{progressValue === null ? "—" : `${Math.round(progressValue)}%`}</td>
                <td className="admin-table__mono">
                  {row.mission_id ? `${row.mission_id.slice(0, 8)}…` : "—"}
                </td>
                <td>{lastPolledAt ? formatDateTime(lastPolledAt) : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function StaleJobsPanel({ rows }: { rows: StaleInFlightJobAdminRow[] }) {
  if (rows.length === 0) {
    return <p className="muted">No in-flight jobs stuck for more than an hour.</p>;
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
            <th>Stale for</th>
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
              <td className="admin-table__mono">
                {row.mission_id ? `${row.mission_id.slice(0, 8)}…` : "—"}
              </td>
              <td>{formatRelativeTime(row.updated_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TopShareLinksPanel({ rows }: { rows: ArtifactShareLinkRow[] }) {
  if (rows.length === 0) {
    return <p className="muted">No share links issued yet.</p>;
  }
  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead>
          <tr>
            <th>Token</th>
            <th>Artifact</th>
            <th>Uses</th>
            <th>Last used</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const status = shareLinkStatus(row);
            return (
              <tr key={row.id}>
                <td className="admin-table__mono">
                  <Link href={`/s/${row.token}`} className="admin-table__link">
                    {row.token.slice(0, 10)}…
                  </Link>
                </td>
                <td className="admin-table__mono">
                  <Link href={`/artifacts/${row.artifact_id}`} className="admin-table__link">
                    {row.artifact_id.slice(0, 8)}…
                  </Link>
                </td>
                <td>{row.use_count}</td>
                <td>{row.last_used_at ? formatDateTime(row.last_used_at) : "—"}</td>
                <td>
                  <span className={statusPillClassName(shareLinkStatusTone(status))}>{status}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ExpiringShareLinksPanel({ rows }: { rows: ArtifactShareLinkRow[] }) {
  if (rows.length === 0) {
    return <p className="muted">No active share links expiring in the next 7 days.</p>;
  }
  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead>
          <tr>
            <th>Token</th>
            <th>Artifact</th>
            <th>Expires</th>
            <th>Uses</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const status = shareLinkStatus(row);
            return (
              <tr key={row.id}>
                <td className="admin-table__mono">
                  <Link href={`/s/${row.token}`} className="admin-table__link">
                    {row.token.slice(0, 10)}…
                  </Link>
                </td>
                <td className="admin-table__mono">
                  <Link href={`/artifacts/${row.artifact_id}`} className="admin-table__link">
                    {row.artifact_id.slice(0, 8)}…
                  </Link>
                </td>
                <td>{row.expires_at ? formatDateTime(row.expires_at) : "—"}</td>
                <td>
                  {row.use_count}
                  {row.max_uses !== null ? ` / ${row.max_uses}` : ""}
                </td>
                <td>
                  <span className={statusPillClassName(shareLinkStatusTone(status))}>{status}</span>
                </td>
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

  const [
    memberships,
    entitlements,
    jobs,
    events,
    topShareLinks,
    expiringShareLinks,
    nodeOdmJobs,
    staleJobs,
  ] = await Promise.all([
    selectMembershipsForOrg(orgId).catch(() => [] as MembershipAdminRow[]),
    selectEntitlementsForOrg(orgId).catch(() => [] as EntitlementAdminRow[]),
    selectRecentJobsForOrg(orgId, 20).catch(() => [] as ProcessingJobAdminRow[]),
    selectRecentEventsForOrg(orgId, 30).catch(() => [] as ProcessingJobEventAdminRow[]),
    selectTopShareLinksByUsage(orgId, 10).catch(() => [] as ArtifactShareLinkRow[]),
    selectShareLinksNearExpiry(orgId, 7).catch(() => [] as ArtifactShareLinkRow[]),
    selectNodeOdmJobsForOrg(orgId, 20).catch(() => [] as NodeOdmJobAdminRow[]),
    selectStaleInFlightJobsForOrg(orgId, { minutesStale: 60, limit: 20 }).catch(
      () => [] as StaleInFlightJobAdminRow[],
    ),
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
        <div className="admin-summary__card">
          <span className="muted">NodeODM active</span>
          <strong>{nodeOdmJobs.length}</strong>
        </div>
        <div className="admin-summary__card">
          <span className="muted">Stuck &gt; 1h</span>
          <strong>{staleJobs.length}</strong>
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

      <section className="surface stack-sm">
        <div className="stack-xs">
          <p className="eyebrow">Compute</p>
          <h2>NodeODM tasks in flight</h2>
          <p className="muted">
            Jobs with a NodeODM task cursor. Updated by the internal poll cron — if a job sits here
            without advancing, the cron is stuck or the NodeODM container is unreachable.
          </p>
        </div>
        <NodeOdmJobsPanel rows={nodeOdmJobs} />
      </section>

      <section className="surface stack-sm">
        <div className="stack-xs">
          <p className="eyebrow">Compute</p>
          <h2>Stuck in-flight jobs</h2>
          <p className="muted">
            Jobs in pending, queued, processing, or awaiting-output-import with no update for over
            an hour. Healthy jobs are updated by the cron or adapter every few minutes.
          </p>
        </div>
        <StaleJobsPanel rows={staleJobs} />
      </section>

      <section className="surface stack-sm">
        <div className="stack-xs">
          <p className="eyebrow">Sharing</p>
          <h2>Top share links by usage</h2>
        </div>
        <TopShareLinksPanel rows={topShareLinks} />
      </section>

      <section className="surface stack-sm">
        <div className="stack-xs">
          <p className="eyebrow">Sharing</p>
          <h2>Share links expiring soon</h2>
        </div>
        <ExpiringShareLinksPanel rows={expiringShareLinks} />
      </section>
    </main>
  );
}
