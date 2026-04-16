import { describe, expect, it } from "vitest";

import type { ArtifactShareLinkRow } from "@/lib/supabase/admin";

import {
  computeExpiresAt,
  generateShareToken,
  isShareLinkExhausted,
  isShareLinkExpired,
  isShareLinkRevoked,
  parseExpiresInHoursInput,
  parseMaxUsesInput,
  shareLinkStatus,
  validateShareLink,
} from "./sharing";

function makeLink(overrides: Partial<ArtifactShareLinkRow> = {}): ArtifactShareLinkRow {
  return {
    id: "link-1",
    org_id: "org-1",
    artifact_id: "artifact-1",
    token: "abc",
    note: null,
    max_uses: null,
    use_count: 0,
    expires_at: null,
    revoked_at: null,
    last_used_at: null,
    created_by: null,
    created_at: "2026-04-16T00:00:00Z",
    updated_at: "2026-04-16T00:00:00Z",
    ...overrides,
  };
}

describe("generateShareToken", () => {
  it("produces a url-safe base64 string of 43+ characters with 32 bytes", () => {
    const token = generateShareToken();
    expect(token.length).toBeGreaterThanOrEqual(43);
    expect(/^[A-Za-z0-9_-]+$/.test(token)).toBe(true);
  });

  it("throws below the 16-byte floor", () => {
    expect(() => generateShareToken(8)).toThrow(/16 random bytes/);
  });

  it("returns distinct tokens across calls", () => {
    const a = generateShareToken();
    const b = generateShareToken();
    expect(a).not.toBe(b);
  });
});

describe("validateShareLink", () => {
  const now = new Date("2026-04-16T12:00:00Z");

  it("returns not_found for null", () => {
    expect(validateShareLink(null, now)).toEqual({ ok: false, reason: "not_found" });
  });

  it("returns revoked when revoked_at is set", () => {
    const link = makeLink({ revoked_at: "2026-04-15T00:00:00Z" });
    expect(validateShareLink(link, now)).toEqual({ ok: false, reason: "revoked" });
  });

  it("returns expired when expires_at is in the past", () => {
    const link = makeLink({ expires_at: "2026-04-15T00:00:00Z" });
    expect(validateShareLink(link, now)).toEqual({ ok: false, reason: "expired" });
  });

  it("returns exhausted when use_count >= max_uses", () => {
    const link = makeLink({ max_uses: 3, use_count: 3 });
    expect(validateShareLink(link, now)).toEqual({ ok: false, reason: "exhausted" });
  });

  it("returns ok with link when valid", () => {
    const link = makeLink({ expires_at: "2027-01-01T00:00:00Z", max_uses: 5, use_count: 1 });
    const result = validateShareLink(link, now);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.link).toBe(link);
  });

  it("revoked takes precedence over expired and exhausted", () => {
    const link = makeLink({
      revoked_at: "2026-04-15T00:00:00Z",
      expires_at: "2026-04-15T00:00:00Z",
      max_uses: 1,
      use_count: 99,
    });
    expect(validateShareLink(link, now)).toEqual({ ok: false, reason: "revoked" });
  });
});

describe("predicates", () => {
  const now = new Date("2026-04-16T12:00:00Z");

  it("isShareLinkRevoked", () => {
    expect(isShareLinkRevoked(makeLink())).toBe(false);
    expect(isShareLinkRevoked(makeLink({ revoked_at: "2026-04-15T00:00:00Z" }))).toBe(true);
  });

  it("isShareLinkExpired", () => {
    expect(isShareLinkExpired(makeLink(), now)).toBe(false);
    expect(isShareLinkExpired(makeLink({ expires_at: "2026-04-15T00:00:00Z" }), now)).toBe(true);
    expect(isShareLinkExpired(makeLink({ expires_at: "2027-04-15T00:00:00Z" }), now)).toBe(false);
  });

  it("isShareLinkExhausted", () => {
    expect(isShareLinkExhausted(makeLink())).toBe(false);
    expect(isShareLinkExhausted(makeLink({ max_uses: 5, use_count: 4 }))).toBe(false);
    expect(isShareLinkExhausted(makeLink({ max_uses: 5, use_count: 5 }))).toBe(true);
  });
});

describe("computeExpiresAt", () => {
  const now = new Date("2026-04-16T12:00:00Z");

  it("returns null for null input", () => {
    expect(computeExpiresAt(null, now)).toBe(null);
  });

  it("returns null for non-positive input", () => {
    expect(computeExpiresAt(0, now)).toBe(null);
    expect(computeExpiresAt(-5, now)).toBe(null);
  });

  it("computes ISO string N hours ahead", () => {
    expect(computeExpiresAt(24, now)).toBe("2026-04-17T12:00:00.000Z");
  });

  it("caps at 1 year", () => {
    const far = computeExpiresAt(24 * 365 * 10, now);
    expect(far).toBe("2027-04-16T12:00:00.000Z");
  });
});

describe("input parsers", () => {
  it("parseExpiresInHoursInput", () => {
    expect(parseExpiresInHoursInput(null)).toBe(null);
    expect(parseExpiresInHoursInput("")).toBe(null);
    expect(parseExpiresInHoursInput("  ")).toBe(null);
    expect(parseExpiresInHoursInput("0")).toBe(null);
    expect(parseExpiresInHoursInput("-4")).toBe(null);
    expect(parseExpiresInHoursInput("24")).toBe(24);
    expect(parseExpiresInHoursInput("  48  ")).toBe(48);
    expect(parseExpiresInHoursInput("not a number")).toBe(null);
  });

  it("parseMaxUsesInput rejects non-positive + non-integer values", () => {
    expect(parseMaxUsesInput(null)).toBe(null);
    expect(parseMaxUsesInput("")).toBe(null);
    expect(parseMaxUsesInput("0")).toBe(null);
    expect(parseMaxUsesInput("-1")).toBe(null);
    expect(parseMaxUsesInput("2.5")).toBe(null);
    expect(parseMaxUsesInput("5")).toBe(5);
  });
});

describe("shareLinkStatus", () => {
  const now = new Date("2026-04-16T12:00:00Z");

  it("reports active for fresh links", () => {
    expect(shareLinkStatus(makeLink(), now)).toBe("active");
  });

  it("reports revoked before other states", () => {
    const link = makeLink({ revoked_at: "2026-04-15T00:00:00Z", expires_at: "2026-04-15T00:00:00Z" });
    expect(shareLinkStatus(link, now)).toBe("revoked");
  });

  it("reports expired when past expiry", () => {
    expect(shareLinkStatus(makeLink({ expires_at: "2026-04-15T00:00:00Z" }), now)).toBe("expired");
  });

  it("reports exhausted when use_count >= max_uses", () => {
    expect(shareLinkStatus(makeLink({ max_uses: 2, use_count: 2 }), now)).toBe("exhausted");
  });
});
