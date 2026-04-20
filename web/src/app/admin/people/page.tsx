import Link from "next/link";
import { redirect } from "next/navigation";

import { BlockedAccessView } from "@/app/dashboard/blocked-access-view";
import { SignOutForm } from "@/app/dashboard/sign-out-form";
import { canPerformDroneOpsAction } from "@/lib/auth/actions";
import { getDroneOpsAccess } from "@/lib/auth/drone-ops-access";
import {
  selectInvitationsForOrg,
  selectMembershipsForOrg,
  type InvitationRow,
  type MembershipAdminRow,
} from "@/lib/supabase/admin";
import { formatDateTime, formatRelativeTime } from "@/lib/ui/datetime";
import { statusPillClassName, type Tone } from "@/lib/ui/tones";

import { InviteMemberForm } from "./invite-form";
import {
  ReactivateMemberForm,
  RevokeInvitationForm,
  SuspendMemberForm,
} from "./member-status-form";

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

function membershipStatusTone(status: string): Tone {
  return status === "active" ? "success" : "danger";
}

function invitationStatusTone(status: string): Tone {
  switch (status) {
    case "pending":
      return "info";
    case "accepted":
      return "success";
    case "revoked":
      return "danger";
    case "expired":
      return "warning";
    default:
      return "neutral";
  }
}

function MembersPanel({
  rows,
  currentUserId,
}: {
  rows: MembershipAdminRow[];
  currentUserId: string;
}) {
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
            <th>Status</th>
            <th>Member since</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const isSelf = row.user_id === currentUserId;
            return (
              <tr key={`${row.org_id}:${row.user_id}`}>
                <td className="admin-table__mono">
                  {row.user_id}
                  {isSelf ? " (you)" : ""}
                </td>
                <td>
                  <span className={statusPillClassName(roleTone(row.role))}>{row.role}</span>
                </td>
                <td>
                  <span className={statusPillClassName(membershipStatusTone(row.status))}>
                    {row.status}
                  </span>
                </td>
                <td>{formatDateTime(row.created_at)}</td>
                <td>
                  {isSelf ? (
                    <span className="muted">—</span>
                  ) : row.status === "active" ? (
                    <SuspendMemberForm userId={row.user_id} />
                  ) : (
                    <ReactivateMemberForm userId={row.user_id} />
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function InvitationsPanel({ rows }: { rows: InvitationRow[] }) {
  if (rows.length === 0) {
    return <p className="muted">No invitations sent yet.</p>;
  }
  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead>
          <tr>
            <th>Email</th>
            <th>Role</th>
            <th>Status</th>
            <th>Created</th>
            <th>Expires</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>{row.email}</td>
              <td>
                <span className={statusPillClassName(roleTone(row.role))}>{row.role}</span>
              </td>
              <td>
                <span className={statusPillClassName(invitationStatusTone(row.status))}>
                  {row.status}
                </span>
              </td>
              <td>{formatRelativeTime(row.created_at)}</td>
              <td>{formatDateTime(row.expires_at)}</td>
              <td>
                {row.status === "pending" ? (
                  <RevokeInvitationForm invitationId={row.id} />
                ) : (
                  <span className="muted">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function AdminPeoplePage() {
  const access = await getDroneOpsAccess();
  if (!access.user) redirect("/sign-in");

  if (!access.hasMembership || !access.hasActiveEntitlement) {
    return <BlockedAccessView access={access} />;
  }

  if (!canPerformDroneOpsAction(access, "members.invite")) {
    return (
      <main className="app-shell stack-md">
        <section className="surface stack-sm">
          <div className="stack-xs">
            <p className="eyebrow">Admin console</p>
            <h1>Access restricted</h1>
          </div>
          <p>
            People management is available to org owners and admins. Your current role is{" "}
            {access.role ?? "none"}.
          </p>
          <div className="header-actions">
            <Link href="/admin" className="button button-secondary">
              Back to admin
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

  const [memberships, invitations] = await Promise.all([
    selectMembershipsForOrg(orgId).catch(() => [] as MembershipAdminRow[]),
    selectInvitationsForOrg(orgId).catch(() => [] as InvitationRow[]),
  ]);

  const activeCount = memberships.filter((row) => row.status === "active").length;
  const suspendedCount = memberships.filter((row) => row.status === "suspended").length;
  const pendingInvites = invitations.filter((row) => row.status === "pending").length;

  return (
    <main className="app-shell stack-md">
      <section className="surface section-header">
        <div className="stack-sm">
          <p className="eyebrow">Admin console</p>
          <h1>People</h1>
          <p className="muted">
            Invite new teammates, suspend a seat without deleting the user, or revoke an invitation
            that was sent by mistake. Invitation URLs are copied manually — no email is sent yet.
          </p>
        </div>
        <div className="header-actions">
          <Link href="/admin" className="button button-secondary">
            Back to admin
          </Link>
          <Link href="/dashboard" className="button button-secondary">
            Dashboard
          </Link>
        </div>
      </section>

      <section className="admin-summary">
        <div className="admin-summary__card">
          <span className="muted">Active members</span>
          <strong>{activeCount}</strong>
        </div>
        <div className="admin-summary__card">
          <span className="muted">Suspended</span>
          <strong>{suspendedCount}</strong>
        </div>
        <div className="admin-summary__card">
          <span className="muted">Pending invites</span>
          <strong>{pendingInvites}</strong>
        </div>
      </section>

      <section className="surface stack-sm">
        <div className="stack-xs">
          <p className="eyebrow">Invite</p>
          <h2>Add a teammate</h2>
          <p className="muted">
            Creates a pending invitation row. Copy the returned URL and share it manually — the
            invitee signs in with that URL to claim the seat. No role change is possible from this
            form; promote/demote still runs through SQL for now.
          </p>
        </div>
        <InviteMemberForm />
      </section>

      <section className="surface stack-sm">
        <div className="stack-xs">
          <p className="eyebrow">Team</p>
          <h2>Members</h2>
        </div>
        <MembersPanel rows={memberships} currentUserId={access.user.id} />
      </section>

      <section className="surface stack-sm">
        <div className="stack-xs">
          <p className="eyebrow">Invitations</p>
          <h2>Pending + historical invitations</h2>
        </div>
        <InvitationsPanel rows={invitations} />
      </section>
    </main>
  );
}
