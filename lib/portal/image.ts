// Server-only: checks that an upload really is a picture, and (where the server can) shrinks and re-encodes it.
//
// Accepted: PNG, JPG, WebP, AVIF, GIF (animated ones stay animated), SVG, and TIFF. (BMP, ICO and other formats a
// browser can show are converted to PNG in the portal before they are sent; see app/portal/upload.ts.)
//
// The picture tool "sharp" is used when the server has it (your computer, a normal host): pictures are shrunk and
// re-encoded as high-quality WebP. On Cloudflare it isn't available, so the picture is stored exactly as sent, after
// being checked by its first bytes.

export type ImageExt = "webp" | "png" | "jpg" | "avif" | "gif" | "svg" | "tiff";

export interface ProcessedImage {
  bytes: Uint8Array;
  /** File extension without the dot. */
  ext: Exclude<ImageExt, "tiff">;
  contentType: string;
  /** True when it was re-encoded here. */
  encoded: boolean;
}

const TYPES = { webp: "image/webp", png: "image/png", jpg: "image/jpeg", avif: "image/avif", gif: "image/gif", svg: "image/svg+xml" } as const;

/** What kind of picture these bytes are, from their first bytes (not from the file name or the type the browser claims). */
export function sniffImage(b: Uint8Array): ImageExt | null {
  if (b.length > 12 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "png";
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
  const ascii = (from: number, to: number) => String.fromCharCode(...b.subarray(from, to));
  if (b.length > 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "webp";
  if (b.length > 12 && ascii(4, 8) === "ftyp" && /avif|avis/.test(ascii(8, 16))) return "avif";
  if (b.length > 10 && (ascii(0, 6) === "GIF87a" || ascii(0, 6) === "GIF89a")) return "gif";
  if (b.length > 8 && ((b[0] === 0x49 && b[1] === 0x49 && b[2] === 0x2a && b[3] === 0) || (b[0] === 0x4d && b[1] === 0x4d && b[2] === 0 && b[3] === 0x2a))) return "tiff";
  // SVG is text: an <svg ...> element near the start (after an optional XML header, comment or doctype).
  const head = new TextDecoder("utf-8", { fatal: false }).decode(b.subarray(0, Math.min(b.length, 2048)));
  if (/<svg[\s>]/i.test(head) && !/^\uFFFD/.test(head)) return "svg";
  return null;
}

/** Whether an SVG could run anything when opened by itself (scripts, event handlers, outside references). Such files are refused. */
export function svgIsUnsafe(text: string): boolean {
  return /<script|<foreignObject|<iframe|<embed|<object|\son[a-z]+\s*=|javascript:|<!ENTITY|<link|<meta|xlink:href\s*=\s*["'](?!#|data:image\/)/i.test(text);
}

type Sharp = (input: Uint8Array, options?: Record<string, unknown>) => {
  rotate(): ReturnType<Sharp>;
  trim(options?: Record<string, unknown>): ReturnType<Sharp>;
  resize(options: Record<string, unknown>): ReturnType<Sharp>;
  webp(options: Record<string, unknown>): ReturnType<Sharp>;
  toBuffer(): Promise<Buffer>;
};

async function loadSharp(): Promise<Sharp | null> {
  try {
    const name = "sharp"; // by name, so a host without it simply falls back instead of failing to build
    const mod = (await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ name)) as { default: Sharp };
    return mod.default;
  } catch {
    return null;
  }
}

export async function processImage(
  input: Uint8Array,
  opts: { max: number; quality: number; trim?: boolean },
): Promise<ProcessedImage> {
  const kind = sniffImage(input);
  if (!kind) throw new Error("That file isn’t a picture this site can use. Use PNG, JPG, WebP, AVIF, GIF, SVG or TIFF.");

  if (kind === "svg") {
    // Kept as a vector (it stays sharp at any size), after making sure it can't run anything.
    const text = new TextDecoder().decode(input);
    if (svgIsUnsafe(text)) throw new Error("That SVG contains scripts or outside links, so it can’t be used. Export a plain SVG from your design tool.");
    return { bytes: input, ext: "svg", contentType: TYPES.svg, encoded: false };
  }

  const sharp = await loadSharp();
  if (sharp) {
    // An animated GIF becomes an animated WebP (same motion, far smaller); everything else becomes still WebP.
    let img = sharp(input, { limitInputPixels: false, animated: kind === "gif" }).rotate();
    if (opts.trim && kind !== "gif") img = img.trim({ threshold: 1 });
    const out = await img
      .resize({ width: opts.max, height: opts.max, fit: "inside", withoutEnlargement: true })
      .webp({ quality: opts.quality, alphaQuality: 100, effort: 5, smartSubsample: true })
      .toBuffer();
    return { bytes: new Uint8Array(out), ext: "webp", contentType: TYPES.webp, encoded: true };
  }
  if (kind === "tiff") throw new Error("TIFF pictures can’t be read on this server. Save it as PNG or JPG and upload that.");
  return { bytes: input, ext: kind, contentType: TYPES[kind], encoded: false };
}
