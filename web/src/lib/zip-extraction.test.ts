// @vitest-environment node
import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";

import { parseZipToImages, sanitizeStorageFilename } from "./zip-extraction";

describe("sanitizeStorageFilename", () => {
  it("returns basename for nested paths", () => {
    expect(sanitizeStorageFilename("images/DJI_0001.jpg")).toBe("DJI_0001.jpg");
    expect(sanitizeStorageFilename("a/b/c/photo.JPG")).toBe("photo.JPG");
  });

  it("normalizes backslash separators", () => {
    expect(sanitizeStorageFilename("images\\nested\\top.png")).toBe("top.png");
  });

  it("rejects traversal-only segments", () => {
    expect(sanitizeStorageFilename("..")).toBeNull();
    expect(sanitizeStorageFilename("./")).toBeNull();
    expect(sanitizeStorageFilename("images/..")).toBeNull();
  });

  it("rejects empty or whitespace-only", () => {
    expect(sanitizeStorageFilename("")).toBeNull();
    expect(sanitizeStorageFilename("   ")).toBeNull();
  });

  it("rejects null bytes", () => {
    expect(sanitizeStorageFilename("image\0.jpg")).toBeNull();
  });
});

describe("parseZipToImages", () => {
  function zipOf(entries: Record<string, Uint8Array | string>): Uint8Array {
    const asBytes: Record<string, Uint8Array> = {};
    for (const [k, v] of Object.entries(entries)) {
      asBytes[k] = typeof v === "string" ? strToU8(v) : v;
    }
    return zipSync(asBytes);
  }

  it("returns images in sorted order", () => {
    const zip = zipOf({
      "DJI_0002.jpg": new Uint8Array([1, 2]),
      "DJI_0001.jpg": new Uint8Array([3, 4]),
      "DJI_0003.jpg": new Uint8Array([5, 6]),
    });
    const images = parseZipToImages(zip);
    expect(images.map((i) => i.name)).toEqual(["DJI_0001.jpg", "DJI_0002.jpg", "DJI_0003.jpg"]);
  });

  it("flattens nested images/ prefix", () => {
    const zip = zipOf({
      "images/DJI_0001.jpg": new Uint8Array([1]),
      "images/subdir/DJI_0002.jpg": new Uint8Array([2]),
    });
    const images = parseZipToImages(zip);
    expect(images.map((i) => i.name)).toEqual(["DJI_0001.jpg", "DJI_0002.jpg"]);
  });

  it("filters out non-image entries and empty files", () => {
    const zip = zipOf({
      "DJI_0001.jpg": new Uint8Array([1]),
      "notes.txt": "not an image",
      "sidecar.xmp": "<xmp/>",
      "empty.png": new Uint8Array([]),
    });
    const images = parseZipToImages(zip);
    expect(images.map((i) => i.name)).toEqual(["DJI_0001.jpg"]);
  });

  it("dedupes by basename, keeping the first occurrence", () => {
    const zip = zipOf({
      "images/DJI_0001.jpg": new Uint8Array([1, 1, 1]),
      "backup/DJI_0001.jpg": new Uint8Array([2, 2, 2]),
    });
    const images = parseZipToImages(zip);
    expect(images).toHaveLength(1);
    expect(images[0].bytes).toEqual(new Uint8Array([1, 1, 1]));
  });

  it("rejects path-traversal entries", () => {
    const zip = zipOf({
      "../evil.jpg": new Uint8Array([1]),
      "DJI_0001.jpg": new Uint8Array([2]),
    });
    const images = parseZipToImages(zip);
    expect(images.map((i) => i.name)).toEqual(["DJI_0001.jpg"]);
  });

  it("returns empty list for an empty zip", () => {
    const zip = zipOf({});
    expect(parseZipToImages(zip)).toEqual([]);
  });

  it("accepts the full image extension set", () => {
    const zip = zipOf({
      "a.JPG": new Uint8Array([1]),
      "b.jpeg": new Uint8Array([2]),
      "c.PNG": new Uint8Array([3]),
      "d.tif": new Uint8Array([4]),
      "e.tiff": new Uint8Array([5]),
    });
    const images = parseZipToImages(zip);
    expect(images).toHaveLength(5);
  });
});
