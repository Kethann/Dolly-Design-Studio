import { NextRequest, NextResponse } from "next/server";
import { mkdir, readdir, unlink, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { hasPortalSession } from "@/lib/portal/auth";

/** Pattern textures for the Sweep star: list them, upload new ones, delete unused ones (creator portal only). */
const DIR = path.join(process.cwd(), "public", "images", "textures");
const URL_BASE = "/images/textures/";
const MAX_BYTES = 20 * 1024 * 1024;

const sameOrigin = (req: NextRequest) => {
  const origin = req.headers.get("origin");
  return !origin || origin === req.nextUrl.origin;
};

export async function GET() {
  if (!(await hasPortalSession())) return NextResponse.json({ error: "Sign in again." }, { status: 401 });
  const files = await readdir(DIR).catch(() => [] as string[]);
  return NextResponse.json({ textures: files.filter((f) => /\.(webp|png|jpe?g)$/i.test(f)).map((f) => URL_BASE + f) });
}

export async function POST(req: NextRequest) {
  if (!(await hasPortalSession())) return NextResponse.json({ error: "Your session has ended. Sign in again." }, { status: 401 });
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
    const sharp = (await import("sharp")).default;
    // A texture keeps all its colour and detail, square-ish crops are fine; 1024px is plenty on the star.
    const out = await sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: false })
      .rotate()
      .resize({ width: 1024, height: 1024, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 90, effort: 5 })
      .toBuffer();
    const base =
      file.name
        .replace(/\.[^.]+$/, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 40) || "texture";
    const name = `${base}-${createHash("sha1").update(out).digest("hex").slice(0, 6)}.webp`;
    await mkdir(DIR, { recursive: true });
    await writeFile(path.join(DIR, name), out);
    return NextResponse.json({ src: URL_BASE + name });
  } catch (err) {
    console.error("[portal] texture upload failed", err);
    return NextResponse.json({ error: "Couldn’t read that image, or save it on this server." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  if (!(await hasPortalSession())) return NextResponse.json({ error: "Sign in again." }, { status: 401 });
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
    await unlink(path.join(DIR, name));
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Couldn’t remove that texture." }, { status: 500 });
  }
}
