import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/admin-storage", () => ({
  createSignedDownloadUrl: vi.fn(async ({ bucket, path }: { bucket: string; path: string }) => `https://signed.example/${bucket}/${path}`),
}));

import { parseStorageDownloadRef, tryCreateSignedDownloadUrl } from "./storage-delivery";

describe("parseStorageDownloadRef", () => {
  it("uses explicit bucket and path when both are present", () => {
    expect(parseStorageDownloadRef({ bucket: "drone-ops", path: "org/jobs/job-1/orthomosaic.tif" })).toEqual({
      bucket: "drone-ops",
      path: "org/jobs/job-1/orthomosaic.tif",
    });
  });

  it("parses a combined bucket/path reference", () => {
    expect(parseStorageDownloadRef({ path: "drone-ops/org/jobs/job-1/review-bundle.zip" })).toEqual({
      bucket: "drone-ops",
      path: "org/jobs/job-1/review-bundle.zip",
    });
  });

  it("rejects local filesystem paths and URLs", () => {
    expect(parseStorageDownloadRef({ path: "/tmp/review-bundle.zip" })).toBeNull();
    expect(parseStorageDownloadRef({ path: "https://example.com/file.zip" })).toBeNull();
    expect(parseStorageDownloadRef({ bucket: "drone-ops", path: "/tmp/file.tif" })).toBeNull();
  });
});

describe("tryCreateSignedDownloadUrl", () => {
  it("returns a signed URL for a valid storage reference", async () => {
    await expect(tryCreateSignedDownloadUrl({ bucket: "drone-ops", path: "org/jobs/job-1/orthomosaic.tif" })).resolves.toBe(
      "https://signed.example/drone-ops/org/jobs/job-1/orthomosaic.tif",
    );
  });

  it("returns null when the reference is not a storage object", async () => {
    await expect(tryCreateSignedDownloadUrl({ path: "/tmp/local-file.tif" })).resolves.toBeNull();
  });
});
