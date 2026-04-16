import { describe, expect, it } from "vitest";

import {
  buildSupportDiagnosticsPacket,
  buildSupportEmailDraft,
  buildSupportJson,
  buildSupportMarkdown,
  buildSupportSummary,
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
      orgId: null,
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
      { label: "Organization ID", value: "Unknown" },
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
      orgId: "org-123",
      orgName: "Acme Drone Co",
      orgSlug: "acme-drone-co",
      role: "admin",
      hasMembership: true,
      hasActiveEntitlement: true,
      tierId: "enterprise_plus",
    });

    expect(fields[0]).toEqual({ label: "User ID", value: "1d2f3a4b" });
    expect(fields[2]).toEqual({ label: "Organization ID", value: "org-123" });
    expect(fields[4]).toEqual({ label: "Organization slug", value: "acme-drone-co" });
    expect(fields[5]).toEqual({ label: "Role", value: "Admin" });
    expect(fields[8]).toEqual({ label: "Entitlement tier", value: "Enterprise Plus" });
  });

  it("builds the support summary with reference and snapshot timestamp", () => {
    const summary = buildSupportSummary({
      fields: [{ label: "User ID", value: "abc123" }],
      blockedReason: "No active entitlement record",
      generatedAtIso: "2026-03-06T19:33:12.000Z",
    });

    expect(summary.reference).toBe("AIR-20260306193312");
    expect(summary.text).toContain("Support reference: AIR-20260306193312");
    expect(summary.text).toContain("Snapshot generated (UTC): 2026-03-06T19:33:12.000Z");
    expect(summary.text).toContain("User ID: abc123");
    expect(summary.text).toContain("Observed reason: No active entitlement record");
  });

  it("falls back to AIR-UNKNOWN when generated timestamp is not parseable", () => {
    const summary = buildSupportSummary({
      fields: [],
      blockedReason: null,
      generatedAtIso: "not-a-timestamp",
    });

    expect(summary.reference).toBe("AIR-UNKNOWN");
    expect(summary.text).toContain("Observed reason: not provided");
  });

  it("builds JSON output containing a diagnostics map keyed by field label", () => {
    const json = buildSupportJson({
      fields: [
        { label: "User ID", value: "abc123" },
        { label: "Entitlement active", value: "No" },
      ],
      blockedReason: "No active entitlement record",
      generatedAtIso: "2026-03-06T19:33:12.000Z",
    });

    const payload = JSON.parse(json.text) as {
      supportReference: string;
      snapshotGeneratedUtc: string;
      observedReason: string;
      diagnostics: Record<string, string>;
    };

    expect(payload.supportReference).toBe("AIR-20260306193312");
    expect(payload.diagnostics["User ID"]).toBe("abc123");
    expect(payload.observedReason).toBe("No active entitlement record");
  });

  it("builds a Markdown bullet list with the reference header", () => {
    const md = buildSupportMarkdown({
      fields: [{ label: "User ID", value: "abc123" }],
      blockedReason: "No active entitlement record",
      generatedAtIso: "2026-03-06T19:33:12.000Z",
    });

    expect(md.text).toContain("## Support reference AIR-20260306193312");
    expect(md.text).toContain("- **User ID:** abc123");
    expect(md.text).toContain("**Observed reason:** No active entitlement record");
  });

  it("builds an email draft with subject, body, mailto, and Gmail links", () => {
    const draft = buildSupportEmailDraft({
      fields: [{ label: "User ID", value: "abc123" }],
      blockedReason: "No active entitlement record",
      generatedAtIso: "2026-03-06T19:33:12.000Z",
    });

    expect(draft.subject).toBe("DroneOps access blocked (AIR-20260306193312)");
    expect(draft.body).toContain("Hello support team,");
    expect(draft.body).toContain("User ID: abc123");
    expect(draft.text.startsWith(`Subject: ${draft.subject}`)).toBe(true);
    expect(draft.mailtoHref.startsWith("mailto:support@natfordplanning.com")).toBe(true);
    expect(draft.gmailHref).toContain("mail.google.com");
  });

  it("assembles a diagnostics packet with all four formats", () => {
    const packet = buildSupportDiagnosticsPacket({
      fields: [{ label: "User ID", value: "abc123" }],
      blockedReason: "No active entitlement record",
      generatedAtIso: "2026-03-06T19:33:12.000Z",
    });

    expect(packet.reference).toBe("AIR-20260306193312");
    expect(packet.summary).toContain("Support reference: AIR-20260306193312");
    expect(packet.emailDraft).toContain("Subject: DroneOps access blocked");
    expect(JSON.parse(packet.json).supportReference).toBe("AIR-20260306193312");
    expect(packet.markdown).toContain("## Support reference AIR-20260306193312");
    expect(packet.supportEmail).toBe("support@natfordplanning.com");
  });
});
