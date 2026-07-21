import Link from "next/link";
import { redirect } from "next/navigation";

import {
  insertMembership,
  insertOrgEvent,
  selectInvitationByToken,
  selectMembershipByOrgUser,
  updateInvitationStatus,
} from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Params = { token: string };
type Search = { accepted?: string; error?: string };

const TOKEN_SHAPE = /^[A-Za-z0-9_-]{16,128}$/;

function isExpired(expiresAt: string): boolean {
  const expiry = Date.parse(expiresAt);
  if (Number.isNaN(expiry)) return false;
  return expiry < Date.now();
}

function Frame({
  heading,
  children,
  variant = "info",
}: {
  heading: string;
  children: React.ReactNode;
  variant?: "info" | "success" | "error";
}) {
  return (
    <main className="app-shell stack-md">
      <section className="surface stack-sm">
        <div className="stack-xs">
          <p className="eyebrow">Invitation · {variant}</p>
          <h1>{heading}</h1>
        </div>
        {children}
        <div className="header-actions">
          <Link href="/dashboard" className="button button-secondary">
            Dashboard
          </Link>
          <Link href="/sign-in" className="button button-secondary">
            Sign in
          </Link>
        </div>
      </section>
    </main>
  );
}

const ACTION_ERROR_MESSAGES: Record<string, string> = {
  "not-pending": "This invitation can no longer be accepted. Contact your org admin for a new one.",
  expired: "This invitation is past its expiration date. Ask your org admin to send a new one.",
  "email-mismatch": "This invitation was sent to a different email address.",
  "already-member": "This account already has a membership for this organization.",
  failed: "Membership could not be created. Ask your org admin to send a fresh invitation.",
};

export default async function AcceptInvitationPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<Search>;
}) {
  const { token } = await params;
  const { accepted, error } = await searchParams;

  if (!TOKEN_SHAPE.test(token)) {
    return (
      <Frame heading="Invitation not found" variant="error">
        <p>This invitation link is invalid or has been removed.</p>
      </Frame>
    );
  }

  const invitation = await selectInvitationByToken(token).catch(() => null);
  if (!invitation) {
    return (
      <Frame heading="Invitation not found" variant="error">
        <p>This invitation link is invalid or has been removed.</p>
      </Frame>
    );
  }

  if (accepted === "1" && invitation.status === "accepted") {
    return (
      <Frame heading="Invitation accepted" variant="success">
        <p>
          You now have the <strong>{invitation.role}</strong> role. Head to your dashboard to get
          started.
        </p>
      </Frame>
    );
  }

  if (error && ACTION_ERROR_MESSAGES[error]) {
    return (
      <Frame heading="Invitation could not be accepted" variant="error">
        <p>{ACTION_ERROR_MESSAGES[error]}</p>
      </Frame>
    );
  }

  if (invitation.status !== "pending") {
    return (
      <Frame heading={`Invitation already ${invitation.status}`} variant="info">
        <p>This invitation can no longer be accepted. Contact your org admin for a new one.</p>
      </Frame>
    );
  }

  if (isExpired(invitation.expires_at)) {
    await updateInvitationStatus(invitation.id, invitation.org_id, { status: "expired" }).catch(
      () => undefined,
    );
    return (
      <Frame heading="Invitation expired" variant="error">
        <p>This invitation is past its expiration date. Ask your org admin to send a new one.</p>
      </Frame>
    );
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/sign-in?next=${encodeURIComponent(`/invitations/${token}`)}`);
  }

  if (user.email?.toLowerCase() !== invitation.email.toLowerCase()) {
    return (
      <Frame heading="Email does not match" variant="error">
        <p>
          This invitation was sent to <code>{invitation.email}</code>. Sign in with that email to
          accept it.
        </p>
      </Frame>
    );
  }

  const existingMembership = await selectMembershipByOrgUser(invitation.org_id, user.id).catch(
    () => null,
  );
  if (existingMembership) {
    return (
      <Frame heading="Membership already exists" variant="info">
        <p>
          This account already has a membership for this organization. Ask your org admin to make
          role or status changes explicitly.
        </p>
      </Frame>
    );
  }

  // Acceptance is an explicit POST, never a side effect of rendering this
  // page: link prefetchers and email scanners hit invitation URLs with GETs,
  // and a GET must not create a membership.
  async function acceptInvitation() {
    "use server";

    const fail = (code: string): never =>
      redirect(`/invitations/${token}?error=${encodeURIComponent(code)}`);

    const freshInvitation = await selectInvitationByToken(token).catch(() => null);
    if (!freshInvitation || freshInvitation.status !== "pending") {
      fail("not-pending");
      return;
    }
    if (isExpired(freshInvitation.expires_at)) {
      await updateInvitationStatus(freshInvitation.id, freshInvitation.org_id, {
        status: "expired",
      }).catch(() => undefined);
      fail("expired");
      return;
    }

    const freshSupabase = await createServerSupabaseClient();
    const {
      data: { user: freshUser },
    } = await freshSupabase.auth.getUser();
    if (!freshUser) {
      redirect(`/sign-in?next=${encodeURIComponent(`/invitations/${token}`)}`);
    }
    if (freshUser.email?.toLowerCase() !== freshInvitation.email.toLowerCase()) {
      fail("email-mismatch");
      return;
    }

    const existing = await selectMembershipByOrgUser(freshInvitation.org_id, freshUser.id).catch(
      () => null,
    );
    if (existing) {
      fail("already-member");
      return;
    }

    const membership = await insertMembership({
      org_id: freshInvitation.org_id,
      user_id: freshUser.id,
      role: freshInvitation.role,
      status: "active",
    }).catch(() => null);
    if (!membership) {
      fail("failed");
      return;
    }

    await updateInvitationStatus(freshInvitation.id, freshInvitation.org_id, {
      status: "accepted",
      accepted_at: new Date().toISOString(),
      accepted_by: freshUser.id,
    });
    await insertOrgEvent({
      org_id: freshInvitation.org_id,
      actor_user_id: freshUser.id,
      event_type: "org.member.invitation_accepted",
      payload: {
        invitation_id: freshInvitation.id,
        email: freshInvitation.email,
        role: freshInvitation.role,
      },
    }).catch(() => undefined);

    redirect(`/invitations/${token}?accepted=1`);
  }

  return (
    <Frame heading="Accept this invitation?" variant="info">
      <p>
        You are signed in as <code>{invitation.email}</code> and have been invited with the{" "}
        <strong>{invitation.role}</strong> role. Accepting creates your membership in this
        organization.
      </p>
      <form action={acceptInvitation}>
        <button type="submit" className="button button-primary">
          Accept invitation
        </button>
      </form>
    </Frame>
  );
}
