// Server-only: checks that an upload really is a picture, and (where the server can) shrinks and re-encodes it.
//
// The picture tool "sharp" is used when the server has it (your computer, a normal host). On Cloudflare it isn't
// available, so the picture is stored exactly as sent (the portal already shrinks oversized pictures in the browser
// before sending), after being checked by its first bytes.

export interface ProcessedImage {
  bytes: Uint8Array;
  /** File extension without the dot. */
  ext: "webp" | "png" | "jpg" | "avif";
  contentType: string;
  /** True when it was re-encoded here. */
  encoded: boolean;
}

const TYPES = { webp: "image/webp", png: "image/png", jpg: "image/jpeg", avif: "image/avif" } as const;

/** What kind of picture these bytes are, from their first bytes (not from the file name or the type the browser claims). */
export function sniffImage(b: Uint8Array): ProcessedImage["ext"] | null {
  if (b.length > 12 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "png";
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
  const ascii = (from: number, to: number) => String.fromCharCode(...b.subarray(from, to));
  if (b.length > 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "webp";
  if (b.length > 12 && ascii(4, 8) === "ftyp" && /avif|avis/.test(ascii(8, 16))) return "avif";
  return null;
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
  if (!kind) throw new Error("That file isn’t a PNG, JPG, WebP or AVIF picture.");
  const sharp = await loadSharp();
  if (sharp) {
    let img = sharp(input, { limitInputPixels: false }).rotate();
    if (opts.trim) img = img.trim({ threshold: 1 });
    const out = await img
      .resize({ width: opts.max, height: opts.max, fit: "inside", withoutEnlargement: true })
      .webp({ quality: opts.quality, alphaQuality: 100, effort: 5, smartSubsample: true })
      .toBuffer();
    return { bytes: new Uint8Array(out), ext: "webp", contentType: TYPES.webp, encoded: true };
  }
  return { bytes: input, ext: kind, contentType: TYPES[kind], encoded: false };
}
