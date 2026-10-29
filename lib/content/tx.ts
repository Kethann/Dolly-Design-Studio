/** `data-t` marks a text the creator can restyle (font, size…): `<h2 {...tx("home.gallery.title")}>`. */
export const tx = (path: string) => ({ "data-t": path }) as const;

/**
 * Marks a whole section the creator can edit from the portal's live preview: "home:founder" is the page and the
 * section (the ids in app/portal/content-schema.ts). The preview shows an Edit button on it.
 */
export const edSection = (page: string, id: string, label: string) => ({ "data-ed-section": `${page}:${id}`, "data-ed-label": label }) as const;

/** Marks one item of a list (a poster, a service, a card…): `edItem("projects", 3, "Poster")`. The preview shows an Edit button on it. */
export const edItem = (list: string, index: number, label = "item") => ({ "data-ed-item": `${list}.${index}`, "data-ed-label": label }) as const;
