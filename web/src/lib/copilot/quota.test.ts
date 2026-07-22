import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  checkQuotaAndReserve,
  currentPeriodMonthIso,
  reconcileCopilotSpend,
} from "./quota";
import type { CopilotConfig } from "./config";

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

const TEST_CONFIG = { defaultCapTenthCents: 50000 } as CopilotConfig;

function mockFetchOnce(rows: unknown) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => rows,
  } as unknown as Response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("checkQuotaAndReserve (atomic reservation via RPC)", () => {
  beforeEach(() => {
    process.env.SUPABASE_URL = "http://supabase.test";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  it("calls reserve_copilot_budget and reports the pre-call spend when allowed", async () => {
    // RPC returns post-reservation spend (1200 = 1000 before + 200 budget).
    const fetchMock = mockFetchOnce([
      { quota_row_id: "q1", cap_tenth_cents: 50000, spend_tenth_cents: 1200, allowed: true },
    ]);

    const result = await checkQuotaAndReserve({ orgId: "org-1", budgetTenthCents: 200 }, TEST_CONFIG);

    expect(result).toEqual({
      allowed: true,
      quotaRowId: "q1",
      reservedTenthCents: 200,
      capTenthCents: 50000,
      spendTenthCents: 1000,
      remainingTenthCents: 49000,
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/rest/v1/rpc/reserve_copilot_budget");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      p_org_id: "org-1",
      p_period: currentPeriodMonthIso(),
      p_default_cap: 50000,
      p_budget: 200,
    });
  });

  it("returns cap-exceeded (no reservation) when the RPC refuses", async () => {
    mockFetchOnce([
      { quota_row_id: "q1", cap_tenth_cents: 50000, spend_tenth_cents: 49900, allowed: false },
    ]);

    const result = await checkQuotaAndReserve({ orgId: "org-1", budgetTenthCents: 200 }, TEST_CONFIG);

    expect(result).toEqual({
      allowed: false,
      reason: "cap-exceeded",
      capTenthCents: 50000,
      spendTenthCents: 49900,
      remainingTenthCents: 100,
    });
  });

  it("throws when the RPC returns no row", async () => {
    mockFetchOnce([]);
    await expect(
      checkQuotaAndReserve({ orgId: "org-1", budgetTenthCents: 200 }, TEST_CONFIG),
    ).rejects.toThrow(/returned no row/);
  });
});

describe("reconcileCopilotSpend (atomic adjust via RPC)", () => {
  beforeEach(() => {
    process.env.SUPABASE_URL = "http://supabase.test";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  it("refunds the unused portion of the reservation (actual < reserved)", async () => {
    const fetchMock = mockFetchOnce([{ id: "q1", spend_tenth_cents: 850 }]);
    await reconcileCopilotSpend({ quotaRowId: "q1", reservedTenthCents: 200, actualTenthCents: 50 });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/rest/v1/rpc/adjust_copilot_spend");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      p_quota_row_id: "q1",
      p_delta: -150,
    });
  });

  it("fully refunds a reservation whose call never billed (actual = 0)", async () => {
    const fetchMock = mockFetchOnce([{ id: "q1", spend_tenth_cents: 800 }]);
    await reconcileCopilotSpend({ quotaRowId: "q1", reservedTenthCents: 200, actualTenthCents: 0 });
    expect(JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)).toMatchObject({
      p_delta: -200,
    });
  });

  it("throws when the adjust RPC returns no row", async () => {
    mockFetchOnce([]);
    await expect(
      reconcileCopilotSpend({ quotaRowId: "missing", reservedTenthCents: 10, actualTenthCents: 5 }),
    ).rejects.toThrow(/not found/);
  });
});
