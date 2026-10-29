import { NextResponse, type NextRequest } from "next/server";

/**
 * An upload bigger than this is refused from its Content-Length header, before the server reads any of it, so an
 * oversized or endless request can never fill the server's memory. (The per-file limits still apply after this.)
 */
export function tooLarge(req: NextRequest, maxBytes: number): NextResponse | null {
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes + 64 * 1024) {
    return NextResponse.json({ error: `That file is too big (the limit is ${Math.round(maxBytes / 1024 / 1024)} MB).` }, { status: 413 });
  }
  return null;
}
