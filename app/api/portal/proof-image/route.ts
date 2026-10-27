import { NextRequest, NextResponse } from "next/server";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { hasPortalSession } from "@/lib/portal/auth";

/** Title images for the Proof Table: list the ones on the site, and upload new ones (creator portal only). */
const DIR = path.join(process.cwd(), "public", "images", "proof-table");
const URL_BASE = "/images/proof-table/";
const MAX_BYTES = 30 * 1024 * 1024;

export async function GET() {
  if (!(await hasPortalSession())) return NextResponse.json({ error: "Sign in again." }, { status: 401 });
  const files = await readdir(DIR).catch(() => [] as string[]);
  return NextResponse.json({ images: files.filter((f) => /\.(webp|png|jpe?g|avif)$/i.test(f)).map((f) => URL_BASE + f) });
}

export async function POST(req: NextRequest) {
  if (!(await hasPortalSession())) return NextResponse.json({ error: "Your session has ended. Sign in again." }, { status: 401 });
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
    const input = Buffer.from(await file.arrayBuffer());
    // Trim the empty margin around the title and keep it crisp but light: at most 2048px, transparent WebP.
    const sharp = (await import("sharp")).default;
    const out = await sharp(input, { limitInputPixels: false })
      .trim({ threshold: 1 })
      .resize({ width: 2048, height: 2048, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 88, alphaQuality: 100, effort: 5 })
      .toBuffer();
    const base =
      file.name
        .replace(/\.[^.]+$/, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 40) || "title";
    const name = `${base}-${createHash("sha1").update(out).digest("hex").slice(0, 6)}.webp`;
    await mkdir(DIR, { recursive: true });
    await writeFile(path.join(DIR, name), out);
    return NextResponse.json({ src: URL_BASE + name });
  } catch (err) {
    console.error("[portal] title upload failed", err);
    return NextResponse.json({ error: "Couldn’t save the image on this server." }, { status: 500 });
  }
}
