export const RETENTION_MS = 30 * 86400_000;
export const LIVE_MS = 90_000;
export const MAX_PAGES = 50;
export interface VisitPage { path: string; seconds: number; depth: number; views: number }
export interface VisitInput { id: string; sequence: number; current: string; pages: VisitPage[]; ended?: boolean }
export interface Visit extends VisitInput {
  firstSeen: number; lastSeen: number; device: string;
  location: string; locationSource: "IPstack" | "Cloudflare" | "Unavailable";
}
export interface VisitorReport {
  enabled: boolean; ipstack: boolean; local: boolean;
  total: number; live: number; visits: Visit[]; next: string | null; at: number;
}
export function publicVisitPath(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length > 240) return null;
  // Only public destinations; never keep searches, form contents or account URLs.
  const value = raw.split("?")[0];
  return /^(?:\/(?:#(?:top|agency|clients|about|collaborations|work|process|making|services|contact))?|\/work(?:\/[a-z0-9-]{1,100})?|\/process\/[a-z0-9-]{1,100}|\/breakdowns)$/.test(value) ? value : null;
}
export function visitId(raw: unknown): raw is string {
  return typeof raw === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(raw);
}
export function parseVisit(raw: unknown): VisitInput | null {
  if (!raw || typeof raw !== "object") return null;
  const v = raw as Record<string, unknown>;
  const current = publicVisitPath(v.current);
  if (v.consent !== true || !visitId(v.id) || !current || !Number.isSafeInteger(v.sequence) || Number(v.sequence) < 1 || Number(v.sequence) > 100_000 || !Array.isArray(v.pages) || v.pages.length > MAX_PAGES) return null;
  const pages: VisitPage[] = [];
  const seen = new Set<string>();
  for (const item of v.pages) {
    if (!item || typeof item !== "object") return null;
    const path = publicVisitPath(item.path);
    if (!path || seen.has(path)) return null;
    for (const [key, max] of [["seconds", 86400], ["depth", 100], ["views", 1000]] as const) {
      if (!Number.isInteger(item[key]) || item[key] < 0 || item[key] > max) return null;
    }
    seen.add(path); pages.push({ path, seconds: item.seconds, depth: item.depth, views: item.views });
  }
  if (!pages.length || !seen.has(current)) return null;
  return { id: v.id, current, pages, sequence: Number(v.sequence), ended: v.ended === true };
}

/** Keep reported engagement within actual elapsed time; values are estimates, not identity or proof of attention. */
export function timedVisit(input: VisitInput, previous: Visit | null, now: number): VisitInput {
  let remaining = Math.max(0, Math.floor((now - (previous?.firstSeen ?? now)) / 1000));
  return { ...input, pages: input.pages.map(page => {
    const seconds = Math.min(page.seconds, remaining);
    remaining -= seconds;
    return { ...page, seconds };
  }) };
}
