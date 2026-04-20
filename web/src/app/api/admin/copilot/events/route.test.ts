// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DroneOpsAccessResult } from "@/lib/auth/drone-ops-access";
import type { OrgEventRow } from "@/lib/supabase/admin";

import { GET } from "./route";

const { getDroneOpsAccessMock, selectRecentCopilotEventsForOrgMock } = vi.hoisted(() => ({
  getDroneOpsAccessMock: vi.fn(),
  selectRecentCopilotEventsForOrgMock: vi.fn(),
}));

vi.mock("@/lib/auth/drone-ops-access", () => ({
  getDroneOpsAccess: getDroneOpsAccessMock,
}));

vi.mock("@/lib/supabase/admin", () => ({
  selectRecentCopilotEventsForOrg: selectRecentCopilotEventsForOrgMock,
}));

function access(overrides: Partial<DroneOpsAccessResult> = {}): DroneOpsAccessResult {
  return {
    user: { id: "user-1", email: "owner@example.com" } as DroneOpsAccessResult["user"],
    isAuthenticated: true,
    hasMembership: true,
    hasActiveEntitlement: true,
    role: "owner",
    actions: ["admin.support"],
    org: {
      id: "org-1",
      name: "Nat Ford Drone Lab",
      slug: "nat-ford-drone-lab",
      created_at: "2026-04-01T00:00:00.000Z",
    },
    entitlement: {
      id: "ent-1",
      org_id: "org-1",
      product_id: "drone-ops",
      tier_id: "studio",
      status: "active",
      source: "manual",
      external_reference: null,
      created_at: "2026-04-01T00:00:00.000Z",
      updated_at: "2026-04-01T00:00:00.000Z",
    },
    blockedReason: null,
    ...overrides,
  };
}

function eventRow(): OrgEventRow {
  return {
    id: "event-1",
    org_id: "org-1",
    actor_user_id: "user-1",
    event_type: "copilot.call.succeeded",
    created_at: "2026-04-20T08:00:00.000Z",
    payload: {
      skill: "support-assistant",
      status: "ok",
      targetType: "support",
      targetId: null,
      modelId: "anthropic/claude-haiku-4.5",
      spendTenthCents: 14,
      totalSentences: 4,
      keptSentences: 4,
      droppedSentences: 0,
      citedFactCount: 3,
    },
  };
}

describe("GET /api/admin/copilot/events", () => {
  beforeEach(() => {
    getDroneOpsAccessMock.mockReset();
    selectRecentCopilotEventsForOrgMock.mockReset();
    selectRecentCopilotEventsForOrgMock.mockResolvedValue([eventRow()]);
  });

  it("rejects signed-out requests", async () => {
    getDroneOpsAccessMock.mockResolvedValue(
      access({
        user: null,
        isAuthenticated: false,
        hasMembership: false,
        hasActiveEntitlement: false,
        role: null,
        actions: [],
        org: null,
        entitlement: null,
      }),
    );

    const response = await GET(new Request("https://example.com/api/admin/copilot/events"));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ ok: false, error: "unauthenticated" });
    expect(selectRecentCopilotEventsForOrgMock).not.toHaveBeenCalled();
  });

  it("rejects non-admin users", async () => {
    getDroneOpsAccessMock.mockResolvedValue(
      access({
        role: "analyst",
        actions: ["copilot.generate"],
      }),
    );

    const response = await GET(new Request("https://example.com/api/admin/copilot/events"));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ ok: false, error: "forbidden" });
    expect(selectRecentCopilotEventsForOrgMock).not.toHaveBeenCalled();
  });

  it("exports org-scoped copilot events as csv", async () => {
    getDroneOpsAccessMock.mockResolvedValue(access());

    const response = await GET(
      new Request("https://example.com/api/admin/copilot/events?limit=250"),
    );
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Content-Disposition")).toMatch(
      /^attachment; filename="aerial-copilot-audit-nat-ford-drone-lab-\d{4}-\d{2}-\d{2}\.csv"$/,
    );
    expect(selectRecentCopilotEventsForOrgMock).toHaveBeenCalledWith("org-1", 250);
    expect(body).toContain("created_at,event_type,actor_user_id,skill,status");
    expect(body).toContain("copilot.call.succeeded,user-1,support-assistant,ok,support");
  });
});
