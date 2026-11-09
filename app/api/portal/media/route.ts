import { requestOriginMatches } from "@/lib/request-origin";
import { NextRequest, NextResponse } from "next/server";
import { createHash, randomUUID } from "node:crypto";
import { readdir } from "node:fs/promises";
import path from "node:path";
import manifest from "@/content/generated/image-manifest.json";
import { getPortalUser } from "@/lib/portal/auth";
import { tooLarge, readUploadForm, UploadTooLargeError } from "@/lib/portal/body-limit";
import { logActivity } from "@/lib/portal/activity";
import { processImage } from "@/lib/portal/image";
import { isImageBusyError } from "@/lib/portal/image-work";
import { store, type Store } from "@/lib/storage";
import { protectedMedia } from "@/lib/content/reset-media";
import { readIntroSettings } from "@/lib/portal/settings-store";
import { getContent } from "@/lib/content/store";
import { hiddenLibraryImages, setLibraryImageHidden } from "@/lib/portal/media-hidden";

/** The image library: every picture the site has, plus uploads (creator portal only). */
const ROOT = path.join(process.cwd(), "public", "images");
const MAX_BYTES = 30 * 1024 * 1024; // one file, at most (the portal also checks this before sending)
const IMAGE = /\.(webp|png|jpe?g|avif|gif|svg)$/i;
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

async function allLibraryImages(s: Store) {
  const entries = async (prefix: string) => s.listWithDates
    ? s.listWithDates(prefix)
    : (await s.list(prefix)).map((key) => ({ key, uploadedAt: 0 }));
  const [uploads, proofs] = await Promise.all([entries("uploads/images/"), entries("uploads/proof/")]);
  const uploaded = uploads.map(({ key }) => "/images/uploads/" + key.slice("uploads/images/".length));
  const slate = proofs.map(({ key }) => "/images/proof-table/" + key.slice("uploads/proof/".length));
  // The pictures that came with the site: read from the folder here; on Cloudflare (no folder) from the build's list.
  const built: string[] = [];
  if (s.kind === "fs") await walk(ROOT, "/images", built);
  else for (const src of Object.keys(manifest)) if (src.startsWith("/images/") && !HIDDEN.has(src.split("/")[2]) && IMAGE.test(src)) built.push(src);
  const uploadedAt: Record<string, number> = {};
  for (const { key, uploadedAt: time } of uploads) uploadedAt["/images/uploads/" + key.slice("uploads/images/".length)] = time;
  for (const { key, uploadedAt: time } of proofs) uploadedAt["/images/proof-table/" + key.slice("uploads/proof/".length)] = time;
  return { built, uploaded, slate, uploadedAt, images: [...new Set([...uploaded, ...slate, ...built])] };
}

export async function GET() {
  if (!(await getPortalUser())) return NextResponse.json({ error: "Sign in again." }, { status: 401 });
  const s = await store();
  const { images: all, uploaded, slate, uploadedAt } = await allLibraryImages(s);
  // Pictures uploaded through the portal (the library's own uploads and the slate's titles) can be deleted again; the
  // ones that came with the site are part of its files and can't.
  const hiddenSet = new Set(await hiddenLibraryImages());
  const images = all.filter((src) => !hiddenSet.has(src));
  const protectedUrls = protectedMedia(await readIntroSettings());
  const siteContent = JSON.stringify(await getContent());
  const deletable = [...uploaded, ...slate].filter((src) => !protectedUrls.has(src) && !siteContent.includes(src) && !hiddenSet.has(src));
  // Originals without an upload timestamp (bundled art) follow the uploaded images.
  images.sort((a, b) => Number(!uploadedAt[a]) - Number(!uploadedAt[b]) || (uploadedAt[a] ?? 0) - (uploadedAt[b] ?? 0) || a.localeCompare(b));
  return NextResponse.json({ images, removable: images, deletable, hidden: all.filter((src) => hiddenSet.has(src)), uploadedAt });
}

