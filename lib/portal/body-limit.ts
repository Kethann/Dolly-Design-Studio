import { NextResponse, type NextRequest } from "next/server";

/**
 * Reject declared oversized requests early. Multipart routes must also use readUploadForm
 * to bound the actual stream when Content-Length is absent or inaccurate.
 */
export function tooLarge(req: NextRequest, maxBytes: number): NextResponse | null {
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes + 64 * 1024) {
    return NextResponse.json({ error: `That file is too big (the limit is ${Math.round(maxBytes / 1024 / 1024)} MB).` }, { status: 413 });
  }
  return null;
}

export class UploadTooLargeError extends Error {
  constructor(readonly maxBytes: number) {
    super(`That file is too big (the limit is ${Math.round(maxBytes / 1024 / 1024)} MB).`);
    this.name = "UploadTooLargeError";
  }
}

/** The multipart parser can buffer at most the file limit plus a small envelope allowance. */
export async function readUploadForm(req: Request, maxBytes: number): Promise<FormData> {
  if (!req.body) throw new Error("Missing upload body.");
  let received = 0;
  let exceeded = false;
  const bounded = req.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      received += chunk.byteLength;
      if (received > maxBytes + 64 * 1024) {
        exceeded = true;
        throw new UploadTooLargeError(maxBytes);
      }
      controller.enqueue(chunk);
    },
  }));
  try {
    return await new Response(bounded, { headers: { "Content-Type": req.headers.get("content-type") ?? "" } }).formData();
  } catch (error) {
    if (exceeded) throw new UploadTooLargeError(maxBytes);
    throw error;
  }
}
