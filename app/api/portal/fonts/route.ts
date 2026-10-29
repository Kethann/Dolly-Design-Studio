import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { getPortalUser } from "@/lib/portal/auth";
import { tooLarge } from "@/lib/portal/body-limit";
import { logActivity } from "@/lib/portal/activity";
import { contentTypeOf, store } from "@/lib/storage";

/** Upload a font file (TTF, OTF, WOFF or WOFF2) for use anywhere on the site (creator portal only). */
const MAX_BYTES = 10 * 1024 * 1024;

/** The first four bytes of each kind of font file, so a renamed image or script is not accepted as a font. */
const text4 = (b: Uint8Array) => String.fromCharCode(b[0], b[1], b[2], b[3]);
const SIGNATURES: Record<string, (b: Uint8Array) => boolean> = {
  ttf: (b) => (b[0] === 0 && b[1] === 1 && b[2] === 0 && b[3] === 0) || text4(b) === "true",
  otf: (b) => text4(b) === "OTTO",
  woff: (b) => text4(b) === "wOFF",
  woff2: (b) => text4(b) === "wOF2",
};

export async function POST(req: NextRequest) {
  const me = await getPortalUser();
  if (!me) return NextResponse.json({ error: "Your session has ended. Sign in again." }, { status: 401 });
  const origin = req.headers.get("origin");
  if (origin && origin !== req.nextUrl.origin) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const big = tooLarge(req, MAX_BYTES);
  if (big) return big;

  let file: File | null = null;
  try {
    const f = (await req.formData()).get("file");
    file = f instanceof File ? f : null;
  } catch {}
  const ext = file?.name.split(".").pop()?.toLowerCase() ?? "";
  if (!file || !SIGNATURES[ext]) return NextResponse.json({ error: "Choose a font file: .ttf, .otf, .woff or .woff2." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "That font file is over 10 MB." }, { status: 400 });

  try {
    const data = new Uint8Array(await file.arrayBuffer());
    if (!SIGNATURES[ext](data)) return NextResponse.json({ error: "That doesn’t look like a real font file." }, { status: 400 });
    const base =
      file.name
        .replace(/\.[^.]+$/, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 36) || "font";
    const name = `${base}-${createHash("sha1").update(data).digest("hex").slice(0, 8)}.${ext}`;
    await (await store()).putBytes(`uploads/fonts/${name}`, new Uint8Array(data), contentTypeOf(name));
    await logActivity({ headers: req.headers, actor: me, action: "uploaded-font", detail: file.name });
    return NextResponse.json({ url: `/fonts/uploads/${name}`, label: file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim().slice(0, 60) });
  } catch (err) {
    console.error("[portal] font upload failed", err);
    return NextResponse.json({ error: "Couldn’t save the font on this server." }, { status: 500 });
  }
}
