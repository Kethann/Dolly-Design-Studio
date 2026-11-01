import { NextRequest, NextResponse } from "next/server";
import { requestOriginMatches } from "@/lib/request-origin";
import { parseVisit, visitId } from "@/lib/visitors/model";
import { forgetVisit, recordVisit, visitorRateLimited, visitorRuntime } from "@/lib/visitors/server";

export async function GET() {
  const runtime = await visitorRuntime();
  return NextResponse.json({ enabled: runtime.enabled }, { headers: { "Cache-Control": "no-store" } });
}
async function body(req: NextRequest): Promise<unknown> {
  const reader = req.body?.getReader(); if (!reader) throw new Error("Missing body");
  const chunks: Uint8Array[] = []; let bytes = 0;
  try {
    for (;;) {
      const part = await reader.read(); if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > 16000) { await reader.cancel(); throw new Error("Too large"); }
      chunks.push(part.value);
    }
  } finally { reader.releaseLock(); }
  const joined = new Uint8Array(bytes); let at = 0;
  for (const chunk of chunks) { joined.set(chunk, at); at += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(joined));
}
export async function POST(req: NextRequest) {
  if (!requestOriginMatches(req)) return new NextResponse(null, { status: 403 });
  if (req.headers.get("sec-gpc") === "1" || req.headers.get("dnt") === "1") return new NextResponse(null, { status: 204 });
  const runtime = await visitorRuntime();
  if (!runtime.enabled) return new NextResponse(null, { status: 204 });
  if (visitorRateLimited(runtime.local ? "local" : req.headers.get("cf-connecting-ip") ?? "unknown")) return new NextResponse(null, { status: 429 });
  let input;
  try { input = parseVisit(await body(req)); } catch { return new NextResponse(null, { status: 400 }); }
  if (!input) return new NextResponse(null, { status: 400 });
  try { await recordVisit(runtime, input, req.headers); } catch { return new NextResponse(null, { status: 503 }); }
  return new NextResponse(null, { status: 204 });
}
export async function DELETE(req: NextRequest) {
  if (!requestOriginMatches(req)) return new NextResponse(null, { status: 403 });
  let id;
  try { const value = await body(req) as { id?: unknown }; id = value?.id; } catch { return new NextResponse(null, { status: 400 }); }
  if (!visitId(id)) return new NextResponse(null, { status: 400 });
  const runtime = await visitorRuntime();
  if (!runtime.enabled) return new NextResponse(null, { status: 204 });
  if (visitorRateLimited(runtime.local ? "local" : req.headers.get("cf-connecting-ip") ?? "unknown")) return new NextResponse(null, { status: 429 });
  try { await forgetVisit(runtime, id); } catch { return new NextResponse(null, { status: 503 }); }
  return new NextResponse(null, { status: 204 });
}
