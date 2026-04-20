import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  insertMembership,
  insertInvitation,
  insertOrgEvent,
  selectCopilotOrgSettings,
  selectCopilotQuotaRowsForOrg,
  selectRecentCopilotEventsForOrg,
  selectInvitationByToken,
  selectInvitationsForOrg,
  selectMembershipByOrgUser,
  selectNodeOdmJobsForOrg,
  selectShareLinksNearExpiry,
  selectStaleInFlightJobsForOrg,
  selectTopShareLinksByUsage,
  updateArtifactComment,
  updateInvitationStatus,
  updateMembershipStatus,
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

describe("selectStaleInFlightJobsForOrg", () => {
  it("filters in-flight statuses, computes updated_at cutoff from minutesStale, orders by updated_at asc", async () => {
    const calls: FetchCall[] = [];
    globalThis.fetch = stubFetchOnce([], calls);

    const fixed = Date.parse("2026-04-16T12:00:00Z");
    vi.useFakeTimers();
    vi.setSystemTime(new Date(fixed));

    try {
      await selectStaleInFlightJobsForOrg("org with space/slash", { minutesStale: 90, limit: 15 });
    } finally {
      vi.useRealTimers();
    }

    expect(calls).toHaveLength(1);
    const { url, init } = calls[0];
    expect(url).toContain("https://example.supabase.co/rest/v1/drone_processing_jobs?");
    expect(url).toContain(`org_id=eq.${encodeURIComponent("org with space/slash")}`);
    expect(url).toContain("status=in.(pending,queued,processing,awaiting_output_import)");
    expect(url).toContain(
      "select=id,org_id,mission_id,engine,status,stage,progress,updated_at",
    );
    expect(url).toContain("order=updated_at.asc");
    expect(url).toContain("limit=15");
    expect(init?.method).toBe("GET");

    const cutoffMatch = /updated_at=lt\.([^&]+)/.exec(url);
    expect(cutoffMatch).not.toBeNull();
    const cutoff = decodeURIComponent(cutoffMatch![1]);
    expect(cutoff).toBe("2026-04-16T10:30:00.000Z");
  });

  it("defaults to 60 minutes stale and limit 20", async () => {
    const calls: FetchCall[] = [];
    globalThis.fetch = stubFetchOnce([], calls);

    const fixed = Date.parse("2026-04-16T00:00:00Z");
    vi.useFakeTimers();
    vi.setSystemTime(new Date(fixed));

    try {
      await selectStaleInFlightJobsForOrg("org-1");
    } finally {
      vi.useRealTimers();
    }

    const { url } = calls[0];
    expect(url).toContain("limit=20");
    const cutoffMatch = /updated_at=lt\.([^&]+)/.exec(url);
    expect(decodeURIComponent(cutoffMatch![1])).toBe("2026-04-15T23:00:00.000Z");
  });

  it("clamps minutesStale floor to 1 and limit floor to 1", async () => {
    const calls: FetchCall[] = [];
    globalThis.fetch = stubFetchOnce([], calls);

    const fixed = Date.parse("2026-04-16T00:00:00Z");
    vi.useFakeTimers();
    vi.setSystemTime(new Date(fixed));

    try {
      await selectStaleInFlightJobsForOrg("org-1", { minutesStale: 0, limit: 0 });
    } finally {
      vi.useRealTimers();
    }

    const { url } = calls[0];
    expect(url).toContain("limit=1");
    const cutoffMatch = /updated_at=lt\.([^&]+)/.exec(url);
    expect(decodeURIComponent(cutoffMatch![1])).toBe("2026-04-15T23:59:00.000Z");
  });
});

