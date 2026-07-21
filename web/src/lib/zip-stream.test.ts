import { zipSync } from "fflate";
import { describe, expect, it } from "vitest";

import { streamZipImages } from "./zip-extraction";
import { processZipStream } from "./zip-stream";

function toStream(bytes: Uint8Array, chunkSize = 7): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (let i = 0; i < bytes.length; i += chunkSize) {
        controller.enqueue(bytes.slice(i, i + chunkSize));
      }
      controller.close();
    },
  });
}

describe("processZipStream", () => {
  it("hands filtered entries to the handler as they complete", async () => {
    const zip = zipSync({
      "keep/a.txt": new Uint8Array([1, 2, 3]),
      "skip/b.txt": new Uint8Array([4, 5]),
      "keep/c.txt": new Uint8Array([6]),
    });

    const seen: Array<{ name: string; length: number }> = [];
    const result = await processZipStream(toStream(zip), {
      filter: (name) => name.startsWith("keep/"),
      handle: (entry) => {
        seen.push({ name: entry.name, length: entry.bytes.length });
      },
    });

    expect(result.entryCount).toBe(3);
    expect(result.processedCount).toBe(2);
    expect(seen.map((s) => s.name).sort()).toEqual(["keep/a.txt", "keep/c.txt"]);
    expect(seen.find((s) => s.name === "keep/a.txt")?.length).toBe(3);
  });

  it("reassembles entries fed in tiny chunks", async () => {
    const payload = new Uint8Array(10_000).map((_, i) => i % 251);
    const zip = zipSync({ "data.bin": payload });

    let received: Uint8Array | null = null;
    await processZipStream(toStream(zip, 3), {
      filter: () => true,
      handle: (entry) => {
        received = entry.bytes;
      },
    });

    expect(received).not.toBeNull();
    expect(Array.from(received!)).toEqual(Array.from(payload));
  });

  it("awaits the handler before continuing (backpressure ordering)", async () => {
    const zip = zipSync({
      "a.txt": new Uint8Array([1]),
      "b.txt": new Uint8Array([2]),
    });
    const order: string[] = [];
    await processZipStream(toStream(zip), {
      filter: () => true,
      handle: async (entry) => {
        order.push(`start:${entry.name}`);
        await new Promise((resolve) => setTimeout(resolve, 5));
        order.push(`end:${entry.name}`);
      },
    });
    expect(order).toEqual(["start:a.txt", "end:a.txt", "start:b.txt", "end:b.txt"]);
  });
});

describe("streamZipImages", () => {
  it("applies sanitization, image filtering, and first-wins dedupe", async () => {
    const zip = zipSync({
      "DJI_0001.JPG": new Uint8Array([1, 2]),
      "nested/DJI_0002.jpg": new Uint8Array([3]),
      "nested/deeper/DJI_0002.jpg": new Uint8Array([9, 9]),
      "../evil.jpg": new Uint8Array([7]),
      "notes.txt": new Uint8Array([8]),
      "empty.jpg": new Uint8Array(0),
    });

    const names: string[] = [];
    const { imageCount } = await streamZipImages(toStream(zip), (image) => {
      names.push(image.name);
    });

    expect(imageCount).toBe(2);
    expect(names.sort()).toEqual(["DJI_0001.JPG", "DJI_0002.jpg"]);
  });
});
