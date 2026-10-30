import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { getPortalUser } from "@/lib/portal/auth";
import { tooLarge } from "@/lib/portal/body-limit";
import { logActivity } from "@/lib/portal/activity";
import { processImage } from "@/lib/portal/image";
import { store } from "@/lib/storage";
import manifest from "@/content/generated/image-manifest.json";

/** Title images for the Proof Table: list the ones on the site, and upload new ones (creator portal only). */
const URL_BASE = "/images/proof-table/";
const MAX_BYTES = 90 * 1024 * 1024;

export async function GET() {
  if (!(await getPortalUser())) return NextResponse.json({ error: "Sign in again." }, { status: 401 });
  const stored = (await (await store()).list("uploads/proof/")).map((k) => URL_BASE + k.slice("uploads/proof/".length));
  const built = Object.keys(manifest).filter((src) => src.startsWith(URL_BASE));
  return NextResponse.json({ images: [...new Set([...built, ...stored])].sort() });
}

export async function POST(req: NextRequest) {
  const me = await getPortalUser();
  if (!me) return NextResponse.json({ error: "Your session has ended. Sign in again." }, { status: 401 });
  const origin = req.headers.get("origin");
  if (origin && origin !== req.nextUrl.origin) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const big = tooLarge(req, MAX_BYTES);
  if (big) return big;

  let file: File | null = null;
  try {
    const form = await req.formData();
    const f = form.get("file");
    file = f instanceof File ? f : null;
  } catch {}
  if (!file || !/^image\/(png|webp|jpeg|avif)$/.test(file.type)) {
    return NextResponse.json({ error: "Choose a PNG, WebP, JPG or AVIF image." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "That image is over 90 MB." }, { status: 400 });

  try {
    // Trim the empty margin around the title and keep it crisp but light: at most 2048px (where the server can; the
    // portal also trims in the browser before sending).
    const img = await processImage(new Uint8Array(await file.arrayBuffer()), { max: 2048, quality: 95, trim: true });
    const base =
      file.name
        .replace(/\.[^.]+$/, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 40) || "title";
    const name = `${base}-${createHash("sha1").update(img.bytes).digest("hex").slice(0, 6)}.${img.ext}`;
    await (await store()).putBytes(`uploads/proof/${name}`, img.bytes, img.contentType);
    await logActivity({ headers: req.headers, actor: me, action: "uploaded-image", detail: `Slate title: ${file.name}` });
    return NextResponse.json({ src: URL_BASE + name });
  } catch (err) {
    console.error("[portal] title upload failed", err);
    return NextResponse.json({ error: "Couldn’t save the image on this server." }, { status: 500 });
  }
}
