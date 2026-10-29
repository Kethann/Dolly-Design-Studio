import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getPortalUser } from "@/lib/portal/auth";
import { tooLarge } from "@/lib/portal/body-limit";
import { logActivity } from "@/lib/portal/activity";
import { summarizeContent } from "@/lib/portal/summary";
import { getContent, writeContent } from "@/lib/content/store";
import { sanitizeContent } from "@/lib/content/sanitize";

/** Save and publish the site's content: text, lists, projects, images, fonts (creator portal only). */
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

  const big = tooLarge(req, 6 * 1024 * 1024); // a saved page is text: anything bigger is not one
  if (big) return big;

  let content;
  try {
    content = sanitizeContent(await req.json());
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  const previous = await getContent();
  try {
    await writeContent(content);
  } catch (err) {
    console.error("[portal] could not save content", err);
    return NextResponse.json(
      { error: "Couldn’t save on this server (its files are read-only). Saving needs a storage service here — see the README." },
      { status: 500 },
    );
  }

  revalidatePath("/", "layout"); // every page picks up the new content on its next visit
  await logActivity({ headers: req.headers, actor: me, action: "published-content", detail: summarizeContent(previous, content) });
  return NextResponse.json({ ok: true, content });
}
