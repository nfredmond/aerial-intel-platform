import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  selectNodeOdmJobsForOrg,
  selectShareLinksNearExpiry,
  selectTopShareLinksByUsage,
} from "@/lib/supabase/admin";

type FetchCall = {
  url: string;
  init: RequestInit | undefined;
};

function stubFetchOnce(body: unknown, calls: FetchCall[]): typeof fetch {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as unknown as typeof fetch;
}

const originalFetch = globalThis.fetch;
const originalEnv = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  anon: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  service: process.env.SUPABASE_SERVICE_ROLE_KEY,
};

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  process.env.NEXT_PUBLIC_SUPABASE_URL = originalEnv.url;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalEnv.anon;
  process.env.SUPABASE_SERVICE_ROLE_KEY = originalEnv.service;
});

describe("selectTopShareLinksByUsage", () => {
  it("orders by use_count desc then last_used_at desc nullslast and encodes the org id", async () => {
    const calls: FetchCall[] = [];
    globalThis.fetch = stubFetchOnce([], calls);

    await selectTopShareLinksByUsage("org with space/slash", 5);

    expect(calls).toHaveLength(1);
    const { url, init } = calls[0];
    expect(url).toContain("https://example.supabase.co/rest/v1/drone_artifact_share_links?");
    expect(url).toContain(`org_id=eq.${encodeURIComponent("org with space/slash")}`);
    expect(url).toContain("order=use_count.desc,last_used_at.desc.nullslast");
    expect(url).toContain("limit=5");
    expect(init?.method).toBe("GET");
  });

  it("returns the rows returned by the REST call", async () => {
    globalThis.fetch = stubFetchOnce([{ id: "a" }, { id: "b" }], []);
    const rows = await selectTopShareLinksByUsage("org-1", 3);
    expect(rows).toEqual([{ id: "a" }, { id: "b" }]);
  });
});

describe("selectShareLinksNearExpiry", () => {
  it("filters to non-null expires_at < horizon, non-revoked, ordered by expires_at asc", async () => {
    const calls: FetchCall[] = [];
    globalThis.fetch = stubFetchOnce([], calls);

    const now = Date.now();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(now));

    try {
      await selectShareLinksNearExpiry("org-1", 7);
    } finally {
      vi.useRealTimers();
    }

    expect(calls).toHaveLength(1);
    const { url } = calls[0];
    expect(url).toContain("org_id=eq.org-1");
    expect(url).toContain("expires_at=not.is.null");
    expect(url).toContain("revoked_at=is.null");
    expect(url).toContain("order=expires_at.asc");

    const match = /expires_at=lt\.([^&]+)/.exec(url);
    expect(match).not.toBeNull();
    const horizon = decodeURIComponent(match![1]);
    const horizonMs = Date.parse(horizon);
    const expected = now + 7 * 86_400_000;
    expect(Math.abs(horizonMs - expected)).toBeLessThan(5_000);
  });

  it("computes a different horizon for a different daysUntil value", async () => {
    const calls: FetchCall[] = [];
    globalThis.fetch = stubFetchOnce([], calls);

    const fixed = Date.parse("2026-04-16T00:00:00Z");
    vi.useFakeTimers();
    vi.setSystemTime(new Date(fixed));

    try {
      await selectShareLinksNearExpiry("org-1", 1);
    } finally {
      vi.useRealTimers();
    }

    const match = /expires_at=lt\.([^&]+)/.exec(calls[0].url);
    expect(match).not.toBeNull();
    expect(decodeURIComponent(match![1])).toBe("2026-04-17T00:00:00.000Z");
  });
});

describe("selectNodeOdmJobsForOrg", () => {
  it("filters to jobs with a non-null nodeodm taskUuid, orders by updated_at desc, and clamps the limit", async () => {
    const calls: FetchCall[] = [];
    globalThis.fetch = stubFetchOnce([], calls);

    await selectNodeOdmJobsForOrg("org with space/slash", 9999);

    expect(calls).toHaveLength(1);
    const { url, init } = calls[0];
    expect(url).toContain("https://example.supabase.co/rest/v1/drone_processing_jobs?");
    expect(url).toContain(`org_id=eq.${encodeURIComponent("org with space/slash")}`);
    expect(url).toContain("output_summary->nodeodm->>taskUuid=not.is.null");
    expect(url).toContain("order=updated_at.desc");
    expect(url).toContain("limit=200");
    expect(url).toContain(
      "select=id,org_id,mission_id,status,stage,updated_at,output_summary",
    );
    expect(init?.method).toBe("GET");
  });

  it("clamps non-positive limits to 1", async () => {
    const calls: FetchCall[] = [];
    globalThis.fetch = stubFetchOnce([], calls);

    await selectNodeOdmJobsForOrg("org-1", 0);

    expect(calls[0].url).toContain("limit=1");
  });
});
