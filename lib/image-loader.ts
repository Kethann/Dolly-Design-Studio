// Tells next/image where to get a picture at a given width. On Cloudflare the pictures are resized there (by the Worker's
// Images binding), so a phone downloads and keeps in memory a picture the size of its screen, not the 3200 px original.
//   • pictures that came with the site: through the Worker's /_next/image
//   • pictures uploaded in the portal (stored in R2): the same address with ?w=<width>, resized by the upload route
export default function imageLoader({ src, width, quality }: { src: string; width: number; quality?: number }): string {
  if (!src.startsWith("/")) return src;
  const [path, query = ""] = src.split("?");
  if (path.startsWith("/images/uploads/")) return `${path}?${query ? `${query}&` : ""}w=${width}`;
  return `/_next/image?url=${encodeURIComponent(src)}&w=${width}&q=${quality ?? 75}`;
}
