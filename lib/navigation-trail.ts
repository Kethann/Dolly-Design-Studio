/** Only known public routes can become breadcrumb destinations. Never trust a stored redirect. */
export const HOME_SECTIONS: Record<string, string> = {
  top: "Home", agency: "About", clients: "Clients", about: "Founder",
  collaborations: "Title disc", work: "Projects", process: "How we work",
  making: "Photos & BTS", services: "Services", contact: "Contact",
};
export const TRAIL_LIMIT = 6;
export function hashSection(hash: string): string {
  try { return decodeURIComponent(hash.replace(/^#/, "")); } catch { return ""; }
}
export function trailPath(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 240 || !value.startsWith("/") || value.startsWith("//") || /[\\\s%]/.test(value)) return null;
  const [path, hash = ""] = value.split("#");
  const clean = path.split("?")[0].replace(/\/$/, "") || "/";
  if (clean === "/") return hash && hash !== "top" && Object.hasOwn(HOME_SECTIONS, hash) ? `/#${hash}` : "/";
  return /^\/(?:work(?:\/[a-z0-9-]+)?|process\/[a-z0-9-]+|breakdowns)$/.test(clean) ? clean : null;
}
export function defaultTrail(path: string): string[] {
  const clean = trailPath(path);
  if (!clean || clean === "/") return ["/"];
  if (clean.startsWith("/work/")) return ["/", "/work", clean];
  if (clean.startsWith("/process/") || clean === "/breakdowns") return ["/", "/#process", clean];
  return ["/", clean];
}
export function readTrail(value: unknown, current: string): string[] | null {
  if (!Array.isArray(value) || !value.length || value.length > TRAIL_LIMIT || value[0] !== "/") return null;
  if (value.some(p => trailPath(p) !== p) || new Set(value).size !== value.length || value.at(-1) !== current) return null;
  return [...value];
}
export function advanceTrail(paths: readonly string[], destination: string): string[] {
  const to = trailPath(destination);
  if (!to) return [...paths];
  if (to === "/") return ["/"];
  const safe = [...new Set(paths.filter(p => trailPath(p) === p))];
  const at = safe.indexOf(to);
  if (at >= 0) return safe.slice(0, at + 1);
  const next = [...safe.filter(p => p !== "/"), to];
  return ["/", ...next.slice(-(TRAIL_LIMIT - 1))];
}
export function trailHref(path: string, preview: boolean): string {
  const safe = trailPath(path) ?? "/";
  const [route, hash] = safe.split("#");
  return route + (preview ? "?portal-preview" : "") + (hash ? `#${hash}` : "");
}
