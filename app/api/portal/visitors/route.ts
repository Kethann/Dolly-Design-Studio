import { NextRequest, NextResponse } from "next/server";
import { getPortalUser } from "@/lib/portal/auth";
import { readVisitors, visitorRuntime } from "@/lib/visitors/server";

export async function GET(req: NextRequest) {
  const user = await getPortalUser();
  if (!user) return NextResponse.json({ error: "Sign in to view visitors." }, { status: 401 });
  if (user.role !== "owner" || user.setup) return NextResponse.json({ error: "Only studio owners can view visitor analytics." }, { status: 403 });
  const days = Number(req.nextUrl.searchParams.get("days"));
  try {
    const report = await readVisitors(await visitorRuntime(), [1,7,30].includes(days) ? days : 1, req.nextUrl.searchParams.get("before"));
    return NextResponse.json(report, { headers: { "Cache-Control": "private, no-store" } });
  } catch { return NextResponse.json({ error: "Visitor analytics is unavailable. Check the database binding and migration, then retry." }, { status: 503 }); }
}
