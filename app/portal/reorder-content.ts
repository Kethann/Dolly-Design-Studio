import type { SiteContent } from "@/lib/content/types";
import { findList } from "./content-schema";

/** Move a card, retaining every other card's relative order. */
export function reorderContent(content: SiteContent, list: string, from: number, to: number): SiteContent {
  if (typeof list !== "string" || !/^[a-zA-Z]+(?:\.(?:[a-zA-Z]+|0|[1-9]\d*))*$/.test(list)) return content;
  const def = findList(list);
  if (!def && list !== "breakdowns") return content;
  const parts = list.split(".");
  let value: unknown = content;
  for (const key of parts) {
    if (!value || typeof value !== "object" || !Object.hasOwn(value, key)) return content;
    value = (value as Record<string, unknown>)[key];
  }
  if (!Array.isArray(value) || !Number.isInteger(from) || !Number.isInteger(to) || from === to || from < 0 || to < 0 || from >= value.length || to >= value.length) return content;
  const next = [...value];
  next.splice(to, 0, next.splice(from, 1)[0]);
  const numbered = def?.renumber ? next.map((item, index) => ({ ...item, ...def.renumber!(index) })) : next;
  const replace = (node: unknown, depth: number): unknown => {
    if (depth === parts.length) return numbered;
    const copy = (Array.isArray(node) ? [...node] : { ...(node as object) }) as Record<string, unknown>;
    copy[parts[depth]] = replace(copy[parts[depth]], depth + 1);
    return copy;
  };
  return replace(content, 0) as SiteContent;
}
