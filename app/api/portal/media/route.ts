import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { readdir } from "node:fs/promises";
import path from "node:path";
import manifest from "@/content/generated/image-manifest.json";
import { getPortalUser } from "@/lib/portal/auth";
import { logActivity } from "@/lib/portal/activity";
import { processImage } from "@/lib/portal/image";
import { store } from "@/lib/storage";

/** The image library: every picture the site has, plus uploads (creator portal only). */
const ROOT = path.join(process.cwd(), "public", "images");
const MAX_BYTES = 30 * 1024 * 1024;
const IMAGE = /\.(webp|png|jpe?g|avif)$/i;
/** Folders that are the studio's own artwork, not for picking. */
const HIDDEN = new Set(["brand", "textures", "star-textures"]);

async function walk(dir: string, rel: string, out: string[]) {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const e of entries) {
    const next = `${rel}/${e.name}`;
    if (e.isDirectory()) {
      if (rel === "/images" && HIDDEN.has(e.name)) continue;
      await walk(path.join(dir, e.name), next, out);
    } else if (IMAGE.test(e.name)) out.push(next);
  }
}

export async function GET() {
  if (!(await getPortalUser())) return NextResponse.json({ error: "Sign in again." }, { status: 401 });
  const s = await store();
  const uploaded = (await s.list("uploads/images/")).map((k) => "/images/uploads/" + k.slice("uploads/images/".length));
  // The pictures that came with the site: read from the folder here; on Cloudflare (no folder) from the build's list.
  const built: string[] = [];
  if (s.kind === "fs") await walk(ROOT, "/images", built);
  else for (const src of Object.keys(manifest)) if (src.startsWith("/images/") && !HIDDEN.has(src.split("/")[2]) && IMAGE.test(src)) built.push(src);
  const images = [...new Set([...built, ...uploaded])];
  // Newest uploads first, then the rest by folder.
  images.sort((a, b) => Number(b.startsWith("/images/uploads/")) - Number(a.startsWith("/images/uploads/")) || a.localeCompare(b));
  return NextResponse.json({ images });
}

export async function POST(req: NextRequest) {
  const me = await getPortalUser();
  if (!me) return NextResponse.json({ error: "Your session has ended. Sign in again." }, { status: 401 });
  const origin = req.headers.get("origin");
  if (origin && origin !== req.nextUrl.origin) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  let file: File | null = null;
  try {
    const form = await req.formData();
    const f = form.get("file");
    file = f instanceof File ? f : null;
  } catch {}
  if (!file || !/^image\/(png|webp|jpeg|avif)$/.test(file.type)) {
    return NextResponse.json({ error: "Choose a PNG, WebP, JPG or AVIF image." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "That image is over 30 MB." }, { status: 400 });

  try {
    // Shrunk to at most 3200px as high-quality WebP where the server can; otherwise kept exactly as sent.
    const img = await processImage(new Uint8Array(await file.arrayBuffer()), { max: 3200, quality: 95 });
    const base =
      file.name
        .replace(/\.[^.]+$/, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 40) || "image";
    const name = `${base}-${createHash("sha1").update(img.bytes).digest("hex").slice(0, 8)}.${img.ext}`;
    await (await store()).putBytes(`uploads/images/${name}`, img.bytes, img.contentType);
    await logActivity({ headers: req.headers, actor: me, action: "uploaded-image", detail: file.name });
    return NextResponse.json({ src: `/images/uploads/${name}` });
  } catch (err) {
    console.error("[portal] image upload failed", err);
    const known = err instanceof Error && /isn.t a PNG/.test(err.message);
    return NextResponse.json({ error: known ? (err as Error).message : "Couldn’t save the image on this server." }, { status: known ? 400 : 500 });
  }
}
