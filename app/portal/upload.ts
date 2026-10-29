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
    maxMb: 30,
    noun: "an image (PNG, JPG, WebP, AVIF, GIF, SVG, BMP, ICO, TIFF or HEIC)",
  },
  layers: { pattern: /\.(psd|png|jpe?g|jfif|webp|avif|gif|svg|bmp|ico|tiff?|heic|heif)$/i, accept: "image/*,.psd,.png,.jpg,.jpeg,.jfif,.webp,.avif,.gif,.svg,.bmp,.ico,.tif,.tiff,.heic,.heif", maxMb: 400, noun: "a Photoshop file or an image" },
  psd: { pattern: /\.psd$/i, accept: ".psd,image/vnd.adobe.photoshop", maxMb: 400, noun: "a Photoshop file (PSD)" },
  font: { pattern: /\.(ttf|otf|woff2?)$/i, accept: ".ttf,.otf,.woff,.woff2", maxMb: 10, noun: "a font (TTF, OTF, WOFF or WOFF2)" },
} as const;

export type UploadKind = keyof typeof UPLOAD_KINDS;

/** Why a file can't be uploaded, or null if it can. */
export function checkFile(file: File, kind: UploadKind): string | null {
  const k = UPLOAD_KINDS[kind];
  if (!k.pattern.test(file.name)) return `“${file.name}” isn’t ${k.noun}.`;
  if (file.size > k.maxMb * 1024 * 1024) return `“${file.name}” is over ${k.maxMb} MB.`;
  return null;
}

/** Formats the server reads itself; anything else a browser can show is turned into a PNG here first. */
const SERVER_READS = /\.(png|jpe?g|jfif|webp|avif|gif|svg|tiff?)$/i;

/**
 * Gets a picture ready to send. PNG, JPG, WebP, AVIF, GIF, SVG and TIFF go as they are; BMP, ICO and the like are
 * drawn onto a canvas and sent as PNG (the browser does the decoding). A format this browser can't open (HEIC in most
 * browsers) is refused with a plain message about what to do instead.
 */
export async function prepareImage(file: File): Promise<File> {
  if (SERVER_READS.test(file.name)) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
    bitmap.close?.();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("no blob");
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".png", { type: "image/png" });
  } catch {
    const heic = /\.(heic|heif)$/i.test(file.name);
    throw new Error(
      heic
        ? "This browser can’t open HEIC photos. Export it as JPG first (on an iPhone: Settings → Camera → Formats → Most Compatible, or share it as JPG), then upload that."
        : "This browser can’t open that picture. Save it as PNG or JPG and upload that.",
    );
  }
}
