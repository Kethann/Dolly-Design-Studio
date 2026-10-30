// Server-only: reads and writes the creator's content (text, lists, images, fonts), through the storage layer
// (plain files on your computer, an R2 bucket on Cloudflare — see lib/storage.ts).
import { connection } from "next/server";
import { onCloudflare, readJson, writeJsonSafely } from "@/lib/storage";
import { sanitizeContent } from "./sanitize";
import type { SiteContent } from "./types";

const KEY = "content/site-content.json";

/** On Cloudflare, a short memory per worker saves a storage read on every single page view. */
let remembered: { at: number; value: SiteContent } | null = null;
const REMEMBER_MS = 4000;

export async function getContent(): Promise<SiteContent> {
  if (onCloudflare()) {
    // Pages there are built fresh for each visit from what is saved now (never frozen at build time).
    try {
      await connection();
    } catch {}
    if (remembered && Date.now() - remembered.at < REMEMBER_MS) return remembered.value;
  }
  const value = sanitizeContent((await readJson<unknown>(KEY)) ?? {});
  if (onCloudflare()) remembered = { at: Date.now(), value };
  return value;
}

export async function writeContent(content: SiteContent): Promise<void> {
  await writeJsonSafely(KEY, content, "content");
  remembered = null;
}
