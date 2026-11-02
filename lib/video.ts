export const MAX_VIDEO_MB = 60;
export const MAX_VIDEO_BYTES = MAX_VIDEO_MB * 1024 * 1024;
export const VIDEO_URL = /^\/media\/videos\/[a-z0-9-]+\.(mp4|mkv)$/i;

/** Check the container signature, not the filename or the supplied MIME type. */
export function videoType(bytes: Uint8Array): "mp4" | "mkv" | null {
  const text = (a: number, b: number) => new TextDecoder().decode(bytes.subarray(a, b));
  if (bytes.length >= 16 && text(4, 8) === "ftyp" && /^(isom|iso[2-9]|mp4[12]|avc1|M4V |dash|MSNV)$/.test(text(8, 12))) return "mp4";
  if (bytes.length >= 16 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3 && text(0, 4096).includes("matroska")) return "mkv";
  return null;
}

/** One byte range, including open-ended and suffix requests used by browser video seeking. */
export function videoRange(header: string | null, size: number): { start: number; end: number } | null | "invalid" {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (!match[1] && !match[2]) || size <= 0) return "invalid";
  if ([match[1], match[2]].some(value => value && !Number.isSafeInteger(Number(value)))) return "invalid";
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  const end = match[1] && match[2] ? Math.min(size - 1, Number(match[2])) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= size || start > end || (!match[1] && Number(match[2]) === 0)) return "invalid";
  return { start, end };
}

/** Read exactly the announced size once, with no multipart copy or unbounded buffer queue. */
export async function readVideoBody(body: ReadableStream<Uint8Array>, size: number): Promise<Uint8Array> {
  if (!Number.isSafeInteger(size) || size <= 0 || size > MAX_VIDEO_BYTES) throw new Error("Invalid video size.");
  const reader = body.getReader();
  const bytes = new Uint8Array(size);
  let offset = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (offset + value.length > size) throw new Error("The video size changed during upload. Try again.");
      bytes.set(value, offset);
      offset += value.length;
    }
    if (offset !== size) throw new Error("The video upload was incomplete. Try again.");
    return bytes;
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
}

/** Validate the header, then pass through the rest without buffering a large upload in the Worker. */
export async function validatedVideoStream(body: ReadableStream<Uint8Array>, size: number): Promise<{ type: "mp4" | "mkv"; stream: ReadableStream<Uint8Array> }> {
  if (!Number.isSafeInteger(size) || size <= 0 || size > MAX_VIDEO_BYTES) throw new Error("Invalid video size.");
  const reader = body.getReader();
  const prefix: Uint8Array[] = [];
  const sample = new Uint8Array(Math.min(4096, size));
  let sampled = 0, received = 0, ended = false, next = 0;
  try {
    while (sampled < sample.length) {
      const part = await reader.read();
      if (part.done) { ended = true; break; }
      if (received + part.value.length > size) throw new Error("The video size changed during upload. Try again.");
      prefix.push(part.value);
      received += part.value.length;
      const length = Math.min(part.value.length, sample.length - sampled);
      sample.set(part.value.subarray(0, length), sampled);
      sampled += length;
    }
    const type = videoType(sample.subarray(0, sampled));
    if (!type) { await reader.cancel().catch(() => {}); throw new Error("Choose a valid MP4 or MKV video."); }
    const stream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          if (next < prefix.length) { controller.enqueue(prefix[next++]); return; }
          if (!ended) {
            const part = await reader.read();
            if (!part.done) {
              if (received + part.value.length > size) throw new Error("The video size changed during upload. Try again.");
              received += part.value.length;
              controller.enqueue(part.value);
              return;
            }
            ended = true;
          }
          if (received !== size) throw new Error("The video upload was incomplete. Try again.");
          reader.releaseLock();
          controller.close();
        } catch (error) {
          await reader.cancel().catch(() => {});
          controller.error(error);
        }
      },
      async cancel(reason) { await reader.cancel(reason).catch(() => {}); },
    });
    return { type, stream };
  } catch (error) {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
    throw error;
  }
}
