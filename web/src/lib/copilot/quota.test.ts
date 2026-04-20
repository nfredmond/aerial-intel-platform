import { describe, expect, it } from "vitest";

import { currentPeriodMonthIso } from "./quota";

describe("currentPeriodMonthIso", () => {
  it("returns the first-of-month in UTC for a mid-month date", () => {
    expect(currentPeriodMonthIso(new Date(Date.UTC(2026, 3, 18, 12, 0, 0)))).toBe("2026-04-01");
  });

  it("pads single-digit months", () => {
    expect(currentPeriodMonthIso(new Date(Date.UTC(2026, 0, 3, 0, 0, 0)))).toBe("2026-01-01");
    expect(currentPeriodMonthIso(new Date(Date.UTC(2026, 8, 30, 23, 59, 59)))).toBe("2026-09-01");
  });

  it("normalizes on the first-of-month itself", () => {
    expect(currentPeriodMonthIso(new Date(Date.UTC(2026, 11, 1, 0, 0, 0)))).toBe("2026-12-01");
  });
});
