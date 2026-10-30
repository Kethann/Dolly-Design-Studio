import { requestOriginMatches } from "@/lib/request-origin";
import { createHash, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { getPortalUser } from "@/lib/portal/auth";
import { logActivity } from "@/lib/portal/activity";
import { getContent, writeContent } from "@/lib/content/store";
import { readIntroSettings, writeIntroSettings } from "@/lib/portal/settings-store";
import { canResetMediaFile, protectedMedia, resetMedia } from "@/lib/content/reset-media";
import { store } from "@/lib/storage";
import type { SiteContent } from "@/lib/content/types";
import type { IntroSettings } from "@/lib/intro/settings";

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });
let resetting = false;

function savedDocument<T>(text: string | null): T | null {
  if (text === null) return null;
  const value: unknown = JSON.parse(text);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid saved document");
  return value as T;
}

async function snapshot() {
  const s = await store();
  const [contentText, settingsText, defaults, imageKeys, proofKeys] = await Promise.all([
    s.getText("content/site-content.json"),
    s.getText("content/intro-settings.json"),
    readIntroSettings(),
    s.list("uploads/images/"),
    s.list("uploads/proof/"),
  ]);
  // A storage/JSON error must abort a reset, never silently substitute the template for saved content.
  const rawContent = savedDocument<SiteContent>(contentText);
  const rawSettings = savedDocument<IntroSettings>(settingsText);
  const content = rawContent ?? await getContent();
  const settings = rawSettings ? { ...rawSettings, proofTable: rawSettings.proofTable ?? defaults.proofTable } : defaults;
  const protectedUrls = protectedMedia(settings);
  const files = [...imageKeys, ...proofKeys].filter((key) => canResetMediaFile(key, protectedUrls)).sort();
  const token = createHash("sha256").update(JSON.stringify({ content, settings, files })).digest("hex");
  return { s, content, settings, files, token };
}

export async function GET() {
  const me = await getPortalUser();
  if (!me) return fail("Sign in again.", 401);
  if (me.role !== "owner" || me.setup) return fail("Only an owner account can reset the media.", 403);
  try {
    const snap = await snapshot();
    return NextResponse.json({ token: snap.token, files: snap.files.length });
  } catch {
    return fail("Couldn’t prepare the reset. Try again.", 500);
  }
}

export async function POST(req: NextRequest) {
  const me = await getPortalUser();
  if (!me) return fail("Sign in again.", 401);
  if (me.role !== "owner" || me.setup) return fail("Only an owner account can reset the media.", 403);
  if (!requestOriginMatches(req)) return fail("Forbidden.", 403);
  const body = await req.json().catch(() => null);
  if (body?.confirmation !== "CLEAR MEDIA" || typeof body?.token !== "string") return fail("Confirm the media reset first.", 400);
  if (resetting) return fail("A media reset is already running. Wait for it to finish.", 409);
  resetting = true;
  let backup = "";
  try {
    const snap = await snapshot();
    if (snap.token !== body.token) return fail("The content or library changed. Review the reset again.", 409);
    backup = `data/backups/media-reset/${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID()}`;
    // Finish every recovery copy before changing either published document or removing a file.
    await snap.s.putText(`${backup}/snapshot.json`, JSON.stringify({ content: snap.content, settings: snap.settings, files: snap.files }, null, 2));
    for (const key of snap.files) await snap.s.copy(key, `${backup}/files/${key}`);
    if ((await snapshot()).token !== snap.token) return fail("The content changed while backing up. Nothing was cleared; review the reset again.", 409);
    const next = resetMedia(snap.content, snap.settings);
    try {
      await writeContent(next.content);
      await writeIntroSettings(next.settings);
    } catch (error) {
      await Promise.all([writeContent(snap.content), writeIntroSettings(snap.settings)]);
      throw error;
    }
    revalidatePath("/", "layout");
    const retained: string[] = [];
    for (const key of snap.files) {
      try { await snap.s.remove(key); } catch { retained.push(key); }
    }
    await logActivity({ headers: req.headers, actor: me, action: "published-content", detail: "Cleared content images; kept all text, records, intro and studio branding. Recovery archive: " + backup });
    return NextResponse.json({ ok: true, ...next, backup, retained: retained.length });
  } catch (error) {
    console.error("[media-reset] failed", error);
    return fail(`The reset could not finish.${backup ? ` Recovery archive: ${backup}.` : ""} Reload the portal before continuing.`, 500);
  } finally {
    resetting = false;
  }
}
