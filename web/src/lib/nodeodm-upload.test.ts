import { describe, expect, it } from "vitest";

import {
  buildUploadCheckpointPatch,
  computeBatchSlice,
  extractNodeOdmUploadCursor,
  isImageFilename,
  pickLatestSessionByMission,
  shouldEscalateFailure,
  UPLOAD_BATCH_CAP,
} from "./nodeodm-upload";

describe("isImageFilename", () => {
  it("accepts common drone image extensions", () => {
    expect(isImageFilename("DJI_0001.jpg")).toBe(true);
    expect(isImageFilename("frame.JPEG")).toBe(true);
    expect(isImageFilename("top.PNG")).toBe(true);
    expect(isImageFilename("ortho.tif")).toBe(true);
    expect(isImageFilename("ortho.tiff")).toBe(true);
  });

  it("rejects sidecars and non-images", () => {
    expect(isImageFilename("DJI_0001.xmp")).toBe(false);
    expect(isImageFilename("index.json")).toBe(false);
    expect(isImageFilename("no-extension")).toBe(false);
    expect(isImageFilename(".hiddenfile")).toBe(false);
  });
});

describe("extractNodeOdmUploadCursor", () => {
  const baseRow = {
    id: "job-1",
    org_id: "org-1",
    mission_id: "mission-1",
    status: "running",
    stage: "intake_review",
    output_summary: {
      nodeodm: {
        taskUuid: "task-abc",
        uploadState: "pending",
      },
    },
  };

  it("returns null when taskUuid is missing", () => {
    const cursor = extractNodeOdmUploadCursor({
      ...baseRow,
      output_summary: { nodeodm: { uploadState: "pending" } },
    });
    expect(cursor).toBeNull();
  });

  it("defaults uploadState to pending when absent", () => {
    const cursor = extractNodeOdmUploadCursor({
      ...baseRow,
      output_summary: { nodeodm: { taskUuid: "task-abc" } },
    });
    expect(cursor?.uploadState).toBe("pending");
  });

  it("skips committed and failed cursors", () => {
    const committed = extractNodeOdmUploadCursor({
      ...baseRow,
      output_summary: { nodeodm: { taskUuid: "task-abc", uploadState: "committed" } },
    });
    const failed = extractNodeOdmUploadCursor({
      ...baseRow,
      output_summary: { nodeodm: { taskUuid: "task-abc", uploadState: "failed" } },
    });
    expect(committed).toBeNull();
    expect(failed).toBeNull();
  });

  it("pulls uploadedCount, totalCount, and retryCount", () => {
    const cursor = extractNodeOdmUploadCursor({
      ...baseRow,
      output_summary: {
        nodeodm: {
          taskUuid: "task-abc",
          uploadState: "uploading",
          uploadedCount: 20,
          totalCount: 75,
          uploadRetryCount: 2,
        },
      },
    });
    expect(cursor).toMatchObject({
      uploadState: "uploading",
      uploadedCount: 20,
      totalCount: 75,
      retryCount: 2,
    });
  });
});

describe("pickLatestSessionByMission", () => {
  it("keeps only the latest session per mission by updated_at", () => {
    const byMission = pickLatestSessionByMission([
      { id: "s1", mission_id: "m1", extracted_dataset_path: "a", updated_at: "2026-01-01" },
      { id: "s2", mission_id: "m1", extracted_dataset_path: "b", updated_at: "2026-02-01" },
      { id: "s3", mission_id: "m2", extracted_dataset_path: "c", updated_at: "2026-03-01" },
    ]);
    expect(byMission.get("m1")?.id).toBe("s2");
    expect(byMission.get("m2")?.id).toBe("s3");
  });

  it("ignores sessions with null extracted_dataset_path", () => {
    const byMission = pickLatestSessionByMission([
      { id: "s1", mission_id: "m1", extracted_dataset_path: null, updated_at: "2026-01-01" },
    ]);
    expect(byMission.size).toBe(0);
  });
});

