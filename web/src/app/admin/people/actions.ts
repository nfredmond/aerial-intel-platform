"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";

import { canPerformDroneOpsAction } from "@/lib/auth/actions";
import { getDroneOpsAccess } from "@/lib/auth/drone-ops-access";
import {
  insertInvitation,
  insertOrgEvent,
  selectInvitationsForOrg,
  updateInvitationStatus,
  updateMembershipStatus,
} from "@/lib/supabase/admin";

export type PeopleActionResult =
  | { status: "idle" }
  | { status: "ok"; message: string; invitationUrl?: string }
  | { status: "error"; message: string };

const ALLOWED_ROLES = ["admin", "analyst", "viewer"] as const;
type InvitableRole = (typeof ALLOWED_ROLES)[number];

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return null;
  return trimmed;
}

function normalizeRole(value: unknown): InvitableRole | null {
  if (typeof value !== "string") return null;
  return (ALLOWED_ROLES as readonly string[]).includes(value)
    ? (value as InvitableRole)
    : null;
}

function buildInvitationUrl(token: string): string | null {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? process.env.NEXT_PUBLIC_VERCEL_URL ?? "";
  const trimmed = base.replace(/\/$/, "");
  if (!trimmed) return null;
  const origin = trimmed.startsWith("http") ? trimmed : `https://${trimmed}`;
  return `${origin}/invitations/${token}`;
}

export async function inviteMemberAction(
  _prev: PeopleActionResult,
  formData: FormData,
): Promise<PeopleActionResult> {
  const access = await getDroneOpsAccess();
  if (!access.user) return { status: "error", message: "Not authenticated." };
  if (!canPerformDroneOpsAction(access, "members.invite")) {
    return { status: "error", message: "Not authorized to invite members." };
  }
  const orgId = access.org?.id;
  if (!orgId) return { status: "error", message: "No org context." };

  const email = normalizeEmail(formData.get("email"));
  if (!email) return { status: "error", message: "Enter a valid email address." };

  const role = normalizeRole(formData.get("role"));
  if (!role) return { status: "error", message: "Pick a valid role." };
  if (role === "admin" && access.role !== "owner") {
    return { status: "error", message: "Only owners can invite admins." };
  }

  const existing = await selectInvitationsForOrg(orgId).catch(() => []);
  if (existing.some((row) => row.status === "pending" && row.email.toLowerCase() === email)) {
    return {
      status: "error",
      message: "A pending invitation already exists for that email.",
    };
  }

  const token = randomBytes(24).toString("base64url");
  const row = await insertInvitation({
    org_id: orgId,
    email,
    role,
    invited_by: access.user.id,
    token,
  });
  if (!row) return { status: "error", message: "Could not create invitation." };

  await insertOrgEvent({
    org_id: orgId,
    actor_user_id: access.user.id,
    event_type: "org.member.invited",
    payload: { email, role, invitation_id: row.id },
  }).catch(() => undefined);

  revalidatePath("/admin/people");

  const invitationUrl = buildInvitationUrl(token);
  return {
    status: "ok",
    message: `Invitation created for ${email}.`,
    ...(invitationUrl ? { invitationUrl } : {}),
  };
}

export async function suspendMemberAction(
  _prev: PeopleActionResult,
  formData: FormData,
): Promise<PeopleActionResult> {
  return setMemberStatus(formData, "suspended");
}

export async function reactivateMemberAction(
  _prev: PeopleActionResult,
  formData: FormData,
): Promise<PeopleActionResult> {
  return setMemberStatus(formData, "active");
}

async function setMemberStatus(
  formData: FormData,
  status: "active" | "suspended",
): Promise<PeopleActionResult> {
  const access = await getDroneOpsAccess();
  if (!access.user) return { status: "error", message: "Not authenticated." };
  if (!canPerformDroneOpsAction(access, "members.suspend")) {
    return { status: "error", message: "Not authorized." };
  }
  const orgId = access.org?.id;
  if (!orgId) return { status: "error", message: "No org context." };

  const userId = formData.get("userId");
  if (typeof userId !== "string" || !userId) {
    return { status: "error", message: "Missing userId." };
  }
  if (userId === access.user.id) {
    return { status: "error", message: "You cannot change your own membership status." };
  }

  const row = await updateMembershipStatus(orgId, userId, { status });
  if (!row) return { status: "error", message: "Member not found." };

  await insertOrgEvent({
    org_id: orgId,
    actor_user_id: access.user.id,
    event_type: status === "suspended" ? "org.member.suspended" : "org.member.reactivated",
    payload: { user_id: userId, role: row.role },
  }).catch(() => undefined);

  revalidatePath("/admin/people");

  return {
    status: "ok",
    message: status === "suspended" ? "Member suspended." : "Member reactivated.",
  };
}

export async function revokeInvitationAction(
  _prev: PeopleActionResult,
  formData: FormData,
): Promise<PeopleActionResult> {
  const access = await getDroneOpsAccess();
  if (!access.user) return { status: "error", message: "Not authenticated." };
  if (!canPerformDroneOpsAction(access, "members.invite")) {
    return { status: "error", message: "Not authorized." };
  }
  const orgId = access.org?.id;
  if (!orgId) return { status: "error", message: "No org context." };

  const invitationId = formData.get("invitationId");
  if (typeof invitationId !== "string" || !invitationId) {
    return { status: "error", message: "Missing invitationId." };
  }

  const row = await updateInvitationStatus(invitationId, orgId, { status: "revoked" });
  if (!row) {
    return { status: "error", message: "Invitation not found." };
  }

  await insertOrgEvent({
    org_id: orgId,
    actor_user_id: access.user.id,
    event_type: "org.member.invitation_revoked",
    payload: { invitation_id: invitationId, email: row.email },
  }).catch(() => undefined);

  revalidatePath("/admin/people");

  return { status: "ok", message: "Invitation revoked." };
}
