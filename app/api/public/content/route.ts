import { NextResponse } from "next/server";
import { getContent } from "@/lib/content/store";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await getContent(), { headers: { "Cache-Control": "no-cache" } });
}
