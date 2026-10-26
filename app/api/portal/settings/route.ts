import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { hasPortalSession } from "@/lib/portal/auth";
import { writeIntroSettings } from "@/lib/portal/settings-store";
import { sanitizeIntroSettings } from "@/lib/intro/settings";

/** Save and publish the intro settings (creator portal only). */
export async function PUT(req: NextRequest) {
  if (!(await hasPortalSession())) {
    return NextResponse.json({ error: "Your session has ended. Sign in again." }, { status: 401 });
  }
  // Defence in depth on top of the SameSite=Strict cookie: only accept saves from this site's own pages.
  const origin = req.headers.get("origin");
  if (origin && origin !== req.nextUrl.origin) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  let settings;
  try {
    settings = sanitizeIntroSettings(await req.json());
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  try {
    await writeIntroSettings(settings);
  } catch (err) {
    console.error("[portal] could not save intro settings", err);
    return NextResponse.json(
      { error: "Couldn’t save on this server (its files are read-only). Saving needs a storage service here — see the README." },
      { status: 500 },
    );
  }

  revalidatePath("/", "layout"); // every page picks up the new background and intro on its next visit
  return NextResponse.json({ ok: true, settings });
}
