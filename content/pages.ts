// ─────────────────────────────────────────────────────────────────────────────
// OTHER PAGES — the Work page, each project page, the "page not found" page,
// and the footer at the bottom of every page.
// ─────────────────────────────────────────────────────────────────────────────

/** /work — the full poster gallery. */
export const workPage = {
  /** Browser-tab title and search-engine description. */
  metaTitle: "Work",
  metaDescription: "Film publicity posters, title design and campaign art from Dolly Design Studio.",
  label: "Poster Gallery",
  title: "All work",
  /** The first filter button (the other buttons are the categories in types.ts). */
  allFilter: "All",
  /** The first language button. */
  allLanguages: "All languages",
  emptyCategory: "No projects in this category yet.",
};

/** /work/<project> — a single project. Its own text lives in projects.ts. */
export const projectPage = {
  backLink: "← Back to work",
  clientLabel: "Client",
  roleLabel: "Role",
};

/** Shown for any address that doesn't exist. */
export const notFoundPage = {
  code: "404",
  title: "This scene was cut.",
  body: "The page you’re looking for isn’t on the programme tonight.",
  homeLink: "Back to the stage",
};

/** Bottom of every page: "© <year> <studio name>. <rights>" */
export const footer = {
  rights: "All rights reserved.",
};

/** Small labels used in several places. */
export const sharedLabels = {
  /** Appears next to the pen cursor when hovering a poster. */
  posterHover: "Open",
};
