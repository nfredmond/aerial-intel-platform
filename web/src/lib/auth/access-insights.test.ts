import { describe, expect, it } from "vitest";

import {
  formatEntitlementTier,
  getBlockedAccessDetails,
  getBlockedAccessSupportFields,
  getDashboardNextActions,
} from "./access-insights";

describe("access-insights", () => {
  it("formats entitlement tiers into labels", () => {
    expect(formatEntitlementTier("enterprise_plus")).toBe("Enterprise Plus");
    expect(formatEntitlementTier(null)).toBe("Unknown tier");
  });

  it("returns owner/admin actions with entitlement context", () => {
    const actions = getDashboardNextActions({ role: "owner", tierId: "starter" });

    expect(actions).toHaveLength(3);
    expect(actions[1]).toContain("Starter");
  });

  it("returns analyst/viewer action guidance", () => {
    const actions = getDashboardNextActions({ role: "analyst", tierId: "pro" });

    expect(actions[0]).toContain("organization and role");
  });

  it("explains missing membership blocked access", () => {
    const details = getBlockedAccessDetails({
      hasMembership: false,
      hasActiveEntitlement: false,
    });

    expect(details.title).toContain("membership");
    expect(details.nextSteps).toHaveLength(3);
  });

  it("explains inactive entitlement blocked access", () => {
    const details = getBlockedAccessDetails({
      hasMembership: true,
      hasActiveEntitlement: false,
    });

    expect(details.title).toContain("inactive");
    expect(details.explanation).toContain("active entitlement");
  });

  it("builds support fields with safe fallbacks for blocked users", () => {
    const fields = getBlockedAccessSupportFields({
      userId: null,
      email: null,
      orgName: null,
      orgSlug: null,
      role: null,
      hasMembership: false,
      hasActiveEntitlement: false,
      tierId: null,
    });

    expect(fields).toEqual([
      { label: "User ID", value: "Unknown" },
      { label: "Signed-in email", value: "Unknown" },
      { label: "Organization", value: "Unknown" },
      { label: "Organization slug", value: "Unknown" },
      { label: "Role", value: "Unknown" },
      { label: "Membership linked", value: "No" },
      { label: "Entitlement active", value: "No" },
      { label: "Entitlement tier", value: "Not active" },
    ]);
  });

  it("includes formatted role and tier when entitlement is active", () => {
    const fields = getBlockedAccessSupportFields({
      userId: "1d2f3a4b",
      email: "pilot@example.com",
      orgName: "Acme Drone Co",
      orgSlug: "acme-drone-co",
      role: "admin",
      hasMembership: true,
      hasActiveEntitlement: true,
      tierId: "enterprise_plus",
    });

    expect(fields[0]).toEqual({ label: "User ID", value: "1d2f3a4b" });
    expect(fields[3]).toEqual({ label: "Organization slug", value: "acme-drone-co" });
    expect(fields[4]).toEqual({ label: "Role", value: "Admin" });
    expect(fields[7]).toEqual({ label: "Entitlement tier", value: "Enterprise Plus" });
  });
});
