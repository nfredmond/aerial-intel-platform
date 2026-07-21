import { describe, expect, it } from "vitest";

import { planExternalCallback } from "./external-processing-callbacks";

function row(overrides: Partial<{ last_callback_status: string | null; last_callback_progress: number | null }> = {}) {
  return {
    last_callback_status: null,
    last_callback_progress: null,
    ...overrides,
  };
}

describe("planExternalCallback", () => {
  it("emits the first running callback for an in-flight job", () => {
    const plan = planExternalCallback(row({ last_callback_status: "accepted" }), {
      status: "running",
      output_summary: {
        latestCheckpoint: "Imagery ingested (12 images); NodeODM task queued",
        nodeodm: { progress: 0 },
      },
    });
    expect(plan).toEqual({
      status: "running",
      progress: 0,
      message: "Imagery ingested (12 images); NodeODM task queued",
      terminal: false,
    });
  });

  it("stays quiet while running progress is unchanged, re-emits when it moves", () => {
    const unchanged = planExternalCallback(
      row({ last_callback_status: "running", last_callback_progress: 40 }),
      { status: "running", output_summary: { nodeodm: { progress: 40 } } },
    );
    expect(unchanged).toBeNull();

    const moved = planExternalCallback(
      row({ last_callback_status: "running", last_callback_progress: 40 }),
      { status: "running", output_summary: { nodeodm: { progress: 55, statusName: "running" } } },
    );
    expect(moved).toMatchObject({ status: "running", progress: 55, terminal: false });
  });

  it("treats queued and needs_review as still running for the consumer", () => {
    expect(
      planExternalCallback(row({ last_callback_status: "accepted" }), {
        status: "queued",
        output_summary: {},
      }),
    ).toMatchObject({ status: "running", terminal: false });
    expect(
      planExternalCallback(row({ last_callback_status: "accepted" }), {
        status: "needs_review",
        output_summary: {},
      }),
    ).toMatchObject({ status: "running", terminal: false });
  });

  it("emits terminal callbacks for succeeded, failed, and canceled jobs", () => {
    expect(
      planExternalCallback(row({ last_callback_status: "running", last_callback_progress: 90 }), {
        status: "succeeded",
        output_summary: {},
      }),
    ).toEqual({ status: "succeeded", progress: 100, message: null, terminal: true });

    expect(
      planExternalCallback(row({ last_callback_status: "running" }), {
        status: "failed",
        output_summary: { nodeodm: { lastUploadError: "upload exploded" } },
      }),
    ).toEqual({ status: "failed", progress: null, message: "upload exploded", terminal: true });

    expect(
      planExternalCallback(row(), { status: "canceled", output_summary: {} }),
    ).toMatchObject({ status: "canceled", terminal: true });
  });

  it("prefers the NodeODM status message for failures", () => {
    const plan = planExternalCallback(row(), {
      status: "failed",
      output_summary: {
        nodeodm: { statusMessage: "Cannot process dataset", lastImportError: "later error" },
      },
    });
    expect(plan?.message).toBe("Cannot process dataset");
  });

  it("never re-emits after a terminal callback was delivered", () => {
    for (const delivered of ["succeeded", "failed", "canceled"]) {
      expect(
        planExternalCallback(row({ last_callback_status: delivered }), {
          status: "succeeded",
          output_summary: {},
        }),
      ).toBeNull();
    }
  });
});
