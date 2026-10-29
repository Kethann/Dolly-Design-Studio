import { NextResponse } from "next/server";

/** Which deploy is live. Pages that are already open ask this to find out they are out of date (see UpdateWatcher). */
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ id: process.env.NEXT_PUBLIC_BUILD_ID ?? "dev" }, { headers: { "Cache-Control": "no-store, max-age=0" } });
}
