import { describe, expect, it } from "vitest";

import {
  assertDroneOpsAction,
  canPerformDroneOpsAction,
  computeDroneOpsActions,
  DRONE_OPS_ROLE_ACTION_MATRIX,
  normalizeDroneOpsRole,
  roleCanPerformDroneOpsAction,
} from "./actions";

describe("normalizeDroneOpsRole", () => {
  it("accepts canonical roles", () => {
    expect(normalizeDroneOpsRole("owner")).toBe("owner");
    expect(normalizeDroneOpsRole("ADMIN")).toBe("admin");
    expect(normalizeDroneOpsRole("  analyst  ")).toBe("analyst");
    expect(normalizeDroneOpsRole("viewer")).toBe("viewer");
  });

  it("rejects unknown or empty roles", () => {
    expect(normalizeDroneOpsRole("member")).toBeNull();
    expect(normalizeDroneOpsRole("")).toBeNull();
    expect(normalizeDroneOpsRole(null)).toBeNull();
    expect(normalizeDroneOpsRole(undefined)).toBeNull();
  });
});

describe("DRONE_OPS_ROLE_ACTION_MATRIX", () => {
  it("grants viewer read-only access", () => {
    const viewer = DRONE_OPS_ROLE_ACTION_MATRIX.viewer;
    expect(viewer).toContain("missions.read");
    expect(viewer).toContain("artifacts.read");
    expect(viewer).not.toContain("missions.write");
    expect(viewer).not.toContain("admin.memberships");
  });

  it("grants analyst writes but not destructive or admin actions", () => {
    const analyst = DRONE_OPS_ROLE_ACTION_MATRIX.analyst;
    expect(analyst).toContain("missions.write");
    expect(analyst).toContain("jobs.launch");
    expect(analyst).toContain("artifacts.share");
    expect(analyst).not.toContain("missions.delete");
    expect(analyst).not.toContain("admin.memberships");
  });

  it("grants admin and owner the full action set", () => {
    const admin = DRONE_OPS_ROLE_ACTION_MATRIX.admin;
    const owner = DRONE_OPS_ROLE_ACTION_MATRIX.owner;
    expect(admin).toContain("admin.memberships");
    expect(admin).toContain("missions.delete");
    expect(owner).toEqual(admin);
  });
});

describe("canPerformDroneOpsAction", () => {
  it("returns false when there is no active entitlement", () => {
    const context = {
      role: "owner" as const,
      hasActiveEntitlement: false,
      actions: computeDroneOpsActions("owner"),
    };
    expect(canPerformDroneOpsAction(context, "missions.read")).toBe(false);
  });

  it("returns true when the entitlement is active and role permits the action", () => {
    const context = {
      role: "analyst" as const,
      hasActiveEntitlement: true,
      actions: computeDroneOpsActions("analyst"),
    };
    expect(canPerformDroneOpsAction(context, "jobs.launch")).toBe(true);
    expect(canPerformDroneOpsAction(context, "admin.memberships")).toBe(false);
  });

  it("returns false for a null context", () => {
    expect(canPerformDroneOpsAction(null, "missions.read")).toBe(false);
  });
});

describe("roleCanPerformDroneOpsAction", () => {
  it("evaluates role without entitlement gating", () => {
    expect(roleCanPerformDroneOpsAction("viewer", "missions.read")).toBe(true);
    expect(roleCanPerformDroneOpsAction("viewer", "missions.write")).toBe(false);
    expect(roleCanPerformDroneOpsAction("unknown", "missions.read")).toBe(false);
  });
});

describe("assertDroneOpsAction", () => {
  it("throws when the action is not permitted", () => {
    const context = {
      role: "viewer" as const,
      hasActiveEntitlement: true,
      actions: computeDroneOpsActions("viewer"),
    };
    expect(() => assertDroneOpsAction(context, "missions.write")).toThrow(/Forbidden/);
  });

  it("does not throw when permitted", () => {
    const context = {
      role: "owner" as const,
      hasActiveEntitlement: true,
      actions: computeDroneOpsActions("owner"),
    };
    expect(() => assertDroneOpsAction(context, "admin.memberships")).not.toThrow();
  });
});
