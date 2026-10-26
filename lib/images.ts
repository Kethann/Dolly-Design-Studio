import manifest from "@/content/generated/image-manifest.json";

export interface ImageMeta {
  width: number;
  height: number;
  /** Tiny blurred preview shown while the full image loads. */
  blur: string;
  /** Short hash of the file's bytes — changes whenever the image is replaced. */
  version: string;
}

/**
 * Size + blur placeholder for an image in /public/images (from the manifest
 * that `npm run images` generates). Returns undefined for images that haven't
 * been added to the manifest yet — they still display, just without blur-up.
 */
export function getImageMeta(src: string): ImageMeta | undefined {
  return (manifest as Record<string, ImageMeta>)[src];
}

/** next/image placeholder props for an image: blur-up when available, nothing otherwise. */
export function placeholderProps(src: string) {
  const meta = getImageMeta(src);
  return meta ? ({ placeholder: "blur", blurDataURL: meta.blur } as const) : ({ placeholder: "empty" } as const);
}

/**
 * `src` with a `?v=<hash of its bytes>` tag, so replacing a poster with a new
 * file of the same name is guaranteed to show up immediately — a changed hash
 * makes it a new address, bypassing every cache (the browser's, Next's own
 * image optimizer, and any CDN) rather than relying on them to notice.
 * Falls back to the plain path if the image isn't in the manifest yet.
 */
export function versionedSrc(src: string): string {
  const meta = getImageMeta(src);
  return meta ? `${src}?v=${meta.version}` : src;
}
