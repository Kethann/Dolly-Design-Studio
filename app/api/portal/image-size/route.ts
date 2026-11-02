import { requestOriginMatches } from "@/lib/request-origin";
import { NextRequest, NextResponse } from "next/server";
import { getPortalUser } from "@/lib/portal/auth";
import { tooLarge, readUploadForm, UploadTooLargeError } from "@/lib/portal/body-limit";
import { imageSizeKey, IMAGE_SIZE_WIDTHS } from "@/lib/image-sizes";
import { sniffImage } from "@/lib/portal/image";
import { store } from "@/lib/storage";

const MAX_BYTES = 12 * 1024 * 1024;
const ORIGINALS: [string, string][] = [["/images/uploads/", "uploads/images/"], ["/images/proof-table/", "uploads/proof/"]];

/** Keeps one smaller copy of a picture that was just uploaded. The portal's browser makes the copy; nothing is resized here. */
export async function POST(req: NextRequest) {
  if (!(await getPortalUser())) return NextResponse.json({ error: "Your session has ended. Sign in again." }, { status: 401 });
  const origin = req.headers.get("origin");
  if (origin && !requestOriginMatches(req)) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  const big = tooLarge(req, MAX_BYTES);
  if (big) return big;

  let form: FormData;
  try {
    form = await readUploadForm(req, MAX_BYTES);
  } catch (error) {
    if (error instanceof UploadTooLargeError) return NextResponse.json({ error: error.message }, { status: 413 });
    return NextResponse.json({ error: "Couldn’t read that upload." }, { status: 400 });
  }
  const src = String(form.get("src") ?? "");
  const width = Number(form.get("width"));
  const file = form.get("file");
  const route = ORIGINALS.find(([url]) => src.startsWith(url));
  const name = route ? src.slice(route[0].length) : "";
  if (!route || !/^[\w.-]{1,120}\.(webp|png|jpe?g|avif)$/i.test(name) || name.includes("..") || !IMAGE_SIZE_WIDTHS.includes(width) || !(file instanceof File)) {
    return NextResponse.json({ error: "That isn’t a picture size this site keeps." }, { status: 400 });
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (sniffImage(bytes) !== "webp") return NextResponse.json({ error: "Picture sizes must be WebP." }, { status: 400 });
  const storage = await store();
  const original = `${route[1]}${name}`;
  if ((await storage.size(original)) === null) return NextResponse.json({ error: "That picture is no longer in the library." }, { status: 404 });
  await storage.putBytes(imageSizeKey(original, width), bytes, "image/webp");
  return NextResponse.json({ ok: true });
}
