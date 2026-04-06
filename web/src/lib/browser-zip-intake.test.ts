import { describe, expect, it } from "vitest";

import {
  buildBrowserZipIntakeDraft,
  buildBrowserZipStoragePath,
  isZipFilename,
} from "./browser-zip-intake";

describe("isZipFilename", () => {
  it("accepts zip filenames case-insensitively", () => {
    expect(isZipFilename("mission-batch.zip")).toBe(true);
    expect(isZipFilename("MISSION-BATCH.ZIP")).toBe(true);
  });

  it("rejects missing or non-zip filenames", () => {
    expect(isZipFilename("")).toBe(false);
    expect(isZipFilename("mission-batch.rar")).toBe(false);
    expect(isZipFilename(null)).toBe(false);
  });
});

describe("buildBrowserZipIntakeDraft", () => {
  it("builds truthful browser-zip defaults without implying upload happened", () => {
    const draft = buildBrowserZipIntakeDraft({
      missionName: "Grass Valley downtown curb inventory",
      filename: "gv-downtown.zip",
    });

    expect(draft.sessionLabel).toBe("Grass Valley downtown curb inventory browser ZIP intake · gv-downtown.zip");
    expect(draft.sourceType).toBe("browser_zip");
    expect(draft.status).toBe("zip_received");
    expect(draft.reviewBundleReady).toBe(false);
    expect(draft.truthfulPass).toBeNull();
    expect(draft.notes).toContain("durable upload/storage, extraction, and ODM orchestration have not run yet");
    expect(draft.metadata).toEqual({
      intakeMode: "browser_file_picker",
      uploadPersisted: false,
      extractionStarted: false,
      orchestrationStarted: false,
      storagePath: null,
    });
  });

  it("records storage-backed browser uploads honestly without implying processing ran", () => {
    const draft = buildBrowserZipIntakeDraft({
      missionName: "Grass Valley downtown curb inventory",
      filename: "gv-downtown.zip",
      uploadPersisted: true,
      storagePath: "org/mission-intake/mission-123/20260406165000-gv-downtown.zip",
    });

    expect(draft.status).toBe("zip_uploaded");
    expect(draft.notes).toContain("managed intake storage");
    expect(draft.notes).toContain("Extraction, benchmarking, and ODM orchestration have not run yet");
    expect(draft.metadata).toEqual({
      intakeMode: "browser_file_picker",
      uploadPersisted: true,
      extractionStarted: false,
      orchestrationStarted: false,
      storagePath: "org/mission-intake/mission-123/20260406165000-gv-downtown.zip",
    });
  });

  it("normalizes whitespace in mission names and filenames", () => {
    const draft = buildBrowserZipIntakeDraft({
      missionName: "  Colgate   slope   baseline ",
      filename: "  colgate-phase-1.zip  ",
    });

    expect(draft.sessionLabel).toBe("Colgate slope baseline browser ZIP intake · colgate-phase-1.zip");
  });
});

describe("buildBrowserZipStoragePath", () => {
  it("creates a stable storage path for managed mission intake uploads", () => {
    expect(buildBrowserZipStoragePath({
      orgSlug: "Nat Ford Planning",
      missionId: "Mission 123",
      filename: "GV Downtown Final Batch.ZIP",
      uploadedAt: "2026-04-06T16:50:00.000Z",
    })).toBe("nat-ford-planning/mission-intake/mission-123/20260406165000-gv-downtown-final-batch.zip");
  });
});
