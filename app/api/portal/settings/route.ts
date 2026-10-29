import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getPortalUser } from "@/lib/portal/auth";
import { tooLarge } from "@/lib/portal/body-limit";
import { logActivity } from "@/lib/portal/activity";
import { summarizeSettings } from "@/lib/portal/summary";
import { readIntroSettings, writeIntroSettings } from "@/lib/portal/settings-store";
import { sanitizeIntroSettings } from "@/lib/intro/settings";

/** Save and publish the intro settings (creator portal only). */
export async function PUT(req: NextRequest) {
  const me = await getPortalUser();
  if (!me) {
    return NextResponse.json({ error: "Your session has ended. Sign in again." }, { status: 401 });
  }
  // Defence in depth on top of the SameSite=Strict cookie: only accept saves from this site's own pages.
  const origin = req.headers.get("origin");
  if (origin && origin !== req.nextUrl.origin) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const big = tooLarge(req, 2 * 1024 * 1024);
  if (big) return big;

  let settings;
  try {
    settings = sanitizeIntroSettings(await req.json());
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  const previous = await readIntroSettings();
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
  await logActivity({ headers: req.headers, actor: me, action: "published-design", detail: summarizeSettings(previous, settings) });
  return NextResponse.json({ ok: true, settings });
}
