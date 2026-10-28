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
  image: { pattern: /\.(png|jpe?g|webp|avif)$/i, accept: "image/png,image/webp,image/jpeg,image/avif", maxMb: 30, noun: "an image (PNG, JPG, WebP or AVIF)" },
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
