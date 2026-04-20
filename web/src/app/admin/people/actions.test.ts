// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { computeDroneOpsActions, type DroneOpsAction } from "@/lib/auth/actions";
import type { DroneOpsAccessResult } from "@/lib/auth/drone-ops-access";
import type { DroneMembershipRole } from "@/lib/supabase/types";

const {
  getDroneOpsAccessMock,
  insertInvitationMock,
  insertOrgEventMock,
  selectInvitationsForOrgMock,
  updateInvitationStatusMock,
  updateMembershipStatusMock,
  revalidatePathMock,
} = vi.hoisted(() => ({
  getDroneOpsAccessMock: vi.fn(),
  insertInvitationMock: vi.fn(),
  insertOrgEventMock: vi.fn(),
  selectInvitationsForOrgMock: vi.fn(),
  updateInvitationStatusMock: vi.fn(),
  updateMembershipStatusMock: vi.fn(),
  revalidatePathMock: vi.fn(),
}));

vi.mock("@/lib/auth/drone-ops-access", () => ({
  getDroneOpsAccess: getDroneOpsAccessMock,
}));

vi.mock("@/lib/supabase/admin", () => ({
  insertInvitation: insertInvitationMock,
  insertOrgEvent: insertOrgEventMock,
  selectInvitationsForOrg: selectInvitationsForOrgMock,
  updateInvitationStatus: updateInvitationStatusMock,
  updateMembershipStatus: updateMembershipStatusMock,
}));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

import {
  inviteMemberAction,
  reactivateMemberAction,
  revokeInvitationAction,
  suspendMemberAction,
} from "./actions";

const IDLE = { status: "idle" as const };

function buildAccess(
  role: DroneMembershipRole | null,
  opts?: { userId?: string; orgId?: string; entitled?: boolean },
): DroneOpsAccessResult {
  const userId = opts?.userId ?? "user-1";
  const orgId = opts?.orgId ?? "org-1";
  if (role === null) {
    return {
      user: null,
      isAuthenticated: false,
      hasMembership: false,
      hasActiveEntitlement: false,
      role: null,
      actions: [],
      org: null,
      entitlement: null,
      blockedReason: null,
    };
  }
  const entitled = opts?.entitled ?? true;
  const actions: DroneOpsAction[] = entitled ? computeDroneOpsActions(role) : [];
  return {
    user: { id: userId, email: "u@example.com" } as DroneOpsAccessResult["user"],
    isAuthenticated: true,
    hasMembership: true,
    hasActiveEntitlement: entitled,
    role,
    actions,
    org: {
      id: orgId,
      name: "Org",
      slug: "org",
      created_at: "2026-04-19T00:00:00Z",
    } as DroneOpsAccessResult["org"],
    entitlement: null,
    blockedReason: null,
  };
}

function formData(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(entries)) fd.append(key, value);
  return fd;
}

beforeEach(() => {
  getDroneOpsAccessMock.mockReset();
  insertInvitationMock.mockReset();
  insertOrgEventMock.mockReset();
  selectInvitationsForOrgMock.mockReset();
  updateInvitationStatusMock.mockReset();
  updateMembershipStatusMock.mockReset();
  revalidatePathMock.mockReset();
  insertOrgEventMock.mockResolvedValue(undefined);
  selectInvitationsForOrgMock.mockResolvedValue([]);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("inviteMemberAction", () => {
  it("blocks signed-out users", async () => {
    getDroneOpsAccessMock.mockResolvedValue(buildAccess(null));
    const result = await inviteMemberAction(
      IDLE,
      formData({ email: "x@y.com", role: "viewer" }),
    );
    expect(result).toEqual({ status: "error", message: "Not authenticated." });
    expect(insertInvitationMock).not.toHaveBeenCalled();
  });

  it("blocks analysts (RBAC)", async () => {
    getDroneOpsAccessMock.mockResolvedValue(buildAccess("analyst"));
    const result = await inviteMemberAction(
      IDLE,
      formData({ email: "x@y.com", role: "viewer" }),
    );
    expect(result).toEqual({
      status: "error",
      message: "Not authorized to invite members.",
    });
    expect(insertInvitationMock).not.toHaveBeenCalled();
  });

  it("rejects invalid email format", async () => {
    getDroneOpsAccessMock.mockResolvedValue(buildAccess("admin"));
    const result = await inviteMemberAction(
      IDLE,
      formData({ email: "not-an-email", role: "viewer" }),
    );
    expect(result.status).toBe("error");
    if (result.status === "error") expect(result.message).toMatch(/email/i);
    expect(insertInvitationMock).not.toHaveBeenCalled();
  });

  it("rejects role=owner (escalation blocked by allow-list)", async () => {
    getDroneOpsAccessMock.mockResolvedValue(buildAccess("admin"));
    const result = await inviteMemberAction(
      IDLE,
      formData({ email: "x@y.com", role: "owner" }),
    );
    expect(result).toEqual({ status: "error", message: "Pick a valid role." });
    expect(insertInvitationMock).not.toHaveBeenCalled();
  });

  it("rejects duplicate pending invitation (case-insensitive)", async () => {
    getDroneOpsAccessMock.mockResolvedValue(buildAccess("admin"));
    selectInvitationsForOrgMock.mockResolvedValue([
      { status: "pending", email: "X@Y.com" },
    ]);
    const result = await inviteMemberAction(
      IDLE,
      formData({ email: "x@y.com", role: "viewer" }),
    );
    expect(result).toEqual({
      status: "error",
      message: "A pending invitation already exists for that email.",
    });
    expect(insertInvitationMock).not.toHaveBeenCalled();
  });

  it("happy path: inserts invitation, emits event, returns full URL", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://app.example.com");
    getDroneOpsAccessMock.mockResolvedValue(buildAccess("admin"));
    insertInvitationMock.mockResolvedValue({ id: "inv-1" });

    const result = await inviteMemberAction(
      IDLE,
      formData({ email: "x@y.com", role: "viewer" }),
    );

    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.invitationUrl).toMatch(
        /^https:\/\/app\.example\.com\/invitations\/[A-Za-z0-9_-]+$/,
      );
    }
    expect(insertInvitationMock).toHaveBeenCalledTimes(1);
    expect(insertInvitationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        org_id: "org-1",
        email: "x@y.com",
        role: "viewer",
        invited_by: "user-1",
      }),
    );
    expect(insertOrgEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ event_type: "org.member.invited" }),
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/people");
  });

  it("omits invitationUrl when no origin is configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_VERCEL_URL", "");
    getDroneOpsAccessMock.mockResolvedValue(buildAccess("admin"));
    insertInvitationMock.mockResolvedValue({ id: "inv-1" });

    const result = await inviteMemberAction(
      IDLE,
      formData({ email: "x@y.com", role: "viewer" }),
    );

    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.invitationUrl).toBeUndefined();
    }
  });
});

