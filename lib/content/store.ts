// Server-only: reads and writes the creator's content (text, lists, images, fonts), through the storage layer
// (plain files on your computer, an R2 bucket on Cloudflare — see lib/storage.ts).
import { connection } from "next/server";
import { onCloudflare, readJson, writeJsonSafely } from "@/lib/storage";
import { sanitizeContent } from "./sanitize";
import type { SiteContent } from "./types";

const KEY = "content/site-content.json";

export async function getContent(): Promise<SiteContent> {
  if (onCloudflare()) {
    // Pages there are built fresh for each visit from what is saved now (never frozen at build time).
    try {
      await connection();
    } catch {}
  }
  // The outer Worker caches HTML by document etag. A miss must use fresh data, or old content
  // could be cached under the new etag after another Worker publishes.
  const value = sanitizeContent((await readJson<unknown>(KEY)) ?? {});
  return value;
}

export async function writeContent(content: SiteContent): Promise<void> {
  await writeJsonSafely(KEY, content, "content");
}
