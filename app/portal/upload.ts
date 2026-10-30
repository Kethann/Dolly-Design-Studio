import { MAX_PSD_MB } from "./psd-budget";

/** Sends one file to a portal upload route, reporting progress (fetch can't, so this uses XMLHttpRequest). */
export function postFile<T>(url: string, file: File, onProgress?: (percent: number) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      let data: { error?: string } = {};
      try {
        data = JSON.parse(xhr.responseText);
      } catch {}
      if (xhr.status >= 200 && xhr.status < 300) resolve(data as T);
      else reject(new Error(data.error ?? (xhr.status === 401 ? "Your session has ended. Sign in again." : "Upload failed.")));
    };
    xhr.timeout = 10 * 60_000;
    xhr.ontimeout = () => reject(new Error("The upload took too long. Check the connection and try again."));
    xhr.onabort = () => reject(new Error("The upload was cancelled."));
    xhr.onerror = () => reject(new Error("Couldn’t reach the server. Check the connection and try again."));
    const form = new FormData();
    form.append("file", file);
    xhr.send(form);
  });
}

/** The most one uploaded file may weigh. Anything bigger is refused (pictures made from a Photoshop file's layers are fitted under it). */
export const MAX_UPLOAD_MB = 6;

/** What each kind of upload accepts, checked in the browser first so mistakes are caught before sending. */
export const UPLOAD_KINDS = {
  image: {
    pattern: /\.(png|jpe?g|jfif|webp|avif|gif|svg|bmp|ico|tiff?|heic|heif)$/i,
    accept: "image/*,.png,.jpg,.jpeg,.jfif,.webp,.avif,.gif,.svg,.bmp,.ico,.tif,.tiff,.heic,.heif",
    maxMb: MAX_UPLOAD_MB,
    noun: "a picture",
  },
  layers: { pattern: /\.(psd|psb|psdt|pdd|png|jpe?g|jfif|webp|avif|gif|svg|bmp|ico|tiff?|heic|heif)$/i, accept: "image/*,.psd,.psb,.psdt,.pdd,.png,.jpg,.jpeg,.jfif,.webp,.avif,.gif,.svg,.bmp,.ico,.tif,.tiff,.heic,.heif", maxMb: MAX_UPLOAD_MB, noun: "a Photoshop file or an image" },
  psd: { pattern: /\.(psd|psb|psdt|pdd)$/i, accept: ".psd,.psb,.psdt,.pdd,image/vnd.adobe.photoshop", maxMb: MAX_PSD_MB, /* only the exported layers are sent to the server */ noun: "a Photoshop file (PSD, PSB, PSDT or PDD)" },
  font: { pattern: /\.(ttf|otf|woff2?)$/i, accept: ".ttf,.otf,.woff,.woff2", maxMb: MAX_UPLOAD_MB, noun: "a font (TTF, OTF, WOFF or WOFF2)" },
} as const;

export type UploadKind = keyof typeof UPLOAD_KINDS;

/** Why a file can't be uploaded, or null if it can. */
export function checkFile(file: File, kind: UploadKind): string | null {
  const k = UPLOAD_KINDS[kind];
  // Any picture is welcome: by its ending, or by what the browser says it is (a file with an unusual ending still counts).
  const pictureByType = kind === "image" && file.type.startsWith("image/");
  if (!k.pattern.test(file.name) && !pictureByType) return `“${file.name}” isn’t ${k.noun}.`;
  const photoshop = /\.(psd|psb|psdt|pdd)$/i.test(file.name);
  const limit = photoshop ? MAX_PSD_MB : k.maxMb;
  if (file.size > limit * 1024 * 1024) return `“${file.name}” is over ${limit} MB. ${photoshop ? "Export a smaller Photoshop file or upload its layers as PNG images." : `Make it smaller (the limit is ${limit} MB per file) and try again.`}`;
  return null;
}

/** Formats the server reads itself; anything else a browser can show is turned into a picture the server can read here first. */
const SERVER_READS = /\.(png|jpe?g|jfif|webp|avif|gif|svg|tiff?)$/i;
const SERVER_MAX = MAX_UPLOAD_MB * 1024 * 1024;
/** The longest side a re-encoded picture keeps: far more than any screen shows, so nothing visible is lost. */
const LONGEST_SIDE = 3200;

/**
 * Gets a picture ready to send. One the server can read and that is within the limit goes as it is. Anything else that
 * a browser can open (BMP, ICO, HEIC… or a layer taken from a Photoshop file) is re-encoded here as WebP (transparency
 * kept), a little smaller each try, until it fits under the limit. Animated GIFs and SVGs are never touched, and a file
 * that can't be made to fit is refused rather than uploaded.
 */
export async function prepareImage(file: File): Promise<File> {
  const readable = SERVER_READS.test(file.name);
  const tooBig = `This picture is over ${MAX_UPLOAD_MB} MB even after shrinking, so it wasn’t uploaded. Export it smaller and try again.`;
  if (readable && file.size <= SERVER_MAX) return file;
  if (/\.(gif|svg)$/i.test(file.name)) throw new Error(`This file is over ${MAX_UPLOAD_MB} MB, so it wasn’t uploaded.`);
  let bitmap: ImageBitmap | null = null;
  let canvas: HTMLCanvasElement | null = null;
  try {
    bitmap = await createImageBitmap(file);
    const base = Math.min(1, LONGEST_SIDE / Math.max(bitmap.width, bitmap.height));
    // Each try: a little less quality, then a little smaller, until it fits.
    for (const [quality, shrink] of [[0.92, 1], [0.85, 1], [0.8, 0.85], [0.75, 0.7], [0.7, 0.55], [0.65, 0.4]] as const) {
      const scale = base * shrink;
      canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const g = canvas.getContext("2d");
      if (!g) throw new Error("no canvas");
      g.imageSmoothingQuality = "high";
      g.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const surface = canvas;
      const blob = await new Promise<Blob | null>((resolve) => surface.toBlob(resolve, "image/webp", quality));
      canvas.width = canvas.height = 0; // let go of the pixels at once
      if (blob && blob.size <= SERVER_MAX) {
        return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".webp", { type: blob.type || "image/webp" });
      }
    }
    throw new Error(tooBig);
  } catch (err) {
    if (err instanceof Error && err.message === tooBig) throw err;
    const heic = /\.(heic|heif)$/i.test(file.name);
    throw new Error(
      heic
        ? "This browser can’t open HEIC photos. Export it as JPG first (on an iPhone: Settings → Camera → Formats → Most Compatible, or share it as JPG), then upload that."
        : `This browser can’t open that picture, or it is over ${MAX_UPLOAD_MB} MB. Save it as PNG or JPG under ${MAX_UPLOAD_MB} MB and upload that.`,
    );
  } finally {
    bitmap?.close();
    if (canvas) canvas.width = canvas.height = 0;
  }
}
