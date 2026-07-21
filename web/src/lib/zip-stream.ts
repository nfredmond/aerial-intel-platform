import { Unzip, UnzipInflate } from "fflate";

export type ZipStreamEntry = { name: string; bytes: Uint8Array };

function concatChunks(chunks: Uint8Array[]): Uint8Array {
  if (chunks.length === 1) return chunks[0];
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged;
}

/**
 * Stream-process a ZIP archive: each entry accepted by `filter` is handed to
 * `handle` as soon as it is fully inflated, then released. Peak memory is the
 * largest accepted entry plus the inflate window — not the archive plus every
 * extracted file, which is what the previous arrayBuffer()+unzipSync approach
 * held and what made multi-GB drone bundles fatal on serverless.
 *
 * `handle` is awaited before more input is fed to the inflater, so a slow
 * downstream (e.g. a storage upload) applies backpressure to the source.
 */
export async function processZipStream(
  stream: ReadableStream<Uint8Array>,
  options: {
    filter: (entryName: string) => boolean;
    handle: (entry: ZipStreamEntry) => Promise<void> | void;
  },
): Promise<{ processedCount: number; entryCount: number }> {
  const completed: ZipStreamEntry[] = [];
  let entryCount = 0;
  let processedCount = 0;
  let inflateError: Error | null = null;

  const unzip = new Unzip((file) => {
    entryCount += 1;
    const name = file.name;
    if (name.endsWith("/") || !options.filter(name)) return;
    const chunks: Uint8Array[] = [];
    file.ondata = (err, data, final) => {
      if (err) {
        inflateError = inflateError ?? err;
        return;
      }
      if (data && data.length > 0) chunks.push(data);
      if (final) {
        completed.push({ name, bytes: concatChunks(chunks) });
        chunks.length = 0;
      }
    };
    try {
      file.start();
    } catch (error) {
      inflateError = inflateError ?? (error instanceof Error ? error : new Error(String(error)));
    }
  });
  unzip.register(UnzipInflate);

  const drain = async () => {
    while (completed.length > 0) {
      const entry = completed.shift()!;
      await options.handle(entry);
      processedCount += 1;
    }
  };

  const reader = stream.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value && value.length > 0) {
        unzip.push(value, false);
      }
      if (inflateError) throw inflateError;
      await drain();
    }
    unzip.push(new Uint8Array(0), true);
    if (inflateError) throw inflateError;
    await drain();
  } finally {
    reader.releaseLock();
  }

  return { processedCount, entryCount };
}
