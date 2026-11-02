import { readJson, updateJsonAtomically } from "@/lib/storage";

const KEY = "content/library-hidden.json";
const valid = (src: unknown): src is string => typeof src === "string" && /^\/images\/(?:[a-z0-9-]+\/)*[\w.-]+\.(?:webp|png|jpe?g|avif|gif|svg)$/i.test(src) && !src.includes("..");
const clean = (value: unknown): string[] => Array.isArray(value) ? [...new Set(value.filter(valid))] : [];

/** Hidden pictures remain stored and servable, so existing pages never get a broken image. */
export async function hiddenLibraryImages(): Promise<string[]> {
  return clean(await readJson<unknown>(KEY));
}

export async function setLibraryImageHidden(src: string, hidden: boolean): Promise<void> {
  if (!valid(src)) throw new Error("Invalid library picture.");
  await updateJsonAtomically<unknown, void>(KEY, [], (current) => {
    const items = clean(current);
    const next = hidden ? [...new Set([...items, src])] : items.filter((item) => item !== src);
    return { value: next, result: undefined };
  });
}
