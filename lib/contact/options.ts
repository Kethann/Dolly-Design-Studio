export interface ContactProjectOption {
  name: string;
  budgets: string[];
}

export const MAX_CONTACT_PROJECTS = 50;
export const MAX_CONTACT_BUDGETS = 30;
export const CONTACT_CHOICE_LENGTH = 100;

function choices(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap((item) => {
    if (typeof item !== "string") return [];
    const text = item.replace(/\u0000/g, "").trim().slice(0, CONTACT_CHOICE_LENGTH);
    const key = text.toLowerCase();
    if (!text || seen.has(key)) return [];
    seen.add(key);
    return [text];
  }).slice(0, limit);
}

/** Legacy shared ranges are copied into each type once; later edits travel with their own type. */
export function contactProjects(form: { projectOptions?: unknown; projectTypes?: unknown; budgets?: unknown }): ContactProjectOption[] {
  const shared = choices(form.budgets, MAX_CONTACT_BUDGETS);
  const fallback = shared.length ? shared : ["Not sure yet"];
  if (Array.isArray(form.projectOptions) && form.projectOptions.length) {
    const seen = new Set<string>();
    const projects = form.projectOptions.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const name = choices([item.name], 1)[0];
      if (!name || seen.has(name.toLowerCase())) return [];
      seen.add(name.toLowerCase());
      const budgets = choices(item.budgets, MAX_CONTACT_BUDGETS);
      return [{ name, budgets: budgets.length ? budgets : ["Not sure yet"] }];
    }).slice(0, MAX_CONTACT_PROJECTS);
    if (projects.length) return projects;
  }
  return choices(form.projectTypes, MAX_CONTACT_PROJECTS).map((name) => ({ name, budgets: [...fallback] }));
}

export function budgetsForProject(projects: readonly ContactProjectOption[], name: string): string[] {
  return projects.find((project) => project.name === name)?.budgets ?? [];
}
