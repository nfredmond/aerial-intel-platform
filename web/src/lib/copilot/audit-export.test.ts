import { describe, expect, it } from "vitest";

import type { OrgEventRow } from "@/lib/supabase/admin";

import { buildCopilotAuditCsv, copilotAuditFilename } from "./audit-export";

function row(overrides: Partial<OrgEventRow> = {}): OrgEventRow {
  return {
    id: "event-1",
    org_id: "org-1",
    actor_user_id: "user-1",
    event_type: "copilot.call.succeeded",
    created_at: "2026-04-20T08:00:00.000Z",
    payload: {
      skill: "support-assistant",
      status: "ok",
      targetType: "support",
      targetId: null,
      reason: null,
      modelId: "anthropic/claude-haiku-4.5",
      spendTenthCents: 14,
      totalSentences: 4,
      keptSentences: 4,
      droppedSentences: 0,
      citedFactCount: 3,
      inputTokens: 900,
      outputTokens: 120,
      capTenthCents: null,
      remainingTenthCents: null,
    },
    ...overrides,
  };
}

describe("buildCopilotAuditCsv", () => {
  it("flattens copilot audit events into a reviewer-friendly csv", () => {
    const csv = buildCopilotAuditCsv([row()]);

    expect(csv).toContain(
      "created_at,event_type,actor_user_id,skill,status,target_type,target_id,reason,model_id",
    );
    expect(csv).toContain(
      "2026-04-20T08:00:00.000Z,copilot.call.succeeded,user-1,support-assistant,ok,support,,,anthropic/claude-haiku-4.5,14,4,4,0,3,900,120,,",
    );
    expect(csv.endsWith("\r\n")).toBe(true);
  });

  it("escapes commas, quotes, and newlines", () => {
    const csv = buildCopilotAuditCsv([
      row({
        actor_user_id: null,
        payload: {
          skill: "report-summary",
          status: "error",
          targetType: "artifact",
          targetId: "artifact-1",
          reason: "model said \"wait\",\nthen failed",
        },
      }),
    ]);

    expect(csv).toContain('"model said ""wait"",\nthen failed"');
    expect(csv).toContain("copilot.call.succeeded,,report-summary,error,artifact,artifact-1");
  });
});

describe("copilotAuditFilename", () => {
  it("uses a stable org slug and iso date", () => {
    expect(
      copilotAuditFilename({
        orgSlug: "Nat Ford Drone Lab!",
        now: new Date("2026-04-20T12:00:00.000Z"),
      }),
    ).toBe("aerial-copilot-audit-nat-ford-drone-lab-2026-04-20.csv");
  });
});
