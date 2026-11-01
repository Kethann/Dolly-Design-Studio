import type { ClientEntry } from "@/content/types";
import type { SiteContent } from "./types";

export type ClientTrack = "clients" | "clientsSecond";
export const isClientTrack = (list: string): list is ClientTrack => list === "clients" || list === "clientsSecond";
export const otherClientTrack = (list: ClientTrack): ClientTrack => list === "clients" ? "clientsSecond" : "clients";
export const clientLogoKey = (item: ClientEntry) => item.logo
  ? `image:${item.logo.split(/[?#]/)[0]}`
  : `name:${item.name.trim().toLocaleLowerCase()}`;

/** One assignment per logo. Older copies of row one never populate row two. */
export function uniqueClientTracks(first: ClientEntry[], second: ClientEntry[]) {
  const seen = new Set<string>();
  const unique = (items: ClientEntry[]) => items.filter(item => {
    const key = clientLogoKey(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { clients: unique(first), clientsSecond: unique(second) };
}

/** Transfer the complete entry, preserving artwork, captions and order elsewhere. */
export function moveClientTrack(content: SiteContent, from: ClientTrack, index: number): SiteContent {
  const item = content[from][index];
  if (!item) return content;
  const to = otherClientTrack(from);
  return { ...content,
    [from]: content[from].filter((_, i) => i !== index),
    [to]: [...content[to].filter(entry => clientLogoKey(entry) !== clientLogoKey(item)), item],
  };
}
