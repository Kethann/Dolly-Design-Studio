import type { PageKey } from "./types";

export const PAGE_KEYS: PageKey[] = ["home", "work", "project", "notFound"];

/** The look-settings page a web address belongs to: the home page, the gallery, a project, or anything else (not found). */
export function pageKeyOf(pathname: string | null | undefined): PageKey {
  if (!pathname || pathname === "/") return "home";
  if (pathname === "/work") return "work";
  if (pathname.startsWith("/work/")) return "project";
  return "notFound";
}
