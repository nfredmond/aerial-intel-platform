import { beforeEach, describe, expect, it, vi } from "vitest";

const insertOrgEventMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/admin", () => ({
  insertOrgEvent: insertOrgEventMock,
}));

import { recordCopilotAuditEvent, recordCopilotAuditEventSafely } from "./audit";

beforeEach(() => {
  insertOrgEventMock.mockReset();
  insertOrgEventMock.mockResolvedValue(undefined);
});

describe("recordCopilotAuditEvent", () => {
  it.each([
    ["ok", "copilot.call.succeeded"],
    ["refused", "copilot.call.refused"],
    ["blocked", "copilot.call.blocked"],
    ["error", "copilot.call.failed"],
  ] as const)("maps %s status to %s", async (status, eventType) => {
    await recordCopilotAuditEvent({
      orgId: "org-1",
      actorUserId: "user-1",
      skill: "support-assistant",
      targetType: "support",
      status,
    });

    expect(insertOrgEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        org_id: "org-1",
        actor_user_id: "user-1",
        event_type: eventType,
        payload: expect.objectContaining({
          skill: "support-assistant",
          status,
          targetType: "support",
        }),
      }),
    );
  });

  it("records spend, grounding, token, and quota context in the payload", async () => {
    await recordCopilotAuditEvent({
      orgId: "org-1",
      actorUserId: null,
      skill: "processing-qa",
      targetType: "job",
      targetId: "job-1",
      status: "refused",
      reason: "too-many-dropped",
      modelId: "anthropic/claude-haiku-4.5",
      spendTenthCents: 14,
      totalSentences: 5,
      keptSentences: 2,
      droppedSentences: 3,
      citedFactCount: 4,
      inputTokens: 1200,
      outputTokens: 180,
      capTenthCents: 50000,
      remainingTenthCents: 49986,
    });

    expect(insertOrgEventMock).toHaveBeenCalledWith({
      org_id: "org-1",
      actor_user_id: null,
      event_type: "copilot.call.refused",
      payload: {
        skill: "processing-qa",
        status: "refused",
        targetType: "job",
        targetId: "job-1",
        reason: "too-many-dropped",
        modelId: "anthropic/claude-haiku-4.5",
        spendTenthCents: 14,
        totalSentences: 5,
        keptSentences: 2,
        droppedSentences: 3,
        citedFactCount: 4,
        inputTokens: 1200,
        outputTokens: 180,
        capTenthCents: 50000,
        remainingTenthCents: 49986,
      },
    });
  });
});

describe("recordCopilotAuditEventSafely", () => {
  it("swallows audit write failures", async () => {
    insertOrgEventMock.mockRejectedValueOnce(new Error("network down"));

    await expect(
      recordCopilotAuditEventSafely({
        orgId: "org-1",
        skill: "report-summary",
        targetType: "artifact",
        targetId: "artifact-1",
        status: "error",
        reason: "model timeout",
      }),
    ).resolves.toBeUndefined();
  });
});