describe("selectCopilotQuotaRowsForOrg", () => {
  it("orders by period_month desc and clamps the limit for a url-unsafe org id", async () => {
    const calls: FetchCall[] = [];
    globalThis.fetch = stubFetchOnce([], calls);

    await selectCopilotQuotaRowsForOrg("org with space/slash", 9999);

    expect(calls).toHaveLength(1);
    const { url, init } = calls[0];
    expect(url).toContain("https://example.supabase.co/rest/v1/drone_org_ai_quota?");
    expect(url).toContain(`org_id=eq.${encodeURIComponent("org with space/slash")}`);
    expect(url).toContain("order=period_month.desc");
    expect(url).toContain("limit=60");
    expect(url).toContain("select=*");
    expect(init?.method).toBe("GET");
  });

  it("defaults the limit to 6 when not provided", async () => {
    const calls: FetchCall[] = [];
    globalThis.fetch = stubFetchOnce([], calls);

    await selectCopilotQuotaRowsForOrg("org-1");

    expect(calls[0].url).toContain("limit=6");
  });

  it("clamps non-positive limits to 1", async () => {
    const calls: FetchCall[] = [];
    globalThis.fetch = stubFetchOnce([], calls);

    await selectCopilotQuotaRowsForOrg("org-1", 0);

    expect(calls[0].url).toContain("limit=1");
  });

  it("returns the REST rows unchanged", async () => {
    const payload = [
      {
        id: "row-a",
        org_id: "org-1",
        period_month: "2026-04-01",
        spend_tenth_cents: 125,
        cap_tenth_cents: 50000,
        last_call_at: "2026-04-18T00:00:00Z",
        created_at: "2026-04-01T00:00:00Z",
        updated_at: "2026-04-18T00:00:00Z",
      },
    ];
    globalThis.fetch = stubFetchOnce(payload, []);
    const rows = await selectCopilotQuotaRowsForOrg("org-1", 3);
    expect(rows).toEqual(payload);
  });
});

describe("selectRecentCopilotEventsForOrg", () => {
  it("filters copilot org events by event type, orders newest first, and clamps the limit", async () => {
    const calls: FetchCall[] = [];
    globalThis.fetch = stubFetchOnce([], calls);

    await selectRecentCopilotEventsForOrg("org with space/slash", 9999);

    expect(calls).toHaveLength(1);
    const { url, init } = calls[0];
    expect(url).toContain("https://example.supabase.co/rest/v1/drone_org_events?");
    expect(url).toContain(`org_id=eq.${encodeURIComponent("org with space/slash")}`);
    expect(url).toContain("event_type=like.copilot.call.*");
    expect(url).toContain("select=*");
    expect(url).toContain("order=created_at.desc");
    expect(url).toContain("limit=500");
    expect(init?.method).toBe("GET");
  });

  it("clamps non-positive limits to 1", async () => {
    const calls: FetchCall[] = [];
    globalThis.fetch = stubFetchOnce([], calls);

    await selectRecentCopilotEventsForOrg("org-1", 0);

    expect(calls[0].url).toContain("limit=1");
  });
});

describe("selectCopilotOrgSettings", () => {
  it("selects the expected columns and encodes the org id", async () => {
    const calls: FetchCall[] = [];
    globalThis.fetch = stubFetchOnce([], calls);

    await selectCopilotOrgSettings("org with space/slash");

    expect(calls).toHaveLength(1);
    const { url, init } = calls[0];
    expect(url).toContain("https://example.supabase.co/rest/v1/drone_org_settings?");
    expect(url).toContain(`org_id=eq.${encodeURIComponent("org with space/slash")}`);
    expect(url).toContain("select=org_id,copilot_enabled,created_at,updated_at");
    expect(init?.method).toBe("GET");
  });

  it("returns the first row when one exists", async () => {
    const row = {
      org_id: "org-1",
      copilot_enabled: true,
      created_at: "2026-04-01T00:00:00Z",
      updated_at: "2026-04-18T00:00:00Z",
    };
    globalThis.fetch = stubFetchOnce([row], []);
    const result = await selectCopilotOrgSettings("org-1");
    expect(result).toEqual(row);
  });

  it("returns null when the org has no settings row yet", async () => {
    globalThis.fetch = stubFetchOnce([], []);
    const result = await selectCopilotOrgSettings("org-1");
    expect(result).toBeNull();
  });
});

