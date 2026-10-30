/** "WebP" from "/images/uploads/photo-3fa2c1.webp": the format of a stored picture, read from its name. */
export function fileSizeLabel(src: string): string {
  const ext = src.split("?")[0].split(".").pop()?.toLowerCase() ?? "";
  const names: Record<string, string> = { jpg: "JPG", jpeg: "JPG", png: "PNG", webp: "WebP", avif: "AVIF", gif: "GIF", svg: "SVG" };
  return names[ext] ?? ext.toUpperCase();
}
/** A readable filename even when a legacy URL contains an invalid percent escape. */
export function fileName(src: string): string {
  const name = src.split(/[?#]/)[0].split("/").pop() ?? "";
  try { return decodeURIComponent(name); } catch { return name; }
}