describe("computeBatchSlice", () => {
  it("handles a 13-image dataset in a single tick with 2 chunks of 10/3", () => {
    const slice = computeBatchSlice({ uploadedCount: 0, totalCount: 13 });
    expect(slice.offset).toBe(0);
    expect(slice.sliceEnd).toBe(13);
    expect(slice.isFinalBatch).toBe(true);
    expect(slice.chunks).toEqual([
      { start: 0, end: 10 },
      { start: 10, end: 13 },
    ]);
  });

  it("caps at 50 per tick for a 75-image dataset (first tick)", () => {
    const slice = computeBatchSlice({ uploadedCount: 0, totalCount: 75 });
    expect(slice.sliceEnd).toBe(50);
    expect(slice.isFinalBatch).toBe(false);
    expect(slice.chunks).toHaveLength(5);
    expect(slice.chunks[0]).toEqual({ start: 0, end: 10 });
    expect(slice.chunks[4]).toEqual({ start: 40, end: 50 });
  });

  it("picks up from offset 50 and finishes on tick 2", () => {
    const slice = computeBatchSlice({ uploadedCount: 50, totalCount: 75 });
    expect(slice.offset).toBe(50);
    expect(slice.sliceEnd).toBe(75);
    expect(slice.isFinalBatch).toBe(true);
    expect(slice.chunks).toEqual([
      { start: 50, end: 60 },
      { start: 60, end: 70 },
      { start: 70, end: 75 },
    ]);
  });

  it("returns an empty slice when fully uploaded", () => {
    const slice = computeBatchSlice({ uploadedCount: 75, totalCount: 75 });
    expect(slice.sliceEnd).toBe(75);
    expect(slice.isFinalBatch).toBe(true);
    expect(slice.chunks).toEqual([]);
  });

  it("honors custom batchCap", () => {
    const slice = computeBatchSlice({ uploadedCount: 0, totalCount: 100, batchCap: 25 });
    expect(slice.sliceEnd).toBe(25);
    expect(slice.isFinalBatch).toBe(false);
  });

  it("UPLOAD_BATCH_CAP is 50 per the Gap 1 plan default", () => {
    expect(UPLOAD_BATCH_CAP).toBe(50);
  });
});

describe("shouldEscalateFailure", () => {
  it("returns false before the threshold", () => {
    expect(shouldEscalateFailure({ retryCount: 0 })).toBe(false);
    expect(shouldEscalateFailure({ retryCount: 2 })).toBe(false);
  });

  it("returns true at and above the threshold", () => {
    expect(shouldEscalateFailure({ retryCount: 3 })).toBe(true);
    expect(shouldEscalateFailure({ retryCount: 4 })).toBe(true);
  });

  it("honors custom threshold", () => {
    expect(shouldEscalateFailure({ retryCount: 4, threshold: 5 })).toBe(false);
    expect(shouldEscalateFailure({ retryCount: 5, threshold: 5 })).toBe(true);
  });
});

describe("buildUploadCheckpointPatch", () => {
  it("preserves sibling fields in output_summary (dispatchAdapter, etc.)", () => {
    const prior = {
      workflowMode: "managed_processing_v1",
      dispatchAdapter: { status: "accepted" },
      nodeodm: { taskUuid: "t-1", presetId: "balanced" },
    };
    const patch = buildUploadCheckpointPatch({
      priorSummary: prior,
      uploadState: "uploading",
      uploadedCount: 10,
      totalCount: 13,
      retryCount: 0,
      lastUploadAttemptAt: "2026-04-17T00:00:00.000Z",
    });
    expect(patch.output_summary.workflowMode).toBe("managed_processing_v1");
    expect((patch.output_summary.dispatchAdapter as Record<string, unknown>).status).toBe("accepted");
    expect(patch.output_summary.nodeodm).toMatchObject({
      taskUuid: "t-1",
      presetId: "balanced",
      uploadState: "uploading",
      uploadedCount: 10,
      totalCount: 13,
      uploadRetryCount: 0,
      lastUploadAttemptAt: "2026-04-17T00:00:00.000Z",
    });
  });

  it("writes lastUploadError when provided", () => {
    const patch = buildUploadCheckpointPatch({
      priorSummary: { nodeodm: { taskUuid: "t-1" } },
      uploadState: "uploading",
      uploadedCount: 5,
      totalCount: 75,
      retryCount: 1,
      lastUploadAttemptAt: "2026-04-17T00:00:00.000Z",
      lastUploadError: "boom",
    });
    expect((patch.output_summary.nodeodm as Record<string, unknown>).lastUploadError).toBe("boom");
  });

  it("writes uploadCommittedAt when provided", () => {
    const patch = buildUploadCheckpointPatch({
      priorSummary: { nodeodm: { taskUuid: "t-1" } },
      uploadState: "committed",
      uploadedCount: 13,
      totalCount: 13,
      retryCount: 0,
      lastUploadAttemptAt: "2026-04-17T00:00:00.000Z",
      committedAt: "2026-04-17T00:00:01.000Z",
    });
    expect((patch.output_summary.nodeodm as Record<string, unknown>).uploadCommittedAt).toBe(
      "2026-04-17T00:00:01.000Z",
    );
  });
});
