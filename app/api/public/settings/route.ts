import { NextResponse } from "next/server";
import { readIntroSettings } from "@/lib/portal/settings-store";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await readIntroSettings(), { headers: { "Cache-Control": "no-cache" } });
}
