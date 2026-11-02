// Server-only: reads and writes the creator's content (text, lists, images, fonts), through the storage layer
// (plain files on your computer, an R2 bucket on Cloudflare — see lib/storage.ts).
import { readJson, writeJsonSafely } from "@/lib/storage";
import { sanitizeContent } from "./sanitize";
import type { SiteContent } from "./types";

const KEY = "content/site-content.json";

export async function getContent(): Promise<SiteContent> {
  // Public pages are prerendered at build time. Their providers fetch the latest
  // published data in the browser; rendering a whole page on every Worker request
  // exceeds the CPU budget of Cloudflare's free tier.
  const value = sanitizeContent((await readJson<unknown>(KEY)) ?? {});
  return value;
}

export async function writeContent(content: SiteContent): Promise<void> {
  await writeJsonSafely(KEY, content, "content");
}
