// The smaller copies of an uploaded picture, made ahead of time (by the uploader's browser, or scripts/make-image-sizes.mjs)
// and kept in R2. Workers Free has too little CPU to resize during a visit, so the Worker only ever streams one of these.
export const IMAGE_SIZE_WIDTHS = [160, 320, 640, 1080, 1600, 2400];
export const IMAGE_SIZE_QUALITY = 92;

/** The copy that covers a requested width, or null when only the original is big enough. */
export function imageSizeWidth(requested: number): number | null {
  return IMAGE_SIZE_WIDTHS.find((width) => width >= requested) ?? null;
}

/** Where one copy of an original is stored ("uploads/images/art.png" → "uploads/sizes/images/art.png/640.webp"). */
export function imageSizeKey(originalKey: string, width: number): string {
  return `uploads/sizes/${originalKey.slice("uploads/".length)}/${width}.webp`;
}

/** Every copy an original can have; none for files that are never resized (SVG, GIF, fonts, videos). */
export function imageSizeKeys(originalKey: string): string[] {
  if (!/^uploads\/(images|proof)\/[^/]+\.(webp|png|jpe?g|avif)$/i.test(originalKey)) return [];
  return IMAGE_SIZE_WIDTHS.map((width) => imageSizeKey(originalKey, width));
}
