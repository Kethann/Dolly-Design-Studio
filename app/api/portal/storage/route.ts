import { NextResponse } from "next/server";
import { getPortalUser } from "@/lib/portal/auth";
import { store } from "@/lib/storage";

/** What the site's storage holds, against its allowance (portal only). */
const GB = 1024 * 1024 * 1024;
/** Cloudflare R2's free allowance is 10 GB; set STORAGE_LIMIT_MB to match your own plan or disk. */
function limitBytes(): number {
  const mb = Number(process.env.STORAGE_LIMIT_MB);
  return Number.isFinite(mb) && mb > 0 ? mb * 1024 * 1024 : 10 * GB;
}

export async function GET() {
  const me = await getPortalUser();
  if (!me) return NextResponse.json({ error: "Your session has ended. Sign in again." }, { status: 401 });
  try {
    const s = await store();
    const used = await s.usedBytes();
    const limit = limitBytes();
    return NextResponse.json({ used, limit, percent: Math.min(100, (used / limit) * 100), where: s.kind === "r2" ? "Cloudflare storage" : "this computer" });
  } catch (err) {
    console.error("[portal] could not measure the storage", err);
    return NextResponse.json({ error: "Couldn\u2019t measure the storage right now." }, { status: 500 });
  }
}
