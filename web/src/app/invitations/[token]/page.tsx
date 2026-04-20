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

const TOKEN_SHAPE = /^[A-Za-z0-9_-]{16,128}$/;

async function isExpired(expiresAt: string): Promise<boolean> {
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

export default async function AcceptInvitationPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { token } = await params;

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

  if (invitation.status !== "pending") {
    return (
      <Frame heading={`Invitation already ${invitation.status}`} variant="info">
        <p>This invitation can no longer be accepted. Contact your org admin for a new one.</p>
      </Frame>
    );
  }

  if (await isExpired(invitation.expires_at)) {
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

  const membership = await insertMembership({
    org_id: invitation.org_id,
    user_id: user.id,
    role: invitation.role,
    status: "active",
  }).catch(() => null);
  if (!membership) {
    return (
      <Frame heading="Invitation could not be accepted" variant="error">
        <p>Membership could not be created. Ask your org admin to send a fresh invitation.</p>
      </Frame>
    );
  }

  await updateInvitationStatus(invitation.id, invitation.org_id, {
    status: "accepted",
    accepted_at: new Date().toISOString(),
    accepted_by: user.id,
  });
  await insertOrgEvent({
    org_id: invitation.org_id,
    actor_user_id: user.id,
    event_type: "org.member.invitation_accepted",
    payload: { invitation_id: invitation.id, email: invitation.email, role: invitation.role },
  }).catch(() => undefined);

  return (
    <Frame heading="Invitation accepted" variant="success">
      <p>
        You now have the <strong>{invitation.role}</strong> role. Head to your dashboard to get
        started.
      </p>
    </Frame>
  );
}
