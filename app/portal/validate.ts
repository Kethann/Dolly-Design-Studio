import { MAX_CATEGORIES, MAX_CATEGORY_LENGTH } from "@/lib/content/limits";
import type { SiteContent } from "@/lib/content/types";

/** Something that must be fixed before the creator's changes can be kept: where it is, and what to do. */
export interface Problem {
  /** The field's path, e.g. "projects.2.title" (a path ending in a list's name means the list as a whole). */
  path: string;
  message: string;
}

const blank = (v: unknown) => typeof v !== "string" || !v.trim();

/**
 * The things the site would otherwise quietly drop or break on: a project with no title, a client with no
 * name, two project types with the same name. Checked while editing so each one is shown beside its field.
 */
export function contentProblems(c: SiteContent): Problem[] {
  const out: Problem[] = [];

  c.projects.forEach((p, i) => {
    if (blank(p.title)) out.push({ path: `projects.${i}.title`, message: "Give this project a title." });
    if (!c.categories.includes(p.category) && p.category) out.push({ path: `projects.${i}.category`, message: "Choose one of the project types." });
  });

  c.services.forEach((s, i) => {
    if (blank(s.name)) out.push({ path: `services.${i}.name`, message: "Give this service a name." });
  });
  c.clients.forEach((x, i) => {
    if (blank(x.name)) out.push({ path: `clients.${i}.name`, message: "Give this client a name." });
  });
  c.collaborators.forEach((x, i) => {
    if (blank(x.name)) out.push({ path: `collaborators.${i}.name`, message: "Give this person a name." });
  });
  c.home.stats.forEach((s, i) => {
    if (blank(s.label)) out.push({ path: `home.stats.${i}.label`, message: "Add a short caption under the number." });
    if (!Number.isFinite(s.value) || s.value < 0) out.push({ path: `home.stats.${i}.value`, message: "Use a number of 0 or more." });
  });
  c.home.process.cards.forEach((card, i) => {
    if (blank(card.title)) out.push({ path: `home.process.cards.${i}.title`, message: "Give this card a title." });
  });
  c.breakdowns.forEach((b, i) => {
    if (blank(b.title)) out.push({ path: `breakdowns.${i}.title`, message: "Give this breakdown a title." });
  });

  c.site.social.forEach((l, i) => {
    if (blank(l.label)) out.push({ path: `site.social.${i}.label`, message: "Give this link a name." });
    if (blank(l.href) || !/^https?:\/\/[^\s]+$/i.test(l.href.trim())) out.push({ path: `site.social.${i}.href`, message: "Use a full web address that starts with https://" });
  });

  const seen = new Map<string, number>();
  c.categories.forEach((name, i) => {
    const key = name.trim().toLowerCase();
    if (!key) out.push({ path: `categories.${i}`, message: "A project type needs a name." });
    else if (name.trim().length > MAX_CATEGORY_LENGTH) out.push({ path: `categories.${i}`, message: `Keep it under ${MAX_CATEGORY_LENGTH} characters.` });
    else if (seen.has(key)) out.push({ path: `categories.${i}`, message: "Two project types can’t have the same name." });
    seen.set(key, i);
  });
  if (!c.categories.length) out.push({ path: "categories", message: "Keep at least one project type." });
  if (c.categories.length > MAX_CATEGORIES) out.push({ path: "categories", message: `The most is ${MAX_CATEGORIES} project types.` });

  return out;
}

/** Only the problems inside one part of the content (a list item, a section's fields…), by path prefix. */
export const problemsUnder = (all: Problem[], prefixes: string[]) => all.filter((p) => prefixes.some((x) => p.path === x || p.path.startsWith(x + ".")));
