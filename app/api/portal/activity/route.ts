import { NextRequest, NextResponse } from "next/server";
import { getPortalUser } from "@/lib/portal/auth";
import { readActivity } from "@/lib/portal/activity";
import { listUsers } from "@/lib/portal/users";

/** The activity log. Owners see everyone's; editors see only their own. */
export async function GET(req: NextRequest) {
  const me = await getPortalUser();
  if (!me) return NextResponse.json({ error: "Your session has ended. Sign in again." }, { status: 401 });

  const p = req.nextUrl.searchParams;
  const owner = me.role === "owner" && !me.setup;
  const wantedUser = p.get("user") || undefined;
  const result = await readActivity({
    // Editors are always limited to their own entries, whatever they ask for.
    userId: owner ? wantedUser : me.id,
    group: p.get("group") || undefined,
    q: p.get("q") || undefined,
    before: p.get("before") || undefined,
    limit: Number(p.get("limit")) || 60,
  });
  const people = owner ? (await listUsers()).map((u) => ({ id: u.id, name: u.name, username: u.username })) : [];
  return NextResponse.json({ ...result, people, scope: owner ? "everyone" : "you" });
}
