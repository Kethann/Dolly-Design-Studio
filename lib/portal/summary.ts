// Server-only: turns "the saved version" and "the new version" into a plain list of what changed, for the activity log.
import type { SiteContent } from "@/lib/content/types";
import type { IntroSettings } from "@/lib/intro/settings";

const differ = (a: unknown, b: unknown) => JSON.stringify(a) !== JSON.stringify(b);

/** e.g. "Home page text, Projects (1 added, 2 edited), Brand colours" */
export function summarizeContent(prev: SiteContent, next: SiteContent): string {
  const parts: string[] = [];
  if (differ(prev.home, next.home)) parts.push("Home page text");
  if (differ(prev.services, next.services)) parts.push("Services");
  if (differ([prev.clients, prev.collaborators, prev.testimonials], [next.clients, next.collaborators, next.testimonials])) parts.push("Clients & collaborators");

  if (differ(prev.projects, next.projects)) {
    const before = new Map(prev.projects.map((p) => [p.slug, p]));
    const after = new Map(next.projects.map((p) => [p.slug, p]));
    const added = [...after.keys()].filter((k) => !before.has(k)).length;
    const removed = [...before.keys()].filter((k) => !after.has(k)).length;
    const edited = [...after.keys()].filter((k) => before.has(k) && differ(before.get(k), after.get(k))).length;
    const bits = [added && `${added} added`, removed && `${removed} removed`, edited && `${edited} edited`].filter(Boolean);
    const reordered = !bits.length && differ(prev.projects.map((p) => p.slug), next.projects.map((p) => p.slug));
    parts.push(`Projects${bits.length ? ` (${bits.join(", ")})` : reordered ? " (reordered)" : ""}`);
  }
  if (differ([prev.work, prev.projectPage, prev.notFound], [next.work, next.projectPage, next.notFound])) parts.push("Gallery & project pages");
  if (differ([prev.site, prev.nav, prev.footer], [next.site, next.nav, next.footer])) parts.push("Studio details & menu");
  if (differ(prev.slate, next.slate)) parts.push("Slate text");
  if (differ([prev.type, prev.fonts, prev.customFonts], [next.type, next.fonts, next.customFonts])) parts.push("Fonts & text styles");
  if (differ(prev.theme, next.theme)) parts.push("Brand colours");
  if (differ(prev.galleryLayout, next.galleryLayout)) parts.push("Gallery layout");
  return parts.join(", ") || "No visible changes";
}

/** Which part of the design a settings key belongs to. */
function designArea(key: string): string {
  if (key === "background" || key === "art") return "Page background";
  if (key === "proofTable") return "Title slate";
  if (key === "cursor" || key === "logoGlow") return "Cursor & glow";
  if (/^glass|^shield/i.test(key)) return "Logo glass";
  if (key === "colors") return "Star colours";
  if (/intro|sweep|formation|reveal|enabled|scatter|disperse/i.test(key)) return "Opening animation";
  return "Stars";
}

export function summarizeSettings(prev: IntroSettings, next: IntroSettings): string {
  const areas = new Set<string>();
  const a = prev as unknown as Record<string, unknown>;
  const b = next as unknown as Record<string, unknown>;
  for (const key of Object.keys(b)) if (differ(a[key], b[key])) areas.add(designArea(key));
  return [...areas].join(", ") || "No visible changes";
}
