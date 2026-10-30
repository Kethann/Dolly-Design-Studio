import manifest from "@/content/generated/image-manifest.json";
import imageLoader from "./image-loader";

export interface ImageMeta {
  width: number;
  height: number;
  /** Tiny blurred preview shown while the full image loads. */
  blur: string;
  /** Short hash of the file's bytes — changes whenever the image is replaced. */
  version: string;
}

/** Match the gallery's gutters, responsive breakpoints and portal-selected column count. */
export function galleryImageSizes(columns: "Auto" | "2" | "3" | "4"): string {
  const count = Number(columns);
  const desktop = columns === "Auto"
    ? "(max-width: 1140px) 30vw, 320px"
    : `(max-width: 1360px) calc(${90 / count}vw - ${36 * (count - 1) / count}px), ${Math.ceil((1232 - 36 * (count - 1)) / count)}px`;
  return `(max-width: 520px) calc(100vw - 40px), (max-width: 900px) calc(45vw - 14px), ${desktop}`;
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

/**
 * A srcset for a plain <img> (the pictures inside "How we work" cards): the same picture at several widths, so the browser
 * takes the one nearest the size it is shown at. Only on the live site, where Cloudflare makes the smaller copies.
 */
export function srcSetFor(src: string, widths = [480, 828, 1280, 1920, 2560]): string | undefined {
  if (process.env.NODE_ENV !== "production" || !src.startsWith("/")) return undefined;
  if (/\.(svg|gif)(?:[?#]|$)/i.test(src)) return undefined;
  return widths
    .map((w) => `${imageLoader({ src: versionedSrc(src), width: w, quality: 90 })} ${w}w`)
    .join(", ");
}

/** The picture at a given width where Cloudflare can make that copy (the live site); otherwise the picture itself. For tiny uses (a mask, the shape of a picture) that must not pull in the full-size file. */
export function resizedSrc(src: string, width: number): string {
  if (process.env.NODE_ENV !== "production" || !/^\/images\/(uploads|proof-table)\//.test(src) || /\.(svg|gif)(?:[?#]|$)/i.test(src)) return versionedSrc(src);
  return imageLoader({ src: versionedSrc(src), width });
}
