import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { getPortalUser } from "@/lib/portal/auth";
import { logActivity } from "@/lib/portal/activity";
import { processImage } from "@/lib/portal/image";
import { store } from "@/lib/storage";
import manifest from "@/content/generated/image-manifest.json";

/** Pattern textures for the Sweep star: list them, upload new ones, delete unused ones (creator portal only). */
const URL_BASE = "/images/textures/";
const MAX_BYTES = 20 * 1024 * 1024;

const sameOrigin = (req: NextRequest) => {
  const origin = req.headers.get("origin");
  return !origin || origin === req.nextUrl.origin;
};

export async function GET() {
  if (!(await getPortalUser())) return NextResponse.json({ error: "Sign in again." }, { status: 401 });
  const stored = (await (await store()).list("uploads/textures/")).map((k) => URL_BASE + k.slice("uploads/textures/".length));
  const built = Object.keys(manifest).filter((src) => src.startsWith(URL_BASE));
  return NextResponse.json({ textures: [...new Set([...built, ...stored])].sort() });
}

export async function POST(req: NextRequest) {
  const me = await getPortalUser();
  if (!me) return NextResponse.json({ error: "Your session has ended. Sign in again." }, { status: 401 });
  if (!sameOrigin(req)) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  let file: File | null = null;
  try {
    const f = (await req.formData()).get("file");
    file = f instanceof File ? f : null;
  } catch {}
  if (!file || !/^image\/(png|webp|jpeg)$/.test(file.type)) {
    return NextResponse.json({ error: "Choose a PNG, JPG or WebP image." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "That image is over 20 MB." }, { status: 400 });

  try {
    // A texture keeps all its colour and detail; 1024px is plenty on the star.
    const img = await processImage(new Uint8Array(await file.arrayBuffer()), { max: 1024, quality: 90 });
    const base =
      file.name
        .replace(/\.[^.]+$/, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 40) || "texture";
    const name = `${base}-${createHash("sha1").update(img.bytes).digest("hex").slice(0, 6)}.${img.ext}`;
    await (await store()).putBytes(`uploads/textures/${name}`, img.bytes, img.contentType);
    await logActivity({ headers: req.headers, actor: me, action: "uploaded-texture", detail: file.name });
    return NextResponse.json({ src: URL_BASE + name });
  } catch (err) {
    console.error("[portal] texture upload failed", err);
    return NextResponse.json({ error: "Couldn’t read that image, or save it on this server." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  if (!(await getPortalUser())) return NextResponse.json({ error: "Sign in again." }, { status: 401 });
  if (!sameOrigin(req)) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  let src = "";
  try {
    src = String((await req.json())?.src ?? "");
  } catch {}
  const name = src.startsWith(URL_BASE) ? src.slice(URL_BASE.length) : "";
  if (!/^[\w\-.]+\.(webp|png|jpe?g)$/i.test(name) || name.includes("..")) {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  try {
    const s = await store();
    const key = `uploads/textures/${name}`;
    if (s.kind === "r2" && !(await s.list(key)).includes(key)) {
      return NextResponse.json({ error: "That texture came with the site and can’t be removed here." }, { status: 400 });
    }
    await s.remove(key);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Couldn’t remove that texture." }, { status: 500 });
  }
}