describe("updateMembershipStatus", () => {
  it("selectMembershipByOrgUser GETs the org_id+user_id row", async () => {
    const calls: FetchCall[] = [];
    const row = {
      org_id: "org-1",
      user_id: "user-1",
      role: "viewer",
      status: "active",
      created_at: "x",
    };
    globalThis.fetch = stubFetchOnce([row], calls);

    const result = await selectMembershipByOrgUser("org with space/slash", "user/id?");

    expect(result).toEqual(row);
    expect(calls).toHaveLength(1);
    const { url, init } = calls[0];
    expect(url).toContain(`org_id=eq.${encodeURIComponent("org with space/slash")}`);
    expect(url).toContain(`user_id=eq.${encodeURIComponent("user/id?")}`);
    expect(url).toContain("select=*");
    expect(init?.method).toBe("GET");
  });

  it("insertMembership POSTs a new membership without merge-duplicates", async () => {
    const calls: FetchCall[] = [];
    const row = {
      org_id: "org-1",
      user_id: "user-1",
      role: "viewer",
      status: "active",
      created_at: "x",
    };
    globalThis.fetch = stubFetchOnce([row], calls);

    const result = await insertMembership({
      org_id: "org-1",
      user_id: "user-1",
      role: "viewer",
      status: "active",
    });

    expect(result).toEqual(row);
    expect(calls).toHaveLength(1);
    const { url, init } = calls[0];
    expect(url).toContain("drone_memberships?select=*");
    expect(init?.method).toBe("POST");
    expect(String((init?.headers as Record<string, string>).Prefer)).not.toContain(
      "merge-duplicates",
    );
    expect(init?.body).toBe(
      JSON.stringify({
        org_id: "org-1",
        user_id: "user-1",
        role: "viewer",
        status: "active",
      }),
    );
  });

  it("PATCHes the org_id+user_id row and sends the status payload", async () => {
    const calls: FetchCall[] = [];
    globalThis.fetch = stubFetchOnce(
      [{ org_id: "o", user_id: "u", role: "viewer", status: "suspended", created_at: "x" }],
      calls,
    );

    await updateMembershipStatus("org with space/slash", "user/id?", { status: "suspended" });

    expect(calls).toHaveLength(1);
    const { url, init } = calls[0];
    expect(url).toContain(`org_id=eq.${encodeURIComponent("org with space/slash")}`);
    expect(url).toContain(`user_id=eq.${encodeURIComponent("user/id?")}`);
    expect(url).toContain("select=*");
    expect(init?.method).toBe("PATCH");
    expect(init?.body).toBe(JSON.stringify({ status: "suspended" }));
  });

  it("returns null when no row matches", async () => {
    globalThis.fetch = stubFetchOnce([], []);
    const result = await updateMembershipStatus("org-1", "user-1", { status: "active" });
    expect(result).toBeNull();
  });
});

