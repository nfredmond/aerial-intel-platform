import { describe, expect, it } from "vitest";

import {
  formatEntitlementTier,
  getBlockedAccessDetails,
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
});
