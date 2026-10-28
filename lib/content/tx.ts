/** `data-t` marks a text the creator can restyle (font, size…): `<h2 {...tx("home.gallery.title")}>`. */
export const tx = (path: string) => ({ "data-t": path }) as const;