/** Hide or restore an image in the library; the underlying file stays available to existing pages. */
async function visibility(req: NextRequest, hide: boolean) {
  if (!(await getPortalUser())) return NextResponse.json({ error: "Sign in again." }, { status: 401 });
  const origin = req.headers.get("origin");
  if (origin && !requestOriginMatches(req)) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { src?: unknown };
  const src = typeof body.src === "string" ? body.src : "";
  const s = await store();
  if (!(await allLibraryImages(s)).images.includes(src)) return NextResponse.json({ error: "That picture is no longer in the library." }, { status: 404 });
  try {
    await setLibraryImageHidden(src, hide);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[portal] could not change library visibility", error);
    return NextResponse.json({ error: "Couldn’t update the image library. Try again." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) { return visibility(req, true); }
export async function PUT(req: NextRequest) { return visibility(req, false); }

export async function POST(req: NextRequest) {
  const me = await getPortalUser();
  if (!me) return NextResponse.json({ error: "Your session has ended. Sign in again." }, { status: 401 });
  const origin = req.headers.get("origin");
  if (origin && !requestOriginMatches(req)) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const big = tooLarge(req, MAX_BYTES);
  if (big) return big;

  let file: File | null = null;
  let duplicateMode: "skip" | "add" | "replace" = "skip";
  let replaceSrc = "";
  let checkName = false;
  try {
    const form = await readUploadForm(req, MAX_BYTES);
    const f = form.get("file");
    file = f instanceof File ? f : null;
    const mode = form.get("duplicate");
    duplicateMode = mode === "add" || mode === "replace" ? mode : "skip";
    replaceSrc = String(form.get("replace") ?? "");
    checkName = form.get("checkName") === "1" || duplicateMode === "replace";
  } catch (error) {
    if (error instanceof UploadTooLargeError) return NextResponse.json({ error: error.message }, { status: 413 });
  }
  // The kind of picture is decided from its bytes (below), not from what the browser says it is.
  if (!file) return NextResponse.json({ error: "Choose a picture to upload." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "That image is over 30 MB, so it wasn’t uploaded." }, { status: 400 });

  try {
    // Shrunk to at most 3200px as high-quality WebP where the server can; otherwise kept exactly as sent.
    const img = await processImage(new Uint8Array(await file.arrayBuffer()), { max: 4096, quality: 92 });
    const base =
      file.name
        .replace(/\.[^.]+$/, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 40) || "image";
    const hash = createHash("sha1").update(img.bytes).digest("hex").slice(0, 8);
    let name = `${base}-${hash}.${img.ext}`;
    let key = `uploads/images/${name}`;
    const storage = await store();
    // The name, not only the bytes, defines a duplicate: a revised 24.jpg can replace an older 24.jpg.
    // Match only names generated by this uploader, never an arbitrary prefix or built-in site image.
    const matchingName = new RegExp(`^uploads/images/${base}-[0-9a-f]{8}(?:-copy-[0-9a-f]{12})?\\.(?:webp|png|jpg|avif|gif|svg)$`);
    const matches = checkName
      ? (await storage.list(`uploads/images/${base}-`)).filter((candidate) => matchingName.test(candidate))
      : (await storage.size(key) !== null ? [key] : []);
    const requestedOld = replaceSrc.startsWith("/images/uploads/") ? `uploads/images/${replaceSrc.slice("/images/uploads/".length)}` : "";
    const oldKey = matches.includes(requestedOld) ? requestedOld : (matches.includes(key) ? key : matches[0]);
    if (oldKey && duplicateMode === "skip") {
      return NextResponse.json({ src: `/images/uploads/${oldKey.slice("uploads/images/".length)}`, duplicate: true });
    }
    if (oldKey && duplicateMode === "replace") {
      const oldSrc = `/images/uploads/${oldKey.slice("uploads/images/".length)}`;
      // A new URL is essential: upload URLs and resized copies are immutable-cached.
      // Do not remove artwork still referenced by a published page or by the current design.
      if (JSON.stringify(await getContent()).includes(oldSrc) || JSON.stringify(await readIntroSettings()).includes(oldSrc)) {
        return NextResponse.json({ error: "This older picture is used on the site. Replace it in its page or design setting first, then remove it from the library." }, { status: 409 });
      }
      name = `${base}-${hash}-copy-${randomUUID().replace(/-/g, "").slice(0, 12)}.${img.ext}`;
      key = `uploads/images/${name}`;
      await storage.putBytes(key, img.bytes, img.contentType);
      try {
        await storage.remove(oldKey);
      } catch (error) {
        await storage.remove(key).catch(() => {}); // Keep the old image if the replacement cannot finish.
        throw error;
      }
      await logActivity({ headers: req.headers, actor: me, action: "uploaded-image", detail: `Replaced ${oldSrc} with ${name}` });
      return NextResponse.json({ src: `/images/uploads/${name}`, replaced: oldSrc });
    }
    if (matches.includes(key)) {
      // Explicitly adding a copy must never overwrite the original library image.
      name = `${base}-${hash}-copy-${randomUUID().replace(/-/g, "").slice(0, 12)}.${img.ext}`;
      key = `uploads/images/${name}`;
    }
    await storage.putBytes(key, img.bytes, img.contentType);
    await logActivity({ headers: req.headers, actor: me, action: "uploaded-image", detail: file.name });
    return NextResponse.json({ src: `/images/uploads/${name}` });
  } catch (err) {
    if (isImageBusyError(err)) return NextResponse.json({ error: err.message }, { status: 503, headers: { "Retry-After": "2" } });
    console.error("[portal] image upload failed", err);
    const known = err instanceof Error && /isn.t a picture|SVG|TIFF|too many pixels/.test(err.message);
    return NextResponse.json({ error: known ? (err as Error).message : "Couldn’t save the image on this server." }, { status: known ? 400 : 500 });
  }
}