describe("invitations", () => {
  it("insertInvitation POSTs the invitation fields and returns the row", async () => {
    const calls: FetchCall[] = [];
    const created = {
      id: "inv-1",
      org_id: "org-1",
      email: "x@y.com",
      role: "viewer" as const,
      invited_by: "user-1",
      status: "pending" as const,
      token: "tkn",
      created_at: "2026-04-19T00:00:00Z",
      expires_at: "2026-05-03T00:00:00Z",
      accepted_at: null,
      accepted_by: null,
    };
    globalThis.fetch = stubFetchOnce([created], calls);

    const row = await insertInvitation({
      org_id: "org-1",
      email: "x@y.com",
      role: "viewer",
      invited_by: "user-1",
      token: "tkn",
    });

    expect(calls).toHaveLength(1);
    const { url, init } = calls[0];
    expect(url).toContain("drone_invitations?select=*");
    expect(init?.method).toBe("POST");
    expect(init?.body).toContain('"org_id":"org-1"');
    expect(init?.body).toContain('"token":"tkn"');
    expect(row).toEqual(created);
  });

  it("selectInvitationsForOrg orders by created_at desc and encodes the org id", async () => {
    const calls: FetchCall[] = [];
    globalThis.fetch = stubFetchOnce([], calls);

    await selectInvitationsForOrg("org with space/slash");

    expect(calls).toHaveLength(1);
    const { url, init } = calls[0];
    expect(url).toContain(`org_id=eq.${encodeURIComponent("org with space/slash")}`);
    expect(url).toContain("order=created_at.desc");
    expect(init?.method).toBe("GET");
  });

  it("selectInvitationByToken returns the first row or null", async () => {
    const row = {
      id: "inv-1",
      org_id: "org-1",
      email: "x@y.com",
      role: "viewer" as const,
      invited_by: "u",
      status: "pending" as const,
      token: "abc",
      created_at: "x",
      expires_at: "y",
      accepted_at: null,
      accepted_by: null,
    };
    globalThis.fetch = stubFetchOnce([row], []);
    expect(await selectInvitationByToken("abc")).toEqual(row);

    globalThis.fetch = stubFetchOnce([], []);
    expect(await selectInvitationByToken("missing")).toBeNull();
  });

  it("updateInvitationStatus PATCHes the row scoped by id+org_id and forwards the patch", async () => {
    const calls: FetchCall[] = [];
    globalThis.fetch = stubFetchOnce([], calls);

    await updateInvitationStatus("inv-1", "org-1", {
      status: "accepted",
      accepted_at: "2026-04-19T00:00:00Z",
      accepted_by: "user-1",
    });

    expect(calls).toHaveLength(1);
    const { url, init } = calls[0];
    expect(url).toContain(`id=eq.${encodeURIComponent("inv-1")}`);
    expect(url).toContain(`org_id=eq.${encodeURIComponent("org-1")}`);
    expect(url).toContain("select=*");
    expect(init?.method).toBe("PATCH");
    expect(init?.body).toContain('"status":"accepted"');
    expect(init?.body).toContain('"accepted_by":"user-1"');
  });

  it("updateInvitationStatus returns null when the (id, org_id) pair does not match any row", async () => {
    // Simulates an admin of org-A submitting an invitationId belonging to org-B:
    // PostgREST filters on id=X AND org_id=Y, no row matches, no UPDATE fires.
    const calls: FetchCall[] = [];
    globalThis.fetch = stubFetchOnce([], calls);

    const result = await updateInvitationStatus("inv-belongs-to-other-org", "attacker-org", {
      status: "revoked",
    });

    expect(result).toBeNull();
    expect(calls).toHaveLength(1);
    const { url } = calls[0];
    expect(url).toContain(`id=eq.${encodeURIComponent("inv-belongs-to-other-org")}`);
    expect(url).toContain(`org_id=eq.${encodeURIComponent("attacker-org")}`);
  });
});

describe("insertOrgEvent", () => {
  it("POSTs to drone_org_events with the event payload", async () => {
    const calls: FetchCall[] = [];
    globalThis.fetch = stubFetchOnce([], calls);

    await insertOrgEvent({
      org_id: "org-1",
      actor_user_id: "user-1",
      event_type: "org.member.invited",
      payload: { email: "x@y.com", role: "viewer" },
    });

    expect(calls).toHaveLength(1);
    const { url, init } = calls[0];
    expect(url).toContain("drone_org_events");
    expect(init?.method).toBe("POST");
    expect(init?.body).toContain('"event_type":"org.member.invited"');
  });
});

describe("updateArtifactComment", () => {
  it("PATCHes comment resolution scoped by id, org_id, and artifact_id", async () => {
    const calls: FetchCall[] = [];
    globalThis.fetch = stubFetchOnce([], calls);

    await updateArtifactComment({
      id: "comment/id?",
      orgId: "org with space/slash",
      artifactId: "artifact/id?",
      patch: { resolved_at: "2026-04-20T00:00:00.000Z" },
    });

    expect(calls).toHaveLength(1);
    const { url, init } = calls[0];
    expect(url).toContain(`id=eq.${encodeURIComponent("comment/id?")}`);
    expect(url).toContain(`org_id=eq.${encodeURIComponent("org with space/slash")}`);
    expect(url).toContain(`artifact_id=eq.${encodeURIComponent("artifact/id?")}`);
    expect(url).toContain("select=*");
    expect(init?.method).toBe("PATCH");
    expect(init?.body).toBe(
      JSON.stringify({ resolved_at: "2026-04-20T00:00:00.000Z" }),
    );
  });
});