describe("suspendMemberAction", () => {
  it("blocks analysts (RBAC)", async () => {
    getDroneOpsAccessMock.mockResolvedValue(buildAccess("analyst"));
    const result = await suspendMemberAction(IDLE, formData({ userId: "user-2" }));
    expect(result).toEqual({ status: "error", message: "Not authorized." });
    expect(updateMembershipStatusMock).not.toHaveBeenCalled();
  });

  it("blocks self-suspension", async () => {
    getDroneOpsAccessMock.mockResolvedValue(
      buildAccess("admin", { userId: "user-1" }),
    );
    const result = await suspendMemberAction(IDLE, formData({ userId: "user-1" }));
    expect(result.status).toBe("error");
    if (result.status === "error") expect(result.message).toMatch(/own membership/i);
    expect(updateMembershipStatusMock).not.toHaveBeenCalled();
  });

  it("happy path: updates status scoped by (org, user), emits suspended event", async () => {
    getDroneOpsAccessMock.mockResolvedValue(buildAccess("admin"));
    updateMembershipStatusMock.mockResolvedValue({ role: "viewer" });

    const result = await suspendMemberAction(IDLE, formData({ userId: "user-2" }));

    expect(result).toEqual({ status: "ok", message: "Member suspended." });
    expect(updateMembershipStatusMock).toHaveBeenCalledWith("org-1", "user-2", {
      status: "suspended",
    });
    expect(insertOrgEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ event_type: "org.member.suspended" }),
    );
  });
});

describe("reactivateMemberAction", () => {
  it("happy path: flips to active + emits reactivated event", async () => {
    getDroneOpsAccessMock.mockResolvedValue(buildAccess("admin"));
    updateMembershipStatusMock.mockResolvedValue({ role: "analyst" });

    const result = await reactivateMemberAction(
      IDLE,
      formData({ userId: "user-2" }),
    );

    expect(result).toEqual({ status: "ok", message: "Member reactivated." });
    expect(updateMembershipStatusMock).toHaveBeenCalledWith("org-1", "user-2", {
      status: "active",
    });
    expect(insertOrgEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ event_type: "org.member.reactivated" }),
    );
  });
});

describe("revokeInvitationAction", () => {
  it("calls updateInvitationStatus scoped by the admin's org, not the submitted invitationId alone", async () => {
    // Simulates admin of org-1 submitting an invitationId belonging to org-2.
    // The helper filters by (id, org_id) and returns null; action reports
    // "not found" without firing the audit event.
    getDroneOpsAccessMock.mockResolvedValue(buildAccess("admin"));
    updateInvitationStatusMock.mockResolvedValue(null);

    const result = await revokeInvitationAction(
      IDLE,
      formData({ invitationId: "inv-from-other-org" }),
    );

    expect(result).toEqual({ status: "error", message: "Invitation not found." });
    expect(updateInvitationStatusMock).toHaveBeenCalledWith(
      "inv-from-other-org",
      "org-1",
      { status: "revoked" },
    );
    expect(insertOrgEventMock).not.toHaveBeenCalled();
  });

  it("happy path: revokes + emits invitation_revoked event", async () => {
    getDroneOpsAccessMock.mockResolvedValue(buildAccess("admin"));
    updateInvitationStatusMock.mockResolvedValue({
      id: "inv-1",
      email: "x@y.com",
      org_id: "org-1",
    });

    const result = await revokeInvitationAction(
      IDLE,
      formData({ invitationId: "inv-1" }),
    );

    expect(result).toEqual({ status: "ok", message: "Invitation revoked." });
    expect(insertOrgEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: "org.member.invitation_revoked",
        payload: expect.objectContaining({ invitation_id: "inv-1" }),
      }),
    );
  });
});
