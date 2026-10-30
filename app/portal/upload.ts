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

/** What each kind of upload accepts, checked in the browser first so mistakes are caught before sending. */
export const UPLOAD_KINDS = {
  image: {
    pattern: /\.(png|jpe?g|jfif|webp|avif|gif|svg|bmp|ico|tiff?|heic|heif)$/i,
    accept: "image/*,.png,.jpg,.jpeg,.jfif,.webp,.avif,.gif,.svg,.bmp,.ico,.tif,.tiff,.heic,.heif",
    maxMb: 1000, // big pictures are shrunk in the browser before they are sent (see prepareImage), so size is not a limit
    noun: "a picture",
  },
  layers: { pattern: /\.(psd|psb|psdt|pdd|png|jpe?g|jfif|webp|avif|gif|svg|bmp|ico|tiff?|heic|heif)$/i, accept: "image/*,.psd,.psb,.psdt,.pdd,.png,.jpg,.jpeg,.jfif,.webp,.avif,.gif,.svg,.bmp,.ico,.tif,.tiff,.heic,.heif", maxMb: 1000, noun: "a Photoshop file or an image" },
  psd: { pattern: /\.(psd|psb|psdt|pdd)$/i, accept: ".psd,.psb,.psdt,.pdd,image/vnd.adobe.photoshop", maxMb: 1000, noun: "a Photoshop file (PSD, PSB, PSDT or PDD)" },
  font: { pattern: /\.(ttf|otf|woff2?)$/i, accept: ".ttf,.otf,.woff,.woff2", maxMb: 10, noun: "a font (TTF, OTF, WOFF or WOFF2)" },
} as const;

export type UploadKind = keyof typeof UPLOAD_KINDS;

/** Why a file can't be uploaded, or null if it can. */
export function checkFile(file: File, kind: UploadKind): string | null {
  const k = UPLOAD_KINDS[kind];
  // Any picture is welcome: by its ending, or by what the browser says it is (a file with an unusual ending still counts).
  const pictureByType = kind === "image" && file.type.startsWith("image/");
  if (!k.pattern.test(file.name) && !pictureByType) return `“${file.name}” isn’t ${k.noun}.`;
  if (file.size > k.maxMb * 1024 * 1024) return `“${file.name}” is over ${k.maxMb} MB.`;
  return null;
}

/** Formats the server reads itself; anything else a browser can show is turned into a picture the server can read here first. */
const SERVER_READS = /\.(png|jpe?g|jfif|webp|avif|gif|svg|tiff?)$/i;
/** A picture bigger than this is re-encoded in the browser; one larger than the server takes (even then) is refused. */
const SHRINK_ABOVE = 10 * 1024 * 1024;
const SERVER_MAX = 90 * 1024 * 1024;
/** The longest side a shrunk picture keeps: far more than any screen shows, so nothing visible is lost. */
const LONGEST_SIDE = 4096;

/**
 * Gets a picture ready to send, whatever it is. A normal-sized PNG, JPG, WebP, AVIF, GIF, SVG or TIFF goes as it is. A very
 * large one (or any format the server can't read: BMP, ICO, HEIC where the browser can open it…) is decoded here, scaled
 * down to at most 4096 pixels on its long side if it is bigger, and sent as a high-quality WebP, so no size or format
 * stops an upload and the page never has to load a huge file. Animated GIFs and SVGs are never touched.
 */
export async function prepareImage(file: File): Promise<File> {
  const readable = SERVER_READS.test(file.name);
  const keep = /\.(gif|svg)$/i.test(file.name);
  if (keep || (readable && file.size <= SHRINK_ABOVE)) {
    if (file.size > SERVER_MAX) throw new Error("This file is larger than 90 MB. Export it smaller and upload that.");
    return file;
  }
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, LONGEST_SIDE / Math.max(bitmap.width, bitmap.height));
    if (readable && scale === 1 && file.size <= SERVER_MAX) {
      bitmap.close?.();
      return file; // large in bytes but not in pixels, and the server can take it
    }
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const g = canvas.getContext("2d");
    if (!g) throw new Error("no canvas");
    g.imageSmoothingQuality = "high";
    g.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.92));
    if (!blob) throw new Error("no blob");
    if (blob.size > SERVER_MAX) throw new Error("too big");
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".webp", { type: blob.type || "image/webp" });
  } catch {
    if (readable && file.size <= SERVER_MAX) return file; // couldn't be shrunk here, but the server can take it as it is
    const heic = /\.(heic|heif)$/i.test(file.name);
    throw new Error(
      heic
        ? "This browser can’t open HEIC photos. Export it as JPG first (on an iPhone: Settings → Camera → Formats → Most Compatible, or share it as JPG), then upload that."
        : "This browser can’t open that picture, or it is still over 90 MB after shrinking. Save it as PNG or JPG and upload that.",
    );
  }
}
