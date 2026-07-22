import { describe, expect, it } from "vitest";

import { capTenthCentsToDollars, MAX_CAP_TENTH_CENTS, parseCapDollars } from "./cap";

describe("parseCapDollars", () => {
  it("parses whole dollars into tenth-cents ($1 = 1000)", () => {
    expect(parseCapDollars("50")).toEqual({ ok: true, capTenthCents: 50000 });
    expect(parseCapDollars("0")).toEqual({ ok: true, capTenthCents: 0 });
  });

  it("parses cents precisely and rounds to the nearest tenth-cent", () => {
    expect(parseCapDollars("12.34")).toEqual({ ok: true, capTenthCents: 12340 });
    // $0.005 = 5 tenth-cents; $0.0005 rounds to 1 tenth-cent (0.5 -> 1).
    expect(parseCapDollars("0.005")).toEqual({ ok: true, capTenthCents: 5 });
    expect(parseCapDollars("0.0005")).toEqual({ ok: true, capTenthCents: 1 });
  });

  it("rejects empty, non-string, and non-numeric input", () => {
    expect(parseCapDollars("").ok).toBe(false);
    expect(parseCapDollars("   ").ok).toBe(false);
    expect(parseCapDollars(undefined).ok).toBe(false);
    expect(parseCapDollars("abc").ok).toBe(false);
    expect(parseCapDollars(null).ok).toBe(false);
  });

  it("rejects negative amounts", () => {
    const result = parseCapDollars("-5");
    expect(result.ok).toBe(false);
  });

  it("rejects amounts above the ceiling", () => {
    expect(parseCapDollars("100001").ok).toBe(false);
    expect(parseCapDollars("100000")).toEqual({ ok: true, capTenthCents: MAX_CAP_TENTH_CENTS });
  });
});

describe("capTenthCentsToDollars", () => {
  it("formats tenth-cents back to two-decimal dollars", () => {
    expect(capTenthCentsToDollars(50000)).toBe("50.00");
    expect(capTenthCentsToDollars(12340)).toBe("12.34");
    expect(capTenthCentsToDollars(0)).toBe("0.00");
  });
});
