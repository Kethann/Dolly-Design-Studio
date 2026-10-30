import type { SiteContent } from "./types";
import type { IntroSettings } from "@/lib/intro/settings";

const imagePath = (value: string) => value.split(/[?#]/)[0];
const isBrandOrTexture = (src: string) => /^\/images\/(brand|textures|star-textures)\//.test(imagePath(src));
const mediaFields = new Set(["src", "image", "photo", "logo", "sample", "backdrop"]);

/** Reset image fields only. Text, captions, array positions, fonts and layout values stay intact. */
export function clearContentMedia<T>(value: T, field = ""): T {
  if (typeof value === "string") {
    return (mediaFields.has(field) && value.startsWith("/images/") && !isBrandOrTexture(value) ? "" : value) as T;
  }
  if (Array.isArray(value)) return value.map((entry) => clearContentMedia(entry, field)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, clearContentMedia(entry, key)])) as T;
  }
  return value;
}

/** The slate shares a settings document with the intro; only its card images may be cleared. */
export function resetMedia(content: SiteContent, settings: IntroSettings) {
  return {
    content: clearContentMedia(content),
    settings: {
      ...settings,
      proofTable: { ...settings.proofTable, items: clearContentMedia(settings.proofTable.items) },
    },
  };
}

/** Preserve every dependency of the intro/background, even if it was uploaded into the general library. */
export function protectedMedia(settings: IntroSettings): Set<string> {
  const found = new Set<string>();
  const walk = (value: unknown) => {
    if (typeof value === "string" && value.startsWith("/images/")) found.add(imagePath(value));
    else if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === "object") Object.values(value).forEach(walk);
  };
  for (const [key, value] of Object.entries(settings)) if (key !== "proofTable") walk(value);
  return found;
}

/** Only ordinary library images and slate artwork are candidates; never fonts, logos or star textures. */
export function canResetMediaFile(key: string, protectedUrls: Set<string>): boolean {
  const match = /^uploads\/(images|proof)\/([\w.-]+)$/.exec(key);
  if (!match || match[2].includes("..")) return false;
  const url = `/images/${match[1] === "images" ? "uploads" : "proof-table"}/${match[2]}`;
  return !protectedUrls.has(url);
}
